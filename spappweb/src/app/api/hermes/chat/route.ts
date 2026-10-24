import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { z } from "zod";
import {
  hasAdminAccess,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";
import { runAgentRound, type HermesMessage } from "@/lib/hermes/chat";
import {
  importMotoFactura,
  shouldImportMotoFactura,
} from "@/lib/hermes/import-moto-factura";
import type { ChatStreamEvent } from "@/lib/hermes/chat-events";
import { casoLine, casoTurn, casosEnPantallas, resolveCaso } from "@/lib/artifacts/caso";
import { listArtifacts } from "@/lib/artifacts/catalog";
import { isNavigationOnly, tabText } from "@/lib/artifacts/intent";
import { buildArtifactPrompt, type ArtifactPromptView } from "@/lib/artifacts/prompt";
import { getAdminClientReferralScope } from "@/lib/auth/admin-client-scope";
import { prepareClientTurn } from "@/lib/hermes/client-turn";
import type { ModuleId } from "@/lib/hermes/chat-events";
import { prepareModuleTurn } from "@/lib/hermes/module-turn";
import {
  isProductInventoryQuestion,
  prepareChatTurn,
} from "@/lib/hermes/prefetch-context";
import {
  prepareAttachments,
  type PreparedAttachments,
} from "@/lib/hermes/read-attachment";
import { buildHermesSystemPrompt } from "@/lib/hermes/ui-catalog";
import { approveCredit, rejectCredit } from "@/lib/actions/admin-actions";
import { decodeChatBody } from "@/lib/artifacts/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "tool"]),
        content: z.string().max(80_000),
      }),
    )
    .min(1)
    .max(40),
  artifacts: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        version: z.number(),
        state: z.unknown(),
        snapshot: z.string().max(4_000).optional(),
        actions: z
          .array(
            z.object({
              name: z.string(),
              description: z.string(),
              destructive: z.boolean().optional(),
              parameters: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .max(24),
      }),
    )
    .max(8)
    .optional(),
  caso: z
    .object({
      userId: z.number().int().positive(),
      nombre: z.string().max(120),
      cedula: z.string().max(32).nullable(),
      documentId: z.number().int().positive().nullable(),
    })
    .nullable()
    .optional(),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(180),
        mime: z.string().max(120).optional(),
        data: z.string().min(1).max(12_000_000),
      }),
    )
    .max(4)
    .optional(),
});

function withAttachments(
  messages: { role: "user" | "assistant"; content: string }[],
  prepared: PreparedAttachments | null,
): HermesMessage[] {
  if (!prepared) return messages;
  const next: HermesMessage[] = messages.map((message) => ({ ...message }));
  let index = -1;
  for (let cursor = next.length - 1; cursor >= 0; cursor -= 1) {
    if (next[cursor]?.role === "user") {
      index = cursor;
      break;
    }
  }
  if (index < 0) return next;
  const current = messages[index];
  if (!current) return next;
  const base = [current.content.trim(), prepared.context]
    .filter(Boolean)
    .join("\n\n");
  if (prepared.images.length === 0) {
    next[index] = { role: "user", content: base };
    return next;
  }
  next[index] = {
    role: "user",
    content: [
      { type: "text", text: base || "Revisa las imágenes adjuntas." },
      ...prepared.images.map((image) => ({
        type: "image_url" as const,
        image_url: { url: image.url },
      })),
    ],
  };
  return next;
}

export async function POST(request: NextRequest) {
  const probe = NextResponse.json({ ok: false });
  const session = await getIronSession<SessionData>(
    request,
    probe,
    sessionOptions,
  );
  if (!hasAdminAccess(session)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }

  let raw: unknown = null;
  try {
    raw = decodeChatBody(
      new Uint8Array(await request.arrayBuffer()),
      request.headers.get("content-encoding"),
    );
  } catch {
    raw = null;
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "El historial del chat no es válido." },
      { status: 400 },
    );
  }

  const files = parsed.data.files ?? [];
  const lastUser = [...parsed.data.messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUser || (!lastUser.content.trim() && files.length === 0)) {
    return NextResponse.json(
      { ok: false, error: "Escribe un mensaje o adjunta un archivo." },
      { status: 400 },
    );
  }

  let prepared: PreparedAttachments | null = null;
  if (files.length > 0) {
    try {
      prepared = await prepareAttachments(files);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo leer el archivo.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  }

  const encoder = new TextEncoder();
  const talk = parsed.data.messages.map((message) => ({
    role:
      message.role === "user" ? ("user" as const) : ("assistant" as const),
    content:
      message.role === "tool"
        ? `Resultado de herramienta:\n${message.content}`
        : message.content,
  }));
  const outbound = withAttachments(talk, prepared);
  const followUp = parsed.data.messages.at(-1)?.role === "tool";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };
      try {
        const caso =
          !followUp && lastUser
            ? resolveCaso(
                parsed.data.caso ?? null,
                lastUser.content,
                casosEnPantallas(parsed.data.artifacts ?? []),
              )
            : (parsed.data.caso ?? null);
        const decision =
          !followUp && lastUser ? casoTurn(lastUser.content, caso) : null;
        if (decision?.kind === "ask") {
          send({ type: "delta", text: decision.text });
          send({ type: "done" });
          return;
        }
        if (decision?.kind === "ficha" && caso) {
          send({
            type: "ui_call",
            callId: "open-creditos",
            act: { op: "open_artifact", args: { id: "creditos" } },
          });
          send({
            type: "ui_call",
            callId: "abrir-creditos",
            act: {
              op: "ui_action",
              args: {
                artifact: "creditos",
                action: "abrir",
                args: { userId: caso.userId, nombre: caso.nombre || "Cliente" },
              },
            },
          });
          send({ type: "delta", text: `Ahí está ${caso.nombre} en Créditos.` });
          send({ type: "done" });
          return;
        }
        if (decision && caso?.documentId && (decision.kind === "approve" || decision.kind === "reject")) {
          const result =
            decision.kind === "approve"
              ? await approveCredit(caso.documentId, caso.userId)
              : await rejectCredit({
                  documentId: caso.documentId,
                  userId: caso.userId,
                  motivo: decision.motivo,
                  betado: false,
                });
          send({
            type: "delta",
            text: result.ok
              ? decision.kind === "approve"
                ? `Listo. Aprobé el crédito de ${caso.nombre}.`
                : `Listo. Rechacé el crédito de ${caso.nombre}.`
              : result.error,
          });
          send({ type: "done" });
          return;
        }
        if (prepared?.context) {
          send({ type: "files", context: prepared.context });
        }
        let siteData: string | null = null;
        let panelLine: string | null = null;
        if (
          prepared?.context &&
          lastUser &&
          shouldImportMotoFactura(lastUser.content, prepared.context)
        ) {
          send({
            type: "tool",
            name: "supabase_sql",
            label: "Cargar factura en Supabase",
            status: "running",
          });
          try {
            siteData = await importMotoFactura(prepared.context, lastUser.content);
            send({
              type: "tool",
              name: "supabase_sql",
              label: "Cargar factura en Supabase",
              status: "done",
              detail: "Factura cargada",
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "No se pudo cargar la factura.";
            send({
              type: "tool",
              name: "supabase_sql",
              label: "Cargar factura en Supabase",
              status: "done",
              detail: message,
            });
            siteData = `Datos del sitio: no se pudo cargar la factura. ${message}`;
          }
        }
        const moduleTurn =
          !followUp && lastUser ? prepareModuleTurn(lastUser.content) : null;
        const navigation =
          !followUp && lastUser ? isNavigationOnly(lastUser.content) : false;
        if (
          !followUp &&
          lastUser &&
          isProductInventoryQuestion(lastUser.content) &&
          !navigation
        ) {
          send({
            type: "tool",
            name: "list_productos",
            label: "Inventario de productos",
            status: "running",
          });
          const turn = await prepareChatTurn(lastUser.content);
          send({
            type: "tool",
            name: "list_productos",
            label: "Inventario de productos",
            status: "done",
            detail: turn?.toolDetail ?? undefined,
          });
          siteData = turn?.siteData ?? null;
        }
        const earlier = parsed.data.messages
          .filter((message) => message !== lastUser && message.role !== "tool")
          .map((message) => message.content);
        const tab = !followUp && lastUser ? tabText(lastUser.content) : null;
        if (!followUp && !siteData && lastUser && !tab) {
          const clientTurn = await prepareClientTurn(lastUser.content, earlier);
          if (clientTurn) {
            send({
              type: "tool",
              name: "search_clients",
              label: "Ficha del cliente",
              status: "done",
              detail: clientTurn.toolDetail,
            });
            if (clientTurn.panel.kind === "client") {
              send({
                type: "ui_call",
                callId: "open-creditos",
                act: { op: "open_artifact", args: { id: "creditos" } },
              });
              send({
                type: "ui_call",
                callId: "abrir-creditos",
                act: {
                  op: "ui_action",
                  args: {
                    artifact: "creditos",
                    action: "abrir",
                    args: {
                      userId: clientTurn.panel.userId,
                      nombre: clientTurn.panel.displayName,
                    },
                  },
                },
              });
              send({
                type: "delta",
                text: `Ahí está ${clientTurn.panel.displayName} en Créditos.`,
              });
              send({ type: "done" });
              return;
            }
            siteData = clientTurn.siteData;
          }
        }
        const screen = moduleTurn
          ? moduleTurn.panel
          : !followUp &&
              lastUser &&
              isProductInventoryQuestion(lastUser.content)
            ? { id: "inventario" as ModuleId, title: "Inventario" }
            : null;
        if (screen?.id === "creditos" && tab) {
          const label =
            tab === "aceptada" ? "Aprobadas" : tab === "rechazada" ? "Rechazadas" : "Pendientes";
          send({
            type: "ui_call",
            callId: "open-0",
            act: { op: "open_artifact", args: { id: "creditos" } },
          });
          send({
            type: "ui_call",
            callId: "filtro-0",
            act: {
              op: "ui_action",
              args: { artifact: "creditos", action: "filtro", args: { estado: tab } },
            },
          });
          send({ type: "delta", text: `Créditos, pestaña ${label}.` });
          send({ type: "done" });
          return;
        }
        // ponytail: abre primero. El modelo actúa en la vuelta siguiente, cuando hay estado.
        if (screen && !navigation) {
          send({
            type: "ui_call",
            callId: "open-0",
            act: { op: "open_artifact", args: { id: screen.id } },
          });
          send({ type: "done" });
          return;
        }
        if (screen) {
          send({
            type: "tool",
            name: "abrir_pantalla",
            label: screen.title,
            status: "done",
            detail: screen.title,
          });
          send({
            type: "artifact_open",
            id: screen.id,
            title: screen.title,
          });
          if (!siteData && moduleTurn) siteData = moduleTurn.siteData;
          if (navigation) panelLine = `Ahí está ${screen.title}.`;
        }

        if (panelLine && navigation) {
          // ponytail: el evento files guarda los datos en el turno del usuario. Un evento memory cuando haya un segundo consumidor.
          if (siteData) send({ type: "files", context: siteData });
          send({ type: "delta", text: panelLine });
          send({ type: "done" });
          return;
        }

        const hideEquipo = Boolean(await getAdminClientReferralScope());
        const openArtifacts = (parsed.data.artifacts ?? []) as ArtifactPromptView[];
        for await (const chunk of runAgentRound([
          { role: "system", content: buildHermesSystemPrompt() },
          {
            role: "system",
            content: buildArtifactPrompt(listArtifacts(hideEquipo), openArtifacts),
          },
          ...(caso ? [{ role: "system" as const, content: casoLine(caso) }] : []),
          ...(siteData ? [{ role: "system" as const, content: siteData }] : []),
          ...outbound,
        ])) {
          if (chunk.type === "ui") {
            chunk.acts.forEach((act, index) => {
              send({
                type: "ui_call",
                callId: `ui-${index}`,
                act,
              });
            });
          } else if (chunk.type === "tool") {
            send({
              type: "tool",
              id: chunk.id,
              name: chunk.name,
              label: chunk.name === "supabase_sql" ? "Supabase" : chunk.name,
              status: chunk.status ?? "done",
              detail: chunk.detail,
            });
          } else if (chunk.type === "thought") {
            send({ type: "thought", text: chunk.text });
          } else if (chunk.type === "text" && chunk.text) {
            send({ type: "delta", text: chunk.text });
          }
        }
        send({ type: "done" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo consultar al asistente.";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
