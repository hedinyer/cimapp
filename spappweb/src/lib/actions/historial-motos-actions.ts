"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VentaMotoRow } from "@/lib/actions/venta-moto-actions";

export interface HistorialMotoVentaRow {
  id: string;
  origen: "contado" | "credito_liquidado";
  fecha: string;
  clienteNombre: string;
  clienteCedula: string | null;
  placa: string | null;
  modelo: string;
  color: string;
  monto: number;
  userId: number | null;
  /** Datos completos del recibo (ventas de contado). */
  ventaContado?: VentaMotoRow;
}

function dayStartBogota(fecha: string): string {
  return new Date(`${fecha}T00:00:00-05:00`).toISOString();
}

function dayEndBogota(fecha: string): string {
  return new Date(`${fecha}T23:59:59.999-05:00`).toISOString();
}

export async function listHistorialMotosCredito(options?: {
  desde?: string;
  hasta?: string;
}): Promise<HistorialMotoVentaRow[]> {
  await requireAdminSession();
  const supabase = createAdminClient();

  let comprasQuery = supabase
    .from("user_moto_compra")
    .select(
      "id, user_id, modelo, color, placa, fecha_entrega, updated_at, users(user)",
    )
    .eq("estado", "saldada")
    .order("updated_at", { ascending: false });

  if (options?.desde && options?.hasta) {
    comprasQuery = comprasQuery
      .gte("updated_at", dayStartBogota(options.desde))
      .lte("updated_at", dayEndBogota(options.hasta));
  }

  const { data: compras, error } = await comprasQuery;
  if (error) throw new Error(error.message);

  const rows: HistorialMotoVentaRow[] = [];
  for (const c of compras ?? []) {
    const { data: liq } = await supabase
      .from("pagos")
      .select("monto")
      .eq("user_moto_compra_id", c.id)
      .eq("contexto_pago", "liquidacion")
      .eq("estado", "confirmado")
      .order("confirmado_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const users = c.users as { user: string } | { user: string }[] | null;
    const username = Array.isArray(users) ? users[0]?.user : users?.user;

    rows.push({
      id: c.id as string,
      origen: "credito_liquidado",
      fecha: String(c.updated_at ?? c.fecha_entrega),
      clienteNombre: username ?? `#${c.user_id}`,
      clienteCedula: username ?? null,
      placa: (c.placa as string | null) ?? null,
      modelo: String(c.modelo),
      color: String(c.color),
      monto: Number(liq?.monto ?? 0),
      userId: Number(c.user_id),
    });
  }
  return rows;
}
