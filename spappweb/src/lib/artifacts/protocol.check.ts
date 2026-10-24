import { gzipSync } from "node:zlib";
import { casoTurn, resolveCaso, type Caso } from "./caso.ts";
import { listArtifacts, matchArtifactQuery } from "./catalog.ts";
import { normalizeLibrary } from "./stored-chat.ts";
import { decodeChatBody } from "./wire.ts";
import { isNavigationOnly, mentionQuery, nameHint, searchText, slashQuery, tabText } from "./intent.ts";
import {
  isConfirmText,
  isDestructiveLabel,
  isUndoText,
  parseAssistantActs,
} from "./protocol.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const single = parseAssistantActs(
  'Listo.\n{"ui":"act","op":"open_artifact","args":{"id":"inventario"}}',
);
assert(single.acts.length === 1, "un act");
assert(single.acts[0]?.op === "open_artifact", "op");
assert(single.text === "Listo.", "texto visible");

const steps = parseAssistantActs(
  '{"ui":"act","steps":[{"op":"open_artifact","args":{"id":"caja"}},{"op":"ui_action","args":{"artifact":"caja","action":"abrir"}}]}',
);
assert(steps.acts.length === 2, "steps");
assert(steps.text === "", "sin texto");

const fence = parseAssistantActs(
  'Abro.\n```json\n{"ui":"act","op":"ui_click","args":{"artifact":"garaje","ref":"2"}}\n```',
);
assert(fence.acts[0]?.op === "ui_click", "fence");
assert(!fence.text.includes("ui"), "sin json");

const form = parseAssistantActs('{"ui":"form","id":"save_bike","values":{}}');
assert(form.acts.length === 0, "form no es act");

assert(isNavigationOnly("abre inventario"), "navegación");
assert(!isNavigationOnly("abre caja con 200000"), "con monto no es solo navegación");
assert(!isNavigationOnly("aprueba el credito de el"), "aprobar no es navegación");
assert(!isNavigationOnly("que solicitudes de credito tengo"), "pregunta no es navegación");
assert(nameHint("abre a mauricio perucho") === "mauricio perucho", "nombre");
assert(nameHint("aprueba el credito de el") === null, "de él no es nombre");
assert(nameHint("cedula 1098802247") === "1098802247", "cédula");
assert(searchText("creditos de mauricio") === "mauricio", "buscar nombre");
assert(searchText("que creditos hay") === null, "sin filtro");
assert(searchText("quiero ver los aprobados") === null, "aprobados no es búsqueda");
assert(tabText("quiero ver los aprobados") === "aceptada", "pestaña aprobados");
assert(tabText("abre inventario") === null, "sin pestaña");
assert(searchText("busca abc123 en garaje") === "abc123", "buscar placa");

const mauricio: Caso = {
  userId: 5,
  nombre: "Mauricio perucho",
  cedula: "1098802247",
  documentId: 9,
};
assert(casoTurn("aprueba el credito de el", null)?.kind === "ask", "sin caso");
assert(casoTurn("aprueba el credito de el", mauricio)?.kind === "approve", "aprueba");
assert(casoTurn("rechaza el credito", mauricio)?.kind === "ask", "sin motivo");
const rejected = casoTurn("rechaza el credito porque no tiene fiador", mauricio);
assert(rejected?.kind === "reject" && rejected.motivo === "no tiene fiador", "motivo");
assert(casoTurn("abre la solicitud", mauricio)?.kind === "ficha", "abre la suya");
assert(casoTurn("abre la solicitud", null) === null, "sin caso abre la lista");
assert(casoTurn("abre inventario", mauricio) === null, "otra pantalla");
const filled = resolveCaso(
  { ...mauricio, documentId: null },
  "aprueba",
  [{ ...mauricio }],
);
assert(filled?.documentId === 9, "documentId de la fila");
assert(isConfirmText("sí"), "sí");
assert(isUndoText("deshacer"), "deshacer");
assert(isDestructiveLabel("Eliminar producto"), "destructiva");
assert(slashQuery("/caja") === "caja", "slash");
assert(matchArtifactQuery(false, "caja")[0]?.id === "caja", "slash caja");
assert(mentionQuery("hola @ju") === "ju", "mención");

const all = listArtifacts(false);
assert(all.some((item) => item.id === "inventario"), "inventario");
assert(all.some((item) => item.id === "caja"), "caja");
assert(all.some((item) => item.id === "vender"), "vender");
assert(all.some((item) => item.id === "garaje"), "garaje");
assert(all.some((item) => item.id === "taller"), "taller");
assert(all.some((item) => item.id === "credito-calle"), "calle");
assert(!listArtifacts(true).some((item) => item.id === "equipo"), "sin equipo");

const packed = gzipSync(Buffer.from(JSON.stringify({ ok: 1 })));
const back = decodeChatBody(packed, "gzip") as { ok: number };
assert(back.ok === 1, "gzip");
assert(
  (decodeChatBody(Buffer.from('{"ok":2}'), null) as { ok: number }).ok === 2,
  "json plano",
);

const viejo = normalizeLibrary({
  messages: [{ id: "1", role: "user", content: "abre caja" }],
  openIds: ["caja"],
  caso: null,
});
assert(viejo?.activeId === "inicial" && viejo.chats.length === 1, "hilo viejo");
const biblioteca = normalizeLibrary({
  activeId: "b",
  chats: [
    { id: "a", title: "A", messages: [], openIds: [], caso: null },
    { id: "b", title: "B", messages: [{ id: "2", role: "user", content: "hola" }], openIds: [], caso: null },
  ],
});
assert(biblioteca?.activeId === "b" && biblioteca.chats.length === 2, "chat activo");
assert(normalizeLibrary({ chats: [] }) === null, "sin chats");

console.log("artifacts.check OK");
