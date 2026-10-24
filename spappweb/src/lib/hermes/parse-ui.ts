import { getChatCard } from "@/lib/hermes/ui-catalog";

export type UiBlock = {
  ui: "form" | "summary" | "confirm";
  id: string;
  mode?: "create" | "edit" | "delete";
  values: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBlock(value: unknown): UiBlock | null {
  const record = asRecord(value);
  if (!record) return null;
  const ui = record.ui;
  const id = record.id;
  if (ui !== "form" && ui !== "summary" && ui !== "confirm") return null;
  if (typeof id !== "string" || !getChatCard(id)) return null;
  const values = asRecord(record.values) ?? {};
  const mode = record.mode;
  return {
    ui,
    id,
    values,
    mode:
      mode === "create" || mode === "edit" || mode === "delete"
        ? mode
        : undefined,
  };
}

/** Quita el último bloque JSON de tarjeta y deja el texto visible. */
export function splitAssistantUi(content: string): {
  text: string;
  card: UiBlock | null;
} {
  const fences = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  for (let i = fences.length - 1; i >= 0; i--) {
    const fence = fences[i];
    if (fence.index == null) continue;
    try {
      const card = asBlock(JSON.parse(fence[1] ?? ""));
      if (!card) continue;
      const text = `${content.slice(0, fence.index)}${content.slice(fence.index + fence[0].length)}`.trim();
      return { text, card };
    } catch {
      continue;
    }
  }

  const marker = /\{\s*"ui"\s*:/g;
  let match: RegExpExecArray | null;
  let found: { index: number; raw: string; card: UiBlock } | null = null;
  while ((match = marker.exec(content))) {
    const raw = extractObject(content, match.index);
    if (!raw) continue;
    try {
      const card = asBlock(JSON.parse(raw));
      if (card) found = { index: match.index, raw, card };
    } catch {
      continue;
    }
  }
  if (found) {
    const text = `${content.slice(0, found.index)}${content.slice(found.index + found.raw.length)}`.trim();
    return { text, card: found.card };
  }

  return { text: content.trim(), card: null };
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
