"use server";

import { requireAdminSession } from "@/lib/auth/session";
import {
  getActiveVisitadores,
  getAllBikes,
  getAllProductos,
  getAllProductosCredito,
  getClientPipeline,
} from "@/lib/pipeline/queries";
import type {
  BikeRow,
  ClientPipeline,
  InventarioProductoRow,
  ProductoCreditoRow,
  VisitadorRow,
} from "@/lib/pipeline/types";

export async function loadClientChatPanel(userId: number): Promise<{
  pipeline: ClientPipeline;
  visitadores: VisitadorRow[];
  bikes: BikeRow[];
  productosCredito: ProductoCreditoRow[];
  inventarioProductos: InventarioProductoRow[];
} | null> {
  await requireAdminSession();
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const [pipeline, visitadores, bikes, productosCredito, inventarioProductos] =
    await Promise.all([
      getClientPipeline(userId),
      getActiveVisitadores(),
      getAllBikes(),
      getAllProductosCredito(),
      getAllProductos(),
    ]);
  if (!pipeline) return null;
  return {
    pipeline,
    visitadores,
    bikes,
    productosCredito,
    inventarioProductos,
  };
}
