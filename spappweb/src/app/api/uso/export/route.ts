import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import {
  hasAdminAccess,
  sessionOptions,
  type SessionData,
} from "@/lib/auth/session";
import { exportarTrayectorias } from "@/lib/uso/registrar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ ok: false });
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions,
  );
  if (!hasAdminAccess(session)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const trayectorias = await exportarTrayectorias(
    Number.isFinite(limit) ? limit : 50,
  );
  const filas = Array.isArray(trayectorias) ? trayectorias : [];
  const cuerpo = filas.map((fila) => JSON.stringify(fila)).join("\n");
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": "attachment; filename=uso-all4cfl.jsonl",
    },
  });
}
