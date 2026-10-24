import type { ModuleId, ModulePanel } from "@/lib/hermes/chat-events";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

const RULES: { id: ModuleId; title: string; test: RegExp }[] = [
  {
    id: "inventario",
    title: "Inventario",
    test: /\binventario\b|repuesto/,
  },
  {
    id: "credito-calle",
    title: "Crédito en calle",
    test: /credito en calle|\ben calle\b/,
  },
  {
    id: "historial-patio",
    title: "Historial patio",
    test: /historial patio|motos vendidas/,
  },
  {
    id: "contado",
    title: "Contado",
    test: /venta contado|\bcontado\b/,
  },
  {
    id: "historial-pagos",
    title: "Historial de pagos",
    test: /historial de pagos|historial pagos/,
  },
  {
    id: "historial-ventas",
    title: "Historial de ventas",
    test: /historial de ventas|historial ventas|\bhistorial\b/,
  },
  {
    id: "solicitudes-taller",
    title: "Solicitudes de taller",
    test: /solicitud\w* de taller|taller.*solicitud/,
  },
  {
    id: "creditos",
    title: "Solicitudes de crédito",
    test: /solicitud|\bcredito\b/,
  },
  { id: "sebastian", title: "Sebastian", test: /sebastian/ },
  { id: "mecanicos", title: "Mecánicos", test: /mecanico/ },
  { id: "taller", title: "Taller", test: /\btaller\b|\btablero\b/ },
  { id: "tarjetas", title: "Tarjetas", test: /tarjeta/ },
  { id: "garaje", title: "Garaje", test: /garaje|\bpatio\b/ },
  { id: "catalogo", title: "Referencia", test: /referencia|catalogo/ },
  { id: "caja", title: "Caja", test: /\bcaja\b/ },
  { id: "vender", title: "Vender", test: /\bvender\b|\bventa\b/ },
  { id: "hoy", title: "Hoy", test: /\bhoy\b|bandeja|\binbox\b/ },
  { id: "clientes", title: "Clientes", test: /\bclientes\b/ },
  { id: "equipo", title: "Equipo", test: /equipo|visitador/ },
];

export function matchModule(question: string): ModulePanel | null {
  const text = fold(question);
  const rule = RULES.find((item) => item.test.test(text));
  if (!rule) return null;
  return { kind: "module", id: rule.id, title: rule.title };
}

export function prepareModuleTurn(question: string): {
  panel: ModulePanel;
  toolDetail: string;
  siteData: string;
} | null {
  const panel = matchModule(question);
  if (!panel) return null;
  return {
    panel,
    toolDetail: panel.title,
    siteData: `Datos del sitio: la pantalla ${panel.title} está abierta. Responde lo que pidió con ese contexto.`,
  };
}
