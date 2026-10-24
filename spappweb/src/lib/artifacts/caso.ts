import { fold, nameHint } from "@/lib/artifacts/intent";

export type Caso = {
  userId: number;
  nombre: string;
  cedula: string | null;
  documentId: number | null;
};

export type CasoTurn =
  | { kind: "approve" }
  | { kind: "reject"; motivo: string }
  | { kind: "ask"; text: string }
  | { kind: "ficha" };

export const CASO_EVENT = "ai-caso";

export function parseCaso(value: unknown): Caso | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const userId = Number(row.userId);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const documentId = row.documentId == null ? null : Number(row.documentId);
  return {
    userId,
    nombre: String(row.nombre ?? "").slice(0, 120),
    cedula: row.cedula == null || row.cedula === "" ? null : String(row.cedula).slice(0, 32),
    documentId:
      documentId != null && Number.isInteger(documentId) && documentId > 0
        ? documentId
        : null,
  };
}

export function mergeCaso(prev: Caso | null, next: Caso): Caso {
  if (!prev || prev.userId !== next.userId) return next;
  return {
    userId: next.userId,
    nombre: next.nombre || prev.nombre,
    cedula: next.cedula ?? prev.cedula,
    documentId: next.documentId ?? prev.documentId,
  };
}

export function publishCaso(caso: Caso) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CASO_EVENT, { detail: caso }));
}

export function casosEnPantallas(views: { id: string; state: unknown }[]): Caso[] {
  const screen = views.find((view) => view.id === "creditos");
  if (!screen || !screen.state || typeof screen.state !== "object") return [];
  const rows = (screen.state as { solicitudes?: unknown }).solicitudes;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const caso = parseCaso(row);
    return caso ? [caso] : [];
  });
}

export function resolveCaso(
  caso: Caso | null,
  question: string,
  rows: Caso[],
): Caso | null {
  const ready = rows.filter((row) => row.documentId);
  const hint = nameHint(question);
  if (hint) {
    const folded = fold(hint);
    const hit = ready.find(
      (row) =>
        fold(row.nombre).includes(folded) ||
        folded.includes(fold(row.nombre)) ||
        row.cedula === hint ||
        String(row.userId) === hint,
    );
    if (hit) return hit;
  }
  if (caso?.userId) {
    const same = ready.find((row) => row.userId === caso.userId);
    if (!same) return caso;
    return {
      ...caso,
      nombre: caso.nombre || same.nombre,
      cedula: caso.cedula ?? same.cedula,
      documentId: caso.documentId ?? same.documentId,
    };
  }
  if (ready.length === 1) return ready[0] ?? null;
  return caso;
}

function motivoDe(question: string): string {
  const match = question.match(/\b(?:porque|por que|motivo)\b[:\s]*(.+)$/i);
  return (match?.[1] ?? "").trim();
}

export function casoTurn(question: string, caso: Caso | null): CasoTurn | null {
  const text = fold(question);
  const approve = /\b(aprueba|aprobar)\b/.test(text);
  const reject = /\b(rechaza|rechazar)\b/.test(text);
  if (approve || reject) {
    if (!caso?.userId || !caso.documentId) return { kind: "ask", text: "¿Cuál solicitud?" };
    if (reject) {
      const motivo = motivoDe(question);
      if (motivo.length < 3) return { kind: "ask", text: "¿Cuál es el motivo?" };
      return { kind: "reject", motivo };
    }
    return { kind: "approve" };
  }
  if (!caso?.userId) return null;
  if (!/^(abre|abrir|muestra|mostrar|ver)\b/.test(text)) return null;
  if (!/\b(la solicitud|su solicitud|el credito|su credito)\b/.test(text)) return null;
  if (nameHint(question)) {
    const hint = fold(nameHint(question) ?? "");
    const named =
      fold(caso.nombre).includes(hint) ||
      hint.includes(fold(caso.nombre)) ||
      caso.cedula === nameHint(question);
    if (!named) return null;
  }
  return { kind: "ficha" };
}

export function casoLine(caso: Caso): string {
  return `Caso activo: ${caso.nombre}. userId ${caso.userId}. cédula ${caso.cedula ?? "sin cédula"}. documentId ${caso.documentId ?? "sin documento"}. Él y la solicitud son este caso.`;
}
