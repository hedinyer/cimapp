export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Solo «abre/muestra/ver …» sin una operación encima. El resto va al modelo. */
export function isNavigationOnly(question: string): boolean {
  const text = fold(question);
  if (!text || text.length > 48 || /\d/.test(text)) return false;
  if (
    /\b(vende|vender|cobra|cobrar|registra|registrar|crea|crear|elimina|eliminar|borra|guardar|traslada|aprueba|aprobar|rechaza|rechazar|busca|buscar|cuanto|cual|quien|debe)\b/.test(
      text,
    )
  ) {
    return false;
  }
  if (/\bcon\b/.test(text)) return false;
  if (searchText(question)) return false;
  return /^(abre|abrir|muestra|mostrar|ver|ensename)\b/.test(text);
}

/** Nombre o cédula pegados a «a» o «de». «de él» no es un nombre. */
export function nameHint(question: string): string | null {
  const cedula = question.match(/\b\d{6,12}\b/);
  if (cedula) return cedula[0];
  const called = fold(question).match(/\b(?:a|de)\s+([a-z]+(?:\s+[a-z]+){0,2})/);
  if (!called) return null;
  const name = called[1] ?? "";
  if (/^(el|la|ella|ellos|ellas)$/.test(name)) return null;
  return name;
}

const NOISE =
  /\b(abre|abrir|muestra|mostrar|ver|ensename|busca|buscar|que|cual|cuales|cuanto|hay|tiene|tienen|tengo|tienes|quiero|en|el|la|los|las|de|del|un|una|por|para|con|me|dame|dime|credito|creditos|inventario|garaje|caja|taller|patio|contado|catalogo|referencia|clientes|venta|vender|placa|moto|motos|solicitud|solicitudes|producto|productos|aprobad\w*|rechaz\w*|pendient\w*)\b/g;

/** Texto para la acción buscar. Vacío si la frase solo abre la pantalla. */
export function searchText(question: string): string | null {
  const hint = nameHint(question);
  if (hint && fold(hint).replace(NOISE, " ").trim()) return hint;
  const text = fold(question).replace(NOISE, " ").replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 40) return null;
  return text;
}

/** Pestaña de créditos que pide la frase. */
export function tabText(question: string): "pendiente" | "aceptada" | "rechazada" | null {
  const text = fold(question);
  if (/\baprobad/.test(text)) return "aceptada";
  if (/\brechaz/.test(text)) return "rechazada";
  if (/\bpendient/.test(text)) return "pendiente";
  return null;
}

export function slashQuery(draft: string): string | null {
  const match = draft.match(/(?:^|\s)\/([^\s/]*)$/);
  return match ? (match[1] ?? "") : null;
}

export function mentionQuery(draft: string): string | null {
  const match = draft.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? (match[1] ?? "") : null;
}
