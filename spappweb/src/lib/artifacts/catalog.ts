import { navGroupsForAdminScope } from "@/components/layout/admin-nav-links";
import { fold } from "@/lib/artifacts/intent";
import { MODULE_IDS, type ModuleId } from "@/lib/hermes/chat-events";

const HREF_MODULE: Record<string, ModuleId> = {
  "/inbox": "hoy",
  "/clientes": "clientes",
  "/historial-pagos": "historial-pagos",
  "/catalogo": "catalogo",
  "/garaje": "garaje",
  "/venta-contado": "contado",
  "/motos-vendidas": "historial-patio",
  "/vendidas": "credito-calle",
  "/tarjetas-propiedad": "tarjetas",
  "/venta": "vender",
  "/caja": "caja",
  "/inventario": "inventario",
  "/historial-ventas": "historial-ventas",
  "/taller": "taller",
  "/taller/sebastian": "sebastian",
  "/taller/mecanicos": "mecanicos",
  "/visitadores": "equipo",
};

const DESCRIPTIONS: Record<ModuleId, string> = {
  creditos: "Solicitudes de crédito pendientes.",
  hoy: "Bandeja del día: créditos, pagos, visitas y entregas.",
  clientes: "Buscar clientes por nombre, cédula o placa.",
  "historial-pagos": "Pagos registrados.",
  catalogo: "Referencia de motos a crédito: modelo, color, stock y cuotas.",
  garaje: "Motos físicas por parqueadero, placa y estado.",
  contado: "Ventas de moto al contado.",
  "historial-patio": "Motos que salieron del patio.",
  "credito-calle": "Motos a crédito que ya están en la calle.",
  tarjetas: "Tarjetas de propiedad.",
  vender: "Vender productos de tienda. Requiere caja abierta.",
  caja: "Apertura, cuadre, movimientos y cierre de caja.",
  inventario: "Categorías y productos de tienda, con stock por sede.",
  "historial-ventas": "Ventas de tienda.",
  taller: "Órdenes de taller por estado.",
  sebastian: "Repuestos pendientes de aprobación.",
  mecanicos: "Mecánicos del taller.",
  equipo: "Visitadores y comisiones.",
  "solicitudes-taller": "Solicitudes de taller hechas por clientes.",
};

export type ArtifactMeta = {
  id: ModuleId;
  group: string;
  title: string;
  description: string;
};

export function listArtifacts(hideEquipo: boolean): ArtifactMeta[] {
  const groups = navGroupsForAdminScope(hideEquipo);
  const seen = new Set<ModuleId>();
  const items: ArtifactMeta[] = [];
  for (const group of groups) {
    const links =
      group.children.length > 0
        ? group.children
        : [{ href: group.href, label: group.label }];
    for (const link of links) {
      const id = HREF_MODULE[link.href];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        group: group.label,
        title: link.label,
        description: DESCRIPTIONS[id],
      });
    }
  }
  const extraTitle: Partial<Record<ModuleId, string>> = {
    creditos: "Créditos",
    "solicitudes-taller": "Solicitudes",
  };
  for (const id of MODULE_IDS) {
    if (seen.has(id)) continue;
    if (hideEquipo && id === "equipo") continue;
    items.push({
      id,
      group: id === "creditos" ? "Hoy" : "Taller",
      title: extraTitle[id] ?? id,
      description: DESCRIPTIONS[id],
    });
  }
  return items;
}

export function findArtifact(
  hideEquipo: boolean,
  id: string,
): ArtifactMeta | undefined {
  return listArtifacts(hideEquipo).find((item) => item.id === id);
}

export function matchArtifactQuery(
  hideEquipo: boolean,
  query: string,
): ArtifactMeta[] {
  const text = fold(query);
  if (!text) return listArtifacts(hideEquipo).slice(0, 6);
  const items = listArtifacts(hideEquipo);
  const exact = items.filter(
    (item) => fold(item.id) === text || fold(item.title) === text,
  );
  if (exact.length > 0) return exact;
  return items.filter((item) =>
    fold(`${item.id} ${item.title} ${item.group}`).includes(text),
  );
}
