import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { z } from "zod";
import {
  hasAdminAccess,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";
import { registrarUso } from "@/lib/uso/registrar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventoSchema = z.object({
  tipo: z.enum(["vista", "clic", "mensaje", "accion"]),
  nombre: z.string().trim().max(400).default(""),
  ruta: z.string().trim().max(200).default("/"),
  ok: z.boolean().optional(),
  detalle: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  eventos: z.array(eventoSchema).max(30),
});

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions,
  );
  if (!hasAdminAccess(session)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await registrarUso(parsed.data.eventos);
  return response;
}
