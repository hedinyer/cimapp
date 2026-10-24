import type { Caso } from "@/lib/artifacts/caso";
import type { ArtifactPromptView } from "@/lib/artifacts/prompt";
import { searchText, tabText } from "@/lib/artifacts/intent";
import type { UiAct } from "@/lib/artifacts/protocol";
import type { UiResult } from "@/components/artifacts/artifact-runtime";
import type {
  ChatPanel,
  ChatStreamEvent,
  ModuleId,
  ToolTrace,
} from "@/lib/hermes/chat-events";

const CLIENT_TIMEOUT_MS = 300_000;
const MAX_ROUNDS = 4;

type HistoryMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
};

function questionOf(history: HistoryMessage[]): string {
  return [...history].reverse().find((message) => message.role === "user")?.content ?? "";
}

function refOf(snapshot: string, name: RegExp): string | null {
  for (const line of snapshot.split("\n")) {
    const match = line.match(/^\[(\d+)\].*textbox "([^"]*)"/i);
    if (match && name.test(match[2] ?? "")) return match[1];
  }
  return null;
}

/** «El chasis es …» en una ficha abierta. Sin modelo. */
function fieldFills(
  question: string,
  views: ArtifactPromptView[],
): UiAct[] | null {
  const re = /\b(chasis|serial(?:\s+del\s+motor)?)\s*(?:es|:)?\s*([a-z0-9]{6,})/gi;
  const found: { name: RegExp; value: string; raw: string }[] = [];
  for (const match of question.matchAll(re)) {
    const label = match[1] ?? "";
    found.push({
      name: label.toLowerCase().startsWith("serial") ? /serial/i : /chasis/i,
      value: match[2] ?? "",
      raw: match[0],
    });
  }
  if (!found.length) return null;
  let left = question;
  for (const item of found) left = left.replace(item.raw, " ");
  left = left
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\b(el|la|y|del|de|motor|es|un|una)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (left) return null;
  const acts: UiAct[] = [];
  for (const item of found) {
    const view = views.find((candidate) => refOf(candidate.snapshot ?? "", item.name));
    const ref = view ? refOf(view.snapshot ?? "", item.name) : null;
    if (!view || !ref) return null;
    acts.push({
      op: "ui_fill",
      args: { artifact: view.id, ref, value: item.value },
    });
  }
  return acts;
}

async function driveScreen(
  input: {
    artifacts: () => ArtifactPromptView[];
    execute: (act: UiAct) => Promise<UiResult>;
  },
  history: HistoryMessage[],
  onlyId?: string,
) {
  const question = questionOf(history);
  const tab = tabText(question);
  const query = tab ? null : searchText(question);
  if (!tab && !query) return;
  const views = input.artifacts().filter((view) => !onlyId || view.id === onlyId);
  for (const view of views) {
    if (tab && view.actions.some((action) => action.name === "filtro")) {
      await input.execute({
        op: "ui_action",
        args: { artifact: view.id, action: "filtro", args: { estado: tab } },
      });
    }
    if (query && view.actions.some((action) => action.name === "buscar")) {
      await input.execute({
        op: "ui_action",
        args: { artifact: view.id, action: "buscar", args: { texto: query } },
      });
    }
  }
  if (tab || query) await new Promise((resolve) => setTimeout(resolve, 60));
}

function noteOf(op: string, result: UiResult): string {
  return JSON.stringify({
    op,
    ok: result.ok,
    error: result.error,
    detail: result.detail,
  }).slice(0, 800);
}

/** Anuncio de un alta. «Aprobadas» no cuenta: es una pestaña, no un guardado. */
function claimsWrite(text: string): boolean {
  return /\b(guardo|guard[eé]|guardad[oa]s?|registr[eé]|registrad[oa]s?|apruebo|aprob[eé]|cargu[eé]|cargad[oa]s?|actualizo|actualic[eé]|actualizad[oa]s?|ya qued[oó])\b/i.test(
    text,
  );
}

function noteBacksWrite(note: string): boolean {
  try {
    const parsed = JSON.parse(note) as { ok?: boolean; op?: string };
    if (parsed.ok !== true) return false;
    return parsed.op !== "open_artifact" && parsed.op !== "close_artifact";
  } catch {
    return false;
  }
}

type FilePayload = {
  name: string;
  mime: string;
  data: string;
};

export async function cycleChat(input: {
  history: HistoryMessage[];
  files?: FilePayload[];
  artifacts: () => ArtifactPromptView[];
  caso: () => Caso | null;
  execute: (act: UiAct) => Promise<UiResult>;
  onText: (text: string) => void;
  onThought: (text: string) => void;
  onTool: (tool: ToolTrace) => void;
  onOpen: (id: ModuleId, title: string) => void;
  onPanel: (panel: ChatPanel) => void;
  onFiles: (context: string) => void;
}): Promise<{ text: string; confirm: string | null; memory: string }> {
  let history = input.history;
  let committed = "";
  let confirm: string | null = null;

  const stated = fieldFills(questionOf(input.history), input.artifacts());
  if (stated) {
    const lines: string[] = [];
    for (const [index, act] of stated.entries()) {
      input.onTool({
        id: `ui-fill-${index}`,
        name: act.op,
        label: act.op,
        status: "running",
      });
      const result = await input.execute(act);
      input.onTool({
        id: `ui-fill-${index}`,
        name: act.op,
        label: act.op,
        status: "done",
        detail: result.error || result.detail,
      });
      lines.push(result.ok ? result.detail || "Listo." : result.error || "No pude escribirlo.");
    }
    const text = lines.join(" ");
    input.onText(text);
    return { text, confirm: null, memory: text };
  }

  const memory: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (round === 0) await driveScreen(input, history);
    const response = await postChat(
      {
        // ponytail: el esquema admite 40. La pantalla puede guardar más.
        messages: history.slice(-40),
        files: round === 0 ? input.files : undefined,
        artifacts: input.artifacts(),
        caso: input.caso(),
      },
      AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error || "No se pudo consultar al asistente.");
    }
    if (!response.ok || !response.body) {
      throw new Error("No se pudo consultar al asistente.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    const acts: UiAct[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame
          .split("\n")
          .map((item) => item.trim())
          .find((item) => item.startsWith("data:"));
        if (!line) continue;
        const event = JSON.parse(line.slice(5).trim()) as ChatStreamEvent;
        if (event.type === "tool") {
          input.onTool({
            id: event.id,
            name: event.name,
            label: event.label,
            status: event.status,
            detail: event.detail,
          });
        } else if (event.type === "thought") {
          input.onThought(event.text);
        } else if (event.type === "artifact_open") {
          input.onOpen(event.id, event.title);
        } else if (event.type === "panel") {
          input.onPanel(event.panel);
        } else if (event.type === "files") {
          input.onFiles(event.context);
        } else if (event.type === "ui_call") {
          acts.push(event.act);
        } else if (event.type === "delta") {
          full += event.text;
          input.onText(`${committed}${full}`);
        } else if (event.type === "error") {
          throw new Error(event.error);
        }
      }
    }

    const notes: string[] = [];
    for (const [index, act] of acts.entries()) {
      input.onTool({
        id: `ui-${round}-${index}`,
        name: act.op,
        label: act.op,
        status: "running",
      });
      const result = await input.execute(act);
      input.onTool({
        id: `ui-${round}-${index}`,
        name: act.op,
        label: act.op,
        status: "done",
        detail: result.error || result.detail,
      });
      if (result.needsConfirm) {
        confirm = result.error || "Escribe sí para continuar.";
        notes.push(confirm);
        break;
      }
      notes.push(noteOf(act.op, result));
      if (act.op === "open_artifact" && result.ok) {
        await driveScreen(input, history, String(act.args.id ?? ""));
      }
    }
    const note = notes.join("\n");
    const ok = notes.some(noteBacksWrite);
    const claimed = claimsWrite(full);
    if (!confirm && claimed && !ok) {
      if (!committed.includes("No quedó guardado.")) {
        committed = `${committed}No quedó guardado.\n`;
      }
      input.onText(committed.trim());
      const correction = [
        "No quedó guardado. El texto no guarda datos.",
        note,
        "Emite el act de la pantalla o pregunta solo el campo que falta.",
      ]
        .filter(Boolean)
        .join("\n");
      memory.push(correction);
      history = [
        ...history,
        { role: "assistant", content: "No quedó guardado." },
        { role: "tool", content: correction },
      ];
      continue;
    }
    if (full && !(confirm && claimed)) committed = `${committed}${full}\n`;
    if (note) memory.push(note);
    if (acts.length === 0) break;
    history = [
      ...history,
      { role: "assistant", content: full || "Listo." },
      { role: "tool", content: note },
    ];
    if (confirm || full.trim() || round > 0) break;
  }

  return {
    text: committed.trim(),
    confirm,
    memory: memory.join("\n").slice(0, 12_000),
  };
}

// ponytail: gzip over 1.2kb. Plain below that. SSE stays uncompressed so tokens arrive live.
async function postChat(body: unknown, signal: AbortSignal): Promise<Response> {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let payload: BodyInit = json;
  if (json.length > 1200 && typeof CompressionStream !== "undefined") {
    payload = await new Response(
      new Blob([new TextEncoder().encode(json)])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    headers["Content-Encoding"] = "gzip";
  }
  return fetch("/api/hermes/chat", { method: "POST", headers, body: payload, signal });
}
