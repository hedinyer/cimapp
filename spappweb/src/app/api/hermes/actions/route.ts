import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { z } from "zod";
import {
  hasAdminAccess,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";
import { executeChatAction } from "@/lib/hermes/execute-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  id: z.string().trim().min(1).max(80),
  values: z.record(z.string(), z.unknown()).default({}),
  clave: z.string().trim().max(40).optional().default(""),
  motivo: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ ok: false });
    const session = await getIronSession<SessionData>(
      request,
      response,
      sessionOptions,
    );
    if (!hasAdminAccess(session)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado. Vuelve a iniciar sesión." },
        { status: 401 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    let payload: z.infer<typeof bodySchema>;
    let files: Record<string, File> | undefined;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      let values: unknown = {};
      try {
        values = JSON.parse(String(form.get("values") ?? "{}"));
      } catch {
        values = null;
      }
      const parsed = bodySchema.safeParse({
        id: form.get("id"),
        values,
        clave: form.get("clave"),
        motivo: form.get("motivo") || undefined,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Revisa los datos del formulario." },
          { status: 400 },
        );
      }
      payload = parsed.data;
      files = {};
      for (const [key, value] of form.entries()) {
        if (value instanceof File && value.size > 0) files[key] = value;
      }
    } else {
      const parsed = bodySchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { ok: false, error: "Revisa los datos del formulario." },
          { status: 400 },
        );
      }
      payload = parsed.data;
    }

    const result = await executeChatAction({ ...payload, files });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo completar la acción.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
