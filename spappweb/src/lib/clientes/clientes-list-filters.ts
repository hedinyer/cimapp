import {
  COMPRA_ESTADO_LABELS,
  type ClientSearchResult,
  type MotoCompraEstado,
} from "@/lib/pipeline/types";

export type ClienteSituacionFilter =
  | "all"
  | "al_dia"
  | "atraso"
  | "recogida"
  | "vigilado"
  | "cancelado";

export type ClienteCompraFilter = "all" | MotoCompraEstado;

export type ClientesListFilters = {
  situacion: ClienteSituacionFilter;
  compraEstado: ClienteCompraFilter;
  fechaDesde: string;
  fechaHasta: string;
};

export const DEFAULT_CLIENTES_FILTERS: ClientesListFilters = {
  situacion: "all",
  compraEstado: "all",
  fechaDesde: "",
  fechaHasta: "",
};

export const SITUACION_FILTER_OPTIONS: {
  value: ClienteSituacionFilter;
  label: string;
}[] = [
  { value: "all", label: "Toda situación" },
  { value: "al_dia", label: "Al día" },
  { value: "atraso", label: "En atraso" },
  { value: "recogida", label: "Moto recogida" },
  { value: "vigilado", label: "Vigilados" },
  { value: "cancelado", label: "Cancelados" },
];

export const COMPRA_FILTER_OPTIONS: {
  value: ClienteCompraFilter;
  label: string;
}[] = [
  { value: "all", label: "Todo estado" },
  ...(Object.entries(COMPRA_ESTADO_LABELS) as [MotoCompraEstado, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
];

function fechaVentaDay(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

export function hasActiveClientesFilters(filters: ClientesListFilters): boolean {
  return (
    filters.situacion !== "all" ||
    filters.compraEstado !== "all" ||
    filters.fechaDesde !== "" ||
    filters.fechaHasta !== ""
  );
}

/** Saldo que cuenta en cartera en mora (excluye recogidas/retenidas y cancelados). */
export function montoCarteraEnMora(client: ClientSearchResult): number {
  if (client.compraEstado === "cancelada") return 0;
  if (client.motoRecogida) return 0;
  if (client.diasAtraso <= 0) return 0;
  return client.montoAdeudado;
}

/** Vigilados → mora ↓ → recogidos → cancelados. */
export function compareClientSearchResults(
  a: ClientSearchResult,
  b: ClientSearchResult,
): number {
  const tier = (c: ClientSearchResult) => {
    if (c.compraEstado === "cancelada") return 3;
    if (c.motoRecogida) return 2;
    if (c.vigilado) return 0;
    return 1;
  };
  const ta = tier(a);
  const tb = tier(b);
  if (ta !== tb) return ta - tb;
  if (b.diasAtraso !== a.diasAtraso) return b.diasAtraso - a.diasAtraso;
  const aAt = a.seleccionadoAt ? new Date(a.seleccionadoAt).getTime() : 0;
  const bAt = b.seleccionadoAt ? new Date(b.seleccionadoAt).getTime() : 0;
  return bAt - aAt;
}

export function filterClientSearchResults(
  clients: ClientSearchResult[],
  filters: ClientesListFilters,
): ClientSearchResult[] {
  const filtered = !hasActiveClientesFilters(filters)
    ? clients
    : clients.filter((client) => {
        switch (filters.situacion) {
          case "al_dia":
            if (
              client.compraEstado === "cancelada" ||
              client.motoRecogida ||
              client.diasAtraso > 0
            ) {
              return false;
            }
            break;
          case "atraso":
            if (
              client.compraEstado === "cancelada" ||
              client.motoRecogida ||
              client.diasAtraso <= 0
            ) {
              return false;
            }
            break;
          case "recogida":
            if (!client.motoRecogida || client.compraEstado === "cancelada") {
              return false;
            }
            break;
          case "vigilado":
            if (!client.vigilado) return false;
            break;
          case "cancelado":
            if (client.compraEstado !== "cancelada") return false;
            break;
          default:
            break;
        }

        if (
          filters.compraEstado !== "all" &&
          client.compraEstado !== filters.compraEstado
        ) {
          return false;
        }

        const day = fechaVentaDay(client.fechaVenta);
        if (filters.fechaDesde) {
          if (!day || day < filters.fechaDesde) return false;
        }
        if (filters.fechaHasta) {
          if (!day || day > filters.fechaHasta) return false;
        }

        return true;
      });

  return [...filtered].sort(compareClientSearchResults);
}
