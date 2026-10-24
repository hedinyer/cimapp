export type ToolTrace = {
  id?: string;
  name: string;
  label: string;
  status: "running" | "done";
  detail?: string;
};

export type InventoryProduct = {
  id: number;
  nombre: string;
  sku: string;
  imagenUrl: string | null;
  soluciones: number;
  bera: number;
  bodega: number;
  total: number;
  activo: boolean;
};

export type InventoryCategory = {
  name: string;
  products: InventoryProduct[];
};

export type InventoryPanel = {
  kind: "inventory";
  focus: "all" | "category" | "product";
  focusName?: string;
  categories: InventoryCategory[];
};

export type ClientListItem = {
  userId: number;
  displayName: string;
  cedula: string | null;
  placa: string | null;
  motoLabel: string | null;
};

export type ClientPanel = {
  kind: "client";
  userId: number;
  displayName: string;
};

export type ClientsPanel = {
  kind: "clients";
  query: string;
  items: ClientListItem[];
};

export const MODULE_IDS = [
  "creditos",
  "hoy",
  "clientes",
  "historial-pagos",
  "catalogo",
  "garaje",
  "contado",
  "historial-patio",
  "credito-calle",
  "tarjetas",
  "vender",
  "caja",
  "historial-ventas",
  "inventario",
  "taller",
  "sebastian",
  "mecanicos",
  "equipo",
  "solicitudes-taller",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export type ModulePanel = {
  kind: "module";
  id: ModuleId;
  title: string;
};

export type ChatPanel = InventoryPanel | ClientPanel | ClientsPanel | ModulePanel;

export type ChatStreamEvent =
  | ({ type: "tool" } & ToolTrace)
  | { type: "panel"; panel: ChatPanel }
  | { type: "artifact_open"; id: ModuleId; title: string }
  | {
      type: "ui_call";
      callId: string;
      act: import("@/lib/artifacts/protocol").UiAct;
    }
  | { type: "thought"; text: string }
  | { type: "delta"; text: string }
  | { type: "files"; context: string }
  | { type: "done" }
  | { type: "error"; error: string };
