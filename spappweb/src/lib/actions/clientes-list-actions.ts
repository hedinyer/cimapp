"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { listClientesMotoCredito } from "@/lib/pipeline/queries";

/** Lista de cartera para /clientes; se pide tras pintar el shell. */
export async function loadClientesMotoCreditoAction() {
  await requireAdminSession();
  return listClientesMotoCredito();
}
