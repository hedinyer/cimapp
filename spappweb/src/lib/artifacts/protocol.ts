export const UI_OPS = [
  "open_artifact",
  "close_artifact",
  "ui_action",
  "ui_click",
  "ui_fill",
  "ui_select",
  "ui_scroll",
] as const;

export type UiOp = (typeof UI_OPS)[number];

export type UiAct = {
  op: UiOp;
  args: Record<string, unknown>;
};

const OP_SET = new Set<string>(UI_OPS);

export function isUiOp(value: string): value is UiOp {
  return OP_SET.has(value);
}

export function isDestructiveLabel(label: string): boolean {
  return /eliminar|borrar|desactivar|anular/i.test(label);
}

export function isConfirmText(value: string): boolean {
  return /^(s[ií]|confirmo|confirmar|dale)$/i.test(value.trim());
}

export function isUndoText(value: string): boolean {
  return /^(deshacer|deshaz)$/i.test(value.trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asAct(value: unknown): UiAct | null {
  const record = asRecord(value);
  if (!record) return null;
  const op = record.op;
  if (typeof op !== "string" || !isUiOp(op)) return null;
  const args = asRecord(record.args) ?? {};
  return { op, args };
}

function actsFromValue(value: unknown): UiAct[] {
  const record = asRecord(value);
  if (!record || record.ui !== "act") return [];
  if (Array.isArray(record.steps)) {
    return record.steps.flatMap((step) => {
      const act = asAct(step);
      return act ? [act] : [];
    });
  }
  const act = asAct(record);
  return act ? [act] : [];
}

function extractObject(content: string, start: number): string | null {
  if (content[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

/** Quita los bloques {"ui":"act"} y deja el texto visible. */
export function parseAssistantActs(content: string): {
  text: string;
  acts: UiAct[];
} {
  const acts: UiAct[] = [];
  let text = content;

  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  for (let i = fences.length - 1; i >= 0; i--) {
    const fence = fences[i];
    if (fence?.index == null) continue;
    try {
      const found = actsFromValue(JSON.parse(fence[1] ?? ""));
      if (found.length === 0) continue;
      acts.unshift(...found);
      text = `${text.slice(0, fence.index)}${text.slice(fence.index + fence[0].length)}`;
    } catch {
      continue;
    }
  }

  const marker = /\{\s*"ui"\s*:\s*"act"/g;
  const spans: { index: number; raw: string; found: UiAct[] }[] = [];
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text))) {
    const raw = extractObject(text, match.index);
    if (!raw) continue;
    try {
      const found = actsFromValue(JSON.parse(raw));
      if (found.length > 0) spans.push({ index: match.index, raw, found });
    } catch {
      continue;
    }
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    if (!span) continue;
    acts.unshift(...span.found);
    text = `${text.slice(0, span.index)}${text.slice(span.index + span.raw.length)}`;
  }

  return { text: text.trim(), acts };
}

export function actsFromToolCalls(
  calls: { function?: { name?: string; arguments?: string } }[],
): UiAct[] {
  const acts: UiAct[] = [];
  for (const call of calls) {
    const name = call.function?.name?.trim() ?? "";
    if (!isUiOp(name)) continue;
    let args: Record<string, unknown> = {};
    const raw = call.function?.arguments?.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const record = asRecord(parsed);
        if (record) args = record;
      } catch {
        args = {};
      }
    }
    acts.push({ op: name, args });
  }
  return acts;
}
