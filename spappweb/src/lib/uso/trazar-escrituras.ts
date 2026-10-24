import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarUso } from "@/lib/uso/registrar";

const SALTAR = new Set(["uso_sesiones", "uso_nodos", "uso_aristas"]);
const MUTACIONES = new Set(["insert", "update", "upsert", "delete"]);

function camposDe(payload: unknown): { campos: string[]; id?: string } {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== "object") return { campos: [] };
  const record = row as Record<string, unknown>;
  const campos = Object.keys(record)
    .filter((key) => !/password|clave|secret/i.test(key))
    .slice(0, 20);
  const id = record.id ?? record.user_id ?? record.compra_id;
  return { campos, id: id == null ? undefined : String(id).slice(0, 80) };
}

function trazarBuilder(
  builder: object,
  tabla: string,
  op: string | null,
  payload: unknown,
): object {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "then" && op && !SALTAR.has(tabla)) {
        const then = (target as PromiseLike<unknown>).then.bind(target);
        return (
          onOk?: (value: unknown) => unknown,
          onErr?: (reason: unknown) => unknown,
        ) =>
          then((result) => {
            const fallo =
              result &&
              typeof result === "object" &&
              "error" in result &&
              (result as { error?: { message?: string } | null }).error;
            const resumen = camposDe(payload);
            void registrarUso([
              {
                tipo: "accion",
                nombre: `${op} ${tabla}`,
                ruta: tabla,
                ok: !fallo,
                detalle: {
                  tabla,
                  op,
                  campos: resumen.campos,
                  id: resumen.id,
                  error: fallo
                    ? String(
                        (fallo as { message?: string }).message ?? "error",
                      ).slice(0, 180)
                    : undefined,
                },
              },
            ]);
            return onOk ? onOk(result) : result;
          }, onErr);
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;
      return (...args: unknown[]) => {
        const next = value.apply(target, args);
        if (next === target) return receiver;
        const nextOp = MUTACIONES.has(prop) ? prop : op;
        const nextPayload = MUTACIONES.has(prop) ? args[0] : payload;
        if (next && typeof next === "object" && "then" in (next as object)) {
          return trazarBuilder(next as object, tabla, nextOp, nextPayload);
        }
        return next;
      };
    },
  });
}

/** Anota insert/update/delete del panel como aristas del grafo de uso. */
export function trazarCliente(client: SupabaseClient): SupabaseClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);
      return (tabla: string) =>
        trazarBuilder(target.from(tabla) as object, tabla, null, null);
    },
  }) as SupabaseClient;
}
