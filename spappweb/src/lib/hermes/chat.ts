import "server-only";

import {
  actsFromToolCalls,
  parseAssistantActs,
  type UiAct,
} from "@/lib/artifacts/protocol";

export type HermesRole = "system" | "user" | "assistant";

export type HermesContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type HermesMessage = {
  role: HermesRole;
  content: string | HermesContentPart[];
};

function messageHasImage(messages: HermesMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image_url"),
  );
}

function withoutImages(messages: HermesMessage[]): HermesMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    return {
      role: message.role,
      content: text || "El usuario adjuntó imágenes.",
    };
  });
}

const TIMEOUT_MS = 300_000;

function hermesConfig() {
  const baseUrl = process.env.HERMES_BASE_URL?.trim() ?? "";
  const model = process.env.HERMES_MODEL?.trim() || "all4cfl";
  const apiKey = process.env.HERMES_API_KEY?.trim() ?? "";
  if (!baseUrl || !apiKey) {
    throw new Error("Faltan HERMES_BASE_URL o HERMES_API_KEY en el servidor.");
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("HERMES_BASE_URL no es una URL válida.");
  }
  const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname);
  const httpAllowed = ip || process.env.HERMES_ALLOW_HTTP === "1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && httpAllowed)) {
    throw new Error(
      "HERMES_BASE_URL debe usar HTTPS. Para un host sin certificado define HERMES_ALLOW_HTTP=1.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), model, apiKey };
}

function readContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

export async function completeHermesChat(
  messages: HermesMessage[],
): Promise<string> {
  const { baseUrl, model, apiKey } = hermesConfig();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`Hermes ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };

  return readContent(data.choices?.[0]?.message?.content);
}

export type HermesStreamChunk =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | {
      type: "tool";
      id?: string;
      name: string;
      detail?: string;
      status?: "running" | "done";
    }
  | { type: "ui"; acts: UiAct[] };

function readReasoning(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["reasoning_content", "reasoning", "thinking"]) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  return "";
}

function progressChunk(
  eventName: string,
  json: Record<string, unknown>,
): HermesStreamChunk | null {
  const named =
    eventName === "hermes.tool.progress" || eventName.endsWith("tool.progress");
  const tool = json.tool ?? json.tool_name ?? json.name;
  if (!named && (typeof tool !== "string" || "choices" in json)) return null;
  if (typeof tool !== "string" || !tool.trim()) return null;
  const kind = String(json.status ?? json.type ?? json.event ?? "");
  const done = /complete|done|finish|error|fail/i.test(kind);
  const preview = typeof json.preview === "string" ? json.preview : "";
  const errorText = typeof json.error === "string" ? json.error : "";
  const id = String(json.tool_call_id ?? json.call_id ?? json.id ?? tool);
  return {
    type: "tool",
    id,
    name: tool.trim(),
    status: done ? "done" : "running",
    detail: errorText || preview,
  };
}

async function* revealText(text: string): AsyncGenerator<HermesStreamChunk> {
  const size = 18;
  for (let index = 0; index < text.length; index += size) {
    yield { type: "text", text: text.slice(index, index + size) };
    await new Promise((resolve) => setTimeout(resolve, 14));
  }
}

/** Lee el stream OpenAI. Si el servidor no streamea, revela el texto en trozos. */
export async function* streamHermesChat(
  messages: HermesMessage[],
): AsyncGenerator<HermesStreamChunk> {
  const { baseUrl, model, apiKey } = hermesConfig();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok || !response.body) {
    if (messageHasImage(messages)) {
      yield* streamHermesChat(withoutImages(messages));
      return;
    }
    yield* revealText(await completeHermesChat(messages));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamed = false;
  let eventName = "";
  const seenTools = new Set<string>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("event:")) {
        eventName = trimmed.slice(6).trim();
        continue;
      }
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      const currentEvent = eventName;
      eventName = "";
      if (!payload || payload === "[DONE]") continue;
      let json: {
        choices?: {
          delta?: {
            content?: unknown;
            tool_calls?: { function?: { name?: string } }[];
          };
          message?: { content?: unknown };
        }[];
      };
      try {
        json = JSON.parse(payload) as typeof json;
      } catch {
        continue;
      }
      const progress = progressChunk(
        currentEvent,
        json as unknown as Record<string, unknown>,
      );
      if (progress && progress.type === "tool") {
        streamed = true;
        yield progress;
        continue;
      }
      const choice = json.choices?.[0];
      const thought =
        readReasoning(choice?.delta) || readReasoning(choice?.message);
      if (thought) yield { type: "thought", text: thought };
      const toolName = choice?.delta?.tool_calls?.find(
        (call) => call.function?.name,
      )?.function?.name;
      if (toolName && !seenTools.has(toolName)) {
        seenTools.add(toolName);
        yield { type: "tool", name: toolName, status: "running" };
      }
      const text =
        readContent(choice?.delta?.content) ||
        readContent(choice?.message?.content);
      if (text) {
        streamed = true;
        yield { type: "text", text };
      }
    }
  }

  if (!streamed) {
    const raw = buffer.trim();
    if (raw.startsWith("{")) {
      try {
        const json = JSON.parse(raw) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const message = json.choices?.[0]?.message;
        const thought = readReasoning(message);
        if (thought) yield { type: "thought", text: thought };
        const text = readContent(message?.content);
        if (text || thought) {
          if (text) yield* revealText(text);
          return;
        }
      } catch {
        // el cuerpo no era un completion completo
      }
    }
    yield* revealText(await completeHermesChat(messages));
  }
}

type ToolCall = {
  id?: string;
  function?: { name?: string; arguments?: string };
};

type DeltaTool = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type StreamChoice = {
  delta?: {
    content?: unknown;
    reasoning_content?: unknown;
    tool_calls?: DeltaTool[];
  };
  message?: {
    content?: unknown;
    reasoning_content?: unknown;
    tool_calls?: ToolCall[];
  };
};

function toolDetail(call: ToolCall): string {
  const raw = call.function?.arguments?.trim() || "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { sql?: string };
    if (typeof parsed.sql === "string" && parsed.sql.trim()) return parsed.sql.trim();
  } catch {
    // los argumentos siguen llegando
  }
  return raw;
}

/** Streamea una vuelta: pensamiento, texto y herramientas según van llegando. */
async function* streamRound(
  messages: unknown[],
  round: number,
  holdText = false,
): AsyncGenerator<HermesStreamChunk, { content: string; calls: ToolCall[] }> {
  const { baseUrl, model, apiKey } = hermesConfig();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`Hermes ${response.status}: ${detail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let eventName = "";
  const calls: ToolCall[] = [];
  const emitted = new Map<number, string>();

  const noteCall = function* (index: number): Generator<HermesStreamChunk> {
    const call = calls[index];
    const name = call?.function?.name?.trim();
    if (!name) return;
    const detail = toolDetail(call);
    const signature = `${name}\n${detail}`;
    if (emitted.get(index) === signature) return;
    emitted.set(index, signature);
    yield {
      type: "tool",
      id: call.id || `sql-${round}-${index}`,
      name,
      status: "running",
      detail,
    };
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed.startsWith("event:")) {
        eventName = trimmed.slice(6).trim();
        continue;
      }
      const payload = trimmed.startsWith("data:")
        ? trimmed.slice(5).trim()
        : trimmed.startsWith("{")
          ? trimmed
          : "";
      const currentEvent = eventName;
      eventName = "";
      if (!payload || payload === "[DONE]") continue;
      let choice: StreamChoice | undefined;
      let parsed: Record<string, unknown> | undefined;
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
        choice = (parsed.choices as StreamChoice[] | undefined)?.[0];
      } catch {
        continue;
      }
      if (parsed) {
        const progress = progressChunk(currentEvent, parsed);
        if (progress) {
          yield progress;
          if (!choice) continue;
        }
      }
      if (!choice) continue;
      const thought =
        readReasoning(choice.delta) || readReasoning(choice.message);
      if (thought) yield { type: "thought", text: thought };
      const text =
        readContent(choice.delta?.content) ||
        readContent(choice.message?.content);
      if (text) {
        content += text;
        if (!holdText) yield { type: "text", text };
      }
      const deltas = choice.delta?.tool_calls ?? [];
      for (const delta of deltas) {
        const index = delta.index ?? 0;
        while (calls.length <= index) {
          calls.push({ function: { name: "", arguments: "" } });
        }
        const call = calls[index];
        if (delta.id) call.id = delta.id;
        if (!call.function) call.function = { name: "", arguments: "" };
        if (delta.function?.name) call.function.name = delta.function.name;
        if (delta.function?.arguments) {
          call.function.arguments =
            (call.function.arguments ?? "") + delta.function.arguments;
        }
        yield* noteCall(index);
      }
      for (const call of choice.message?.tool_calls ?? []) {
        if (!calls.some((item) => item.id && item.id === call.id)) {
          calls.push(call);
          yield* noteCall(calls.length - 1);
        }
      }
    }
    if (done) break;
  }

  return { content, calls: calls.filter((call) => call.function?.name) };
}

/** Una vuelta. Si el modelo pide una pantalla, el cliente la ejecuta y vuelve a llamar. */
export async function* runAgentRound(
  messages: HermesMessage[],
): AsyncGenerator<HermesStreamChunk> {
  const history = messages.map((message) => ({
    role: message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user",
    content: message.content,
  }));
  const roundResult = yield* streamRound(history, 0, true);
  const parsed = parseAssistantActs(roundResult.content);
  const acts = [...actsFromToolCalls(roundResult.calls), ...parsed.acts];
  if (parsed.text) yield* revealText(parsed.text);
  if (acts.length > 0) yield { type: "ui", acts };
}

/** Streamea la respuesta. No ejecuta SQL aunque el modelo pida una herramienta. */
export async function* runHermesWithSql(
  messages: HermesMessage[],
): AsyncGenerator<HermesStreamChunk> {
  const history: unknown[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  try {
    for (let round = 0; round < 4; round += 1) {
      const roundResult = yield* streamRound(history, round);
      const calls = roundResult.calls;
      if (calls.length === 0) return;
      history.push({
        role: "assistant",
        content: roundResult.content || null,
        tool_calls: calls,
      });
      for (const [index, call] of calls.entries()) {
        const name = call.function?.name || "herramienta";
        const id = call.id || `tool-${round}-${index}`;
        const sql = toolDetail(call);
        const output = "SQL libre no está disponible.";
        yield {
          type: "tool",
          id,
          name,
          status: "done",
          detail: sql || output.slice(0, 180),
        };
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: output.slice(0, 12_000),
        });
      }
    }
    yield* revealText(
      "Hice varias consultas y me detuve para no dejar el chat esperando.",
    );
  } catch {
    yield* streamHermesChat(messages);
  }
}
