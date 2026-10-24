import type { Caso } from "@/lib/artifacts/caso";

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelContent?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: StoredChatMessage[];
  openIds: string[];
  caso?: Caso | null;
};

export type StoredLibrary = {
  activeId: string;
  chats: ChatThread[];
};

const KEY = "all4cfl-ai-test-v1";
const MAX_CHATS = 12;
const MAX_MESSAGES = 40;

export function threadTitle(messages: { role: string; content: string }[]): string {
  const first = messages.find((message) => message.role === "user")?.content.trim();
  return (first || "Chat").slice(0, 42);
}

function asMessage(value: unknown): StoredChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as StoredChatMessage;
  if (record.role !== "user" && record.role !== "assistant") return null;
  if (typeof record.id !== "string" || typeof record.content !== "string") return null;
  return {
    id: record.id,
    role: record.role,
    content: record.content.slice(0, 8_000),
    ...(typeof record.modelContent === "string"
      ? { modelContent: record.modelContent.slice(0, 12_000) }
      : {}),
  };
}

function asThread(value: unknown): ChatThread | null {
  if (!value || typeof value !== "object") return null;
  const record = value as ChatThread;
  if (typeof record.id !== "string" || !Array.isArray(record.messages)) return null;
  return {
    id: record.id,
    title: typeof record.title === "string" ? record.title.slice(0, 42) : threadTitle(record.messages),
    messages: record.messages.map(asMessage).filter((message): message is StoredChatMessage => Boolean(message)).slice(-MAX_MESSAGES),
    openIds: Array.isArray(record.openIds) ? record.openIds.filter((id) => typeof id === "string").slice(0, 8) : [],
    caso: record.caso ?? null,
  };
}

/** Acepta el hilo único viejo y la biblioteca nueva. */
export function normalizeLibrary(value: unknown): StoredLibrary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { activeId?: unknown; chats?: unknown; messages?: unknown; openIds?: unknown; caso?: Caso | null };
  if (Array.isArray(record.chats)) {
    const chats = record.chats.map(asThread).filter((chat): chat is ChatThread => Boolean(chat)).slice(0, MAX_CHATS);
    if (!chats.length) return null;
    const activeId = chats.some((chat) => chat.id === record.activeId) ? String(record.activeId) : chats[0].id;
    return { activeId, chats };
  }
  if (!Array.isArray(record.messages)) return null;
  const thread = asThread({
    id: "inicial",
    title: threadTitle(record.messages as StoredChatMessage[]),
    messages: record.messages,
    openIds: record.openIds,
    caso: record.caso ?? null,
  });
  if (!thread) return null;
  return { activeId: thread.id, chats: [thread] };
}

export function readLibrary(): StoredLibrary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeLibrary(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeLibrary(value: StoredLibrary) {
  if (typeof window === "undefined") return;
  const library = normalizeLibrary(value);
  if (!library) return;
  window.localStorage.setItem(KEY, JSON.stringify(library));
}
