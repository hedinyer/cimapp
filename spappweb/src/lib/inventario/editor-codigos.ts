/**
 * Claves personales para firmar ediciones/eliminaciones de inventario.
 * Agregar aquí nuevos códigos cuando entren más personas.
 */
export const INVENTARIO_EDITOR_CODIGOS = {
  "0929": "Olga",
  "0655": "Yenifer",
  "1295": "Yennifer",
  agente: "Agente",
} as const satisfies Record<string, string>;

/** Autor que firma el chat y Hermes cuando nadie escribe una clave. */
export const AGENTE_EDITOR_CODIGO = "agente";

export type InventarioEditorCodigo = keyof typeof INVENTARIO_EDITOR_CODIGOS;

export function resolveInventarioEditorCodigo(
  codigo: string,
): string | null {
  const key = codigo.trim();
  if (!key) return null;
  return (
    (INVENTARIO_EDITOR_CODIGOS as Record<string, string>)[key] ?? null
  );
}
