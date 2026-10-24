import "server-only";

import type {
  InventoryCategory,
  InventoryPanel,
  InventoryProduct,
} from "@/lib/hermes/chat-events";
import type { InventarioProductoRow } from "@/lib/pipeline/types";
import { getStoragePublicUrl } from "@/lib/utils/storage-urls";

export function isProductInventoryQuestion(question: string): boolean {
  const text = question.toLowerCase();
  const products = /inventario|repuestos?|\bproductos?\b|\btienda\b/.test(text);
  const garageOnly =
    /\b(garaje|patio|motos?)\b/.test(text) && !/producto|repuesto/.test(text);
  return products && !garageOnly;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function stockAt(row: InventarioProductoRow, sede: string): number {
  const found = row.stocks?.find((item) => item.ubicacion === sede);
  return found ? Number(found.cantidad) || 0 : 0;
}

function productImage(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return getStoragePublicUrl("inventario-imagenes", raw);
}

function toProduct(row: InventarioProductoRow): InventoryProduct {
  const soluciones = stockAt(row, "Soluciones");
  const bera = stockAt(row, "Bera");
  const bodega = stockAt(row, "Bodega");
  const total = row.stocks?.length
    ? soluciones + bera + bodega
    : Number(row.stock) || 0;
  return {
    id: row.id,
    nombre: row.nombre,
    sku: row.sku,
    imagenUrl: productImage(row.imagen_url),
    soluciones,
    bera,
    bodega,
    total,
    activo: row.activo,
  };
}

function group(rows: InventarioProductoRow[]): InventoryCategory[] {
  const map = new Map<string, InventoryProduct[]>();
  for (const row of rows) {
    const name = row.inventario_categorias?.nombre?.trim() || "Sin categoría";
    const list = map.get(name) ?? [];
    list.push(toProduct(row));
    map.set(name, list);
  }
  return [...map.entries()]
    .map(([name, products]) => ({
      name,
      products: products.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function focusOf(
  question: string,
  categories: InventoryCategory[],
): Pick<InventoryPanel, "focus" | "focusName"> {
  const text = fold(question);
  const products = categories.flatMap((category) =>
    category.products.map((product) => ({ ...product, category: category.name })),
  );
  const product = products.find((item) => {
    const sku = fold(item.sku);
    const name = fold(item.nombre);
    return (
      (sku.length >= 3 && text.includes(sku)) ||
      (name.length >= 4 && text.includes(name))
    );
  });
  if (product) return { focus: "product", focusName: product.nombre };
  const category = categories.find((item) => {
    const name = fold(item.name);
    return name.length >= 3 && text.includes(name);
  });
  if (category) return { focus: "category", focusName: category.name };
  return { focus: "all" };
}

export async function prepareChatTurn(question: string): Promise<{
  siteData: string | null;
  panel: InventoryPanel | null;
  toolDetail: string | null;
} | null> {
  if (!isProductInventoryQuestion(question)) return null;
  const { getAllProductos } = await import("@/lib/pipeline/queries");
  const rows = await getAllProductos();
  const categories = group(rows);
  const focus = focusOf(question, categories);
  const summary = categories
    .map((category) => `${category.name} (${category.products.length})`)
    .join(", ");
  const text = fold(question);
  const hits = rows.filter((row) => {
    const name = fold(row.nombre);
    const sku = fold(row.sku);
    return (
      (name.length >= 4 && text.includes(name)) ||
      (sku.length >= 3 && text.includes(sku))
    );
  });
  const hitIds = new Set(hits.map((row) => row.id));
  const lines = [...hits, ...rows.filter((row) => !hitIds.has(row.id))]
    .slice(0, 60)
    .map(
      (row) =>
        `${row.id}\t${row.nombre}\t${row.sku}\tprecio ${row.precio}\tstock ${row.stock}`,
    );
  return {
    panel: { kind: "inventory", ...focus, categories },
    toolDetail: `${rows.length} productos en ${categories.length} categorías`,
    siteData: [
      "Datos del sitio: productos y repuestos, no motos. id, nombre, sku, precio, stock. Úsalos. No inventes ids.",
      `Total: ${rows.length}. Categorías: ${summary}.`,
      lines.join("\n"),
    ].join("\n"),
  };
}
