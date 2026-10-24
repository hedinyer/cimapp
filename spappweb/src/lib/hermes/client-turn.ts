import "server-only";

import { nameHint } from "@/lib/artifacts/intent";
import type { ClientPanel, ClientsPanel } from "@/lib/hermes/chat-events";
import type { ClientSearchResult } from "@/lib/pipeline/types";

const STOP = new Set([
  "datos",
  "del",
  "de",
  "la",
  "el",
  "los",
  "las",
  "cliente",
  "clientes",
  "solicitud",
  "solicitudes",
  "credito",
  "pendiente",
  "pendientes",
  "dame",
  "muestra",
  "mostrar",
  "ver",
  "quiero",
  "informacion",
  "ficha",
  "hoja",
  "vida",
  "aqui",
  "tienes",
  "sobre",
  "abre",
  "abrir",
  "por",
  "favor",
  "cual",
  "es",
  "son",
  "un",
  "una",
  "para",
  "con",
  "que",
  "me",
  "lo",
  "le",
  "al",
  "en",
  "su",
  "sus",
  "este",
  "esta",
  "detalle",
  "detalles",
  "modulo",
  "taller",
  "hoy",
  "bandeja",
  "lista",
  "listado",
  "hay",
  "llamado",
  "llama",
  "dejame",
  "deja",
  "card",
  "cards",
]);

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function wordsOf(folded: string): string[] {
  return folded
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

function namedClientQuery(question: string): string | null {
  const cedula = question.match(/\b\d{6,12}\b/);
  if (cedula) return cedula[0];
  const folded = fold(question);
  if (!/cliente|solicitud|credito|cedula|ficha|pipeline/.test(folded)) return null;
  const words = wordsOf(folded);
  if (words.length === 0) return null;
  return words.slice(0, 4).join(" ");
}

/** Nombre dicho antes, no una pregunta de lista («qué solicitudes hay»). */
function personQuery(question: string): string | null {
  const cedula = question.match(/\b\d{6,12}\b/);
  if (cedula) return cedula[0];
  const folded = fold(question);
  if (!/cliente|cedula|ficha/.test(folded)) return null;
  const words = wordsOf(folded);
  if (words.length === 0) return null;
  return words.slice(0, 4).join(" ");
}

const ANAPHORA =
  /\b(?:la|el|esa|ese|esta|este) (?:solicitud|card|ficha|cliente|credito)\b|\bde el\b|\bde ella\b/;

/** Texto para buscar un cliente. Null si la pregunta no pide una ficha. */
export function clientLookupQuery(
  question: string,
  earlier: string[] = [],
): string | null {
  const direct = namedClientQuery(question);
  if (direct && !ANAPHORA.test(fold(question))) return direct;
  const hinted = nameHint(question);
  if (hinted && !ANAPHORA.test(fold(question))) return hinted;
  // ponytail: «de él» hereda el nombre anterior; una lista sin anáfora no
  if (!ANAPHORA.test(fold(question))) return null;
  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    const prior = personQuery(earlier[index] ?? "");
    if (prior) return prior;
  }
  return null;
}

export function demoClientLookup(): void {
  const earlier = [
    "qué solicitudes tengo pendientes",
    "no, me refiero a solicitudes de credito",
    "datos del cliente Mauricio Perucho",
    "qué solicitudes de crédito hay",
  ];
  const card = clientLookupQuery("quiero ver la card de la solicitud", earlier);
  if (card !== "mauricio perucho") throw new Error(`card: ${card}`);
  const seen = clientLookupQuery("dejame ver la solicitud", earlier);
  if (seen !== "mauricio perucho") throw new Error(`seen: ${seen}`);
  const list = clientLookupQuery("qué solicitudes de crédito hay", earlier);
  if (list !== null) throw new Error(`list: ${list}`);
  const direct = clientLookupQuery("datos del cliente Mauricio Perucho");
  if (direct !== "mauricio perucho") throw new Error(`direct: ${direct}`);
  const opened = clientLookupQuery("abre al cliente Mauricio Perucho");
  if (opened !== "mauricio perucho") throw new Error(`opened: ${opened}`);
  const early = clientLookupQuery("dejame ver la solicitud", [
    "qué solicitudes tengo pendientes",
  ]);
  if (early !== null) throw new Error(`early: ${early}`);
}

function pickClient(
  results: ClientSearchResult[],
  query: string,
): ClientSearchResult | null {
  if (results.length === 1) return results[0] ?? null;
  const words = fold(query).split(/\s+/).filter(Boolean);
  const strong = results.filter((item) => {
    const name = fold(
      `${item.displayName} ${item.cedula ?? ""} ${item.placa ?? ""}`,
    );
    return words.every((word) => name.includes(word));
  });
  return strong.length === 1 ? (strong[0] ?? null) : null;
}

export async function prepareClientTurn(question: string, earlier: string[] = []): Promise<{
  panel: ClientPanel | ClientsPanel;
  toolDetail: string;
  siteData: string;
} | null> {
  const query = clientLookupQuery(question, earlier);
  if (!query) return null;
  const { searchClients } = await import("@/lib/pipeline/queries");
  const results = await searchClients(query);
  if (results.length === 0) {
    return {
      panel: { kind: "clients", query, items: [] },
      toolDetail: "Sin coincidencias",
      siteData: `Datos del sitio: no hay un cliente que coincida con «${query}».`,
    };
  }
  const chosen = pickClient(results, query);
  if (!chosen) {
    const items = results.slice(0, 8).map((item) => ({
      userId: item.userId,
      displayName: item.displayName,
      cedula: item.cedula,
      placa: item.placa,
      motoLabel: item.motoLabel,
    }));
    return {
      panel: { kind: "clients", query, items },
      toolDetail: `${results.length} clientes`,
      siteData: [
        `Datos del sitio: ${items.length} clientes coinciden con «${query}». La línea 2 es el segundo. No inventes cédulas.`,
        ...results.slice(0, 8).map(
          (item, index) =>
            `${index + 1}. ${item.displayName} userId ${item.userId} cédula ${item.cedula ?? "sin cédula"} placa ${item.placa ?? "sin placa"} moto ${item.motoLabel ?? "sin moto"} saldo ${item.montoAdeudado}`,
        ),
      ].join("\n"),
    };
  }
  return {
    panel: {
      kind: "client",
      userId: chosen.userId,
      displayName: chosen.displayName,
    },
    toolDetail: chosen.displayName,
    siteData: [
      `Datos del sitio: ${chosen.displayName}. userId ${chosen.userId}. cédula ${chosen.cedula ?? "sin cédula"}. placa ${chosen.placa ?? "sin placa"}. moto ${chosen.motoLabel ?? "sin moto"}.`,
      `Cuotas pagadas ${chosen.cuotasPagadas}. Atraso ${chosen.diasAtraso} días. Saldo ${chosen.montoAdeudado}. Estado ${chosen.compraEstado ?? "sin compra"}.`,
      "Responde con estos datos. No inventes cédula ni saldo.",
    ].join(" "),
  };
}
