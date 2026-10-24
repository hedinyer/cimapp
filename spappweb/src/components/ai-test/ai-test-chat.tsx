"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bot, Check, ChevronRight, FileText, LoaderCircle, PanelRight, Paperclip, Send, X } from "lucide-react";
import { ChatActionCard } from "@/components/ai-test/chat-action-card";
import { cycleChat } from "@/components/ai-test/chat-cycle";
import { ChatMarkdown } from "@/components/ai-test/chat-markdown";
import { InventoryPanelView } from "@/components/ai-test/inventory-panel";
import { ArtifactCanvas } from "@/components/artifacts/artifact-canvas";
import {
  ArtifactRuntime,
  useArtifactRuntime,
} from "@/components/artifacts/artifact-runtime";
import {
  CASO_EVENT,
  casosEnPantallas,
  mergeCaso,
  parseCaso,
  resolveCaso,
  type Caso,
} from "@/lib/artifacts/caso";
import { matchArtifactQuery } from "@/lib/artifacts/catalog";
import { fold, mentionQuery, slashQuery } from "@/lib/artifacts/intent";
import { isConfirmText, isUndoText } from "@/lib/artifacts/protocol";
import {
  readLibrary,
  threadTitle,
  writeLibrary,
  type ChatThread,
  type StoredLibrary,
} from "@/lib/artifacts/stored-chat";
import { loadAiTestHistory, saveAiTestHistory } from "@/lib/actions/ai-test-history";
import { searchChatMentions } from "@/lib/actions/chat-mentions";
import { getChatCard } from "@/lib/hermes/ui-catalog";
import { splitAssistantUi, type UiBlock } from "@/lib/hermes/parse-ui";
import type { ChatPanel, ToolTrace } from "@/lib/hermes/chat-events";
import { anotarUso } from "@/lib/uso/cliente";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatAttachment = {
  id: string;
  name: string;
};

type DraftFile = {
  id: string;
  file: File;
  preview: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelContent?: string;
  attachments?: ChatAttachment[];
  card?: UiBlock | null;
  dismissed?: boolean;
  tools?: ToolTrace[];
  thought?: string;
  panel?: ChatPanel | null;
  streaming?: boolean;
};

const MAX_FILES = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "md",
  "json",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
]);

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function isTimeout(error: unknown): boolean {
  return (
    (error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")) ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

function ThoughtBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const panelId = useId();
  const started = useRef(Date.now());
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (streaming) return;
    setSeconds(Math.max(1, Math.round((Date.now() - started.current) / 1000)));
  }, [streaming]);

  const label = streaming
    ? "Pensando…"
    : seconds === 1
      ? "Pensó durante 1 segundo"
      : seconds
        ? `Pensó durante ${seconds} segundos`
        : "Pensamiento";

  return (
    <div className="mb-3">
      <button
        type="button"
        className="flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {streaming ? (
          <LoaderCircle
            className="size-4 shrink-0 motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className={cn(
              "size-4 shrink-0 motion-safe:transition-transform",
              open && "rotate-90",
            )}
            aria-hidden="true"
          />
        )}
        {label}
      </button>
      {open ? (
        <p
          id={panelId}
          className="max-h-48 overflow-auto px-1 pb-1 text-sm leading-6 whitespace-pre-wrap text-muted-foreground"
        >
          {text}
        </p>
      ) : null}
    </div>
  );
}

function upsertTool(tools: ToolTrace[], next: ToolTrace): ToolTrace[] {
  const key = next.id ?? next.name;
  const index = tools.findIndex((tool) => (tool.id ?? tool.name) === key);
  if (index < 0) return [...tools, next];
  return tools.map((tool, toolIndex) =>
    toolIndex === index ? { ...tool, ...next, detail: next.detail || tool.detail } : tool,
  );
}

function AiTestWorkspace() {
  const artifacts = useArtifactRuntime();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [caso, setCaso] = useState<Caso | null>(null);
  const casoRef = useRef<Caso | null>(null);
  casoRef.current = caso;
  const [draft, setDraft] = useState("");
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [chatId, setChatId] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const libraryRef = useRef<StoredLibrary>({ activeId: "", chats: [] });
  const [slashIndex, setSlashIndex] = useState(0);
  const [mentions, setMentions] = useState<
    { userId: number; displayName: string; cedula: string | null; placa: string | null }[]
  >([]);
  const slash = slashQuery(draft);
  const slashHits =
    slash == null
      ? []
      : matchArtifactQuery(artifacts.hideEquipo, slash).slice(0, 6);

  const dialogIndex = messages.findIndex((message) => {
    if (!message.card || message.dismissed) return false;
    const spec = getChatCard(message.card.id);
    return Boolean(spec?.destructive || message.card.ui === "confirm");
  });
  const dialogMessage = dialogIndex >= 0 ? messages[dialogIndex] : null;
  const dialogSpec = dialogMessage?.card
    ? getChatCard(dialogMessage.card.id)
    : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, error, status]);

  const artifactsRef = useRef(artifacts);
  artifactsRef.current = artifacts;
  const openCount = artifacts.openIds.length;
  const prevOpenCount = useRef(0);

  useEffect(() => {
    const grew = openCount > prevOpenCount.current;
    prevOpenCount.current = openCount;
    if (!grew || window.matchMedia("(min-width: 1024px)").matches) return;
    setSheetOpen(true);
  }, [openCount]);

  function packMessages(source: ChatMessage[]) {
    return source
      .filter((message) => message.content.trim())
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        ...(message.modelContent ? { modelContent: message.modelContent } : {}),
      }));
  }

  function remember(library: StoredLibrary) {
    libraryRef.current = library;
    setChatId(library.activeId);
    setThreads(library.chats);
    writeLibrary(library);
  }

  function showThread(thread: ChatThread) {
    setChatId(thread.id);
    setCaso(parseCaso(thread.caso));
    setMessages(
      thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        modelContent: message.modelContent,
      })),
    );
    for (const id of [...artifactsRef.current.openIds]) artifactsRef.current.close(id);
    for (const id of thread.openIds) artifactsRef.current.open(id as never);
  }

  function snapshotActive(): ChatThread {
    const id = libraryRef.current.activeId || crypto.randomUUID();
    return {
      id,
      title: threadTitle(messages),
      messages: packMessages(messages),
      openIds: [...artifactsRef.current.openIds],
      caso,
    };
  }

  function nuevoChat() {
    if (pending) return;
    const current = snapshotActive();
    const fresh: ChatThread = {
      id: crypto.randomUUID(),
      title: "Chat",
      messages: [],
      openIds: [],
      caso: null,
    };
    const chats = [
      fresh,
      ...(current.messages.length ? [current] : []),
      ...libraryRef.current.chats.filter(
        (chat) => chat.id !== current.id && chat.messages.length > 0,
      ),
    ].slice(0, 12);
    const library = { activeId: fresh.id, chats };
    remember(library);
    showThread(fresh);
    void saveAiTestHistory(library);
  }

  function openThread(id: string) {
    if (pending || id === libraryRef.current.activeId) return;
    const current = snapshotActive();
    const chats = [
      current.messages.length ? current : null,
      ...libraryRef.current.chats.filter((chat) => chat.id !== current.id),
    ].filter((chat): chat is ChatThread => Boolean(chat));
    const next = chats.find((chat) => chat.id === id);
    if (!next) return;
    const library = { activeId: id, chats };
    remember(library);
    showThread(next);
    void saveAiTestHistory(library);
  }

  useEffect(() => {
    const local = readLibrary();
    if (local) {
      libraryRef.current = local;
      setThreads(local.chats);
      const active = local.chats.find((chat) => chat.id === local.activeId) ?? local.chats[0];
      if (active) showThread(active);
    }
    let live = true;
    loadAiTestHistory()
      .then((remote) => {
        if (!live || !remote) return;
        libraryRef.current = remote;
        setThreads(remote.chats);
        const active = remote.chats.find((chat) => chat.id === remote.activeId) ?? remote.chats[0];
        if (active) showThread(active);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const query = mentionQuery(draft);
    if (!query || query.length < 2) {
      setMentions([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      searchChatMentions(query)
        .then((rows) => {
          if (live) setMentions(rows);
        })
        .catch(() => {
          if (live) setMentions([]);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [draft]);

  useEffect(() => {
    function onCaso(event: Event) {
      const next = parseCaso((event as CustomEvent).detail);
      if (!next) return;
      setCaso((prev) => mergeCaso(prev, next));
    }
    window.addEventListener(CASO_EVENT, onCaso);
    return () => window.removeEventListener(CASO_EVENT, onCaso);
  }, []);

  useEffect(() => {
    if (pending || !libraryRef.current.activeId) return;
    if (messages.length === 0 && artifactsRef.current.openIds.length === 0 && !caso) return;
    const thread = snapshotActive();
    const chats = [thread, ...libraryRef.current.chats.filter((chat) => chat.id !== thread.id)].slice(0, 12);
    const library = { activeId: thread.id, chats };
    libraryRef.current = library;
    setThreads(chats);
    writeLibrary(library);
    const timer = setTimeout(() => {
      void saveAiTestHistory(library);
    }, 400);
    return () => clearTimeout(timer);
  }, [artifacts.openIds, caso, messages, pending]);

  function patch(id: string, update: (message: ChatMessage) => ChatMessage) {
    setMessages((current) =>
      current.map((message) => (message.id === id ? update(message) : message)),
    );
  }

  function addFiles(list: FileList | null) {
    if (!list?.length || pending) return;
    const next = [...draftFiles];
    let problem: string | null = null;
    for (const file of list) {
      if (next.length >= MAX_FILES) {
        problem = "Puedes adjuntar hasta 4 archivos.";
        break;
      }
      const extension = fileExtension(file.name);
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        problem = `${file.name} no es un tipo permitido. Usa PDF, Excel, CSV, texto o imagen.`;
        continue;
      }
      if (file.size === 0) {
        problem = `${file.name} está vacío.`;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        problem = `${file.name} supera los 8 MB.`;
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      });
    }
    setDraftFiles(next);
    setError(problem);
    const added = next.length - draftFiles.length;
    if (added > 0) {
      setStatus(added === 1 ? `Adjunto ${next.at(-1)?.file.name ?? "archivo"}` : `${added} archivos adjuntos`);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(id: string) {
    setDraftFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  function pushLocal(text: string, answer: string) {
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: text },
      { id: assistantId, role: "assistant", content: answer },
    ]);
    setDraft("");
    setStatus(answer);
  }

  async function send(forced?: string) {
    const text = (forced ?? draft).trim();
    if ((!text && draftFiles.length === 0) || pending) return;
    const sendingFiles = draftFiles;
    if (sendingFiles.length === 0 && isUndoText(text)) {
      const note = (await artifactsRef.current.undo()) ?? "No hay nada que deshacer.";
      pushLocal(text, note);
      return;
    }
    const waiting = artifactsRef.current.pending();
    if (sendingFiles.length === 0 && waiting && isConfirmText(text)) {
      artifactsRef.current.clearPending();
      setDraft("");
      setPending(true);
      try {
        const result = await artifactsRef.current.execute(waiting.act, true);
        pushLocal(text, result.error || result.detail || "Listo.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo confirmar.");
      } finally {
        setPending(false);
      }
      return;
    }
    if (sendingFiles.length === 0 && waiting && /^(no|cancelar)$/i.test(text)) {
      artifactsRef.current.clearPending();
      pushLocal(text, "Cancelado.");
      return;
    }
    const slashExact = text.match(/^\/(\S+)$/);
    if (sendingFiles.length === 0 && slashExact) {
      const query = slashExact[1] ?? "";
      const hits = matchArtifactQuery(artifacts.hideEquipo, query);
      const hit =
        hits.find((item) => item.id === query || fold(item.title) === fold(query)) ??
        hits[0];
      if (hit) {
        artifacts.open(hit.id);
        pushLocal(text, `Ahí está ${hit.title}.`);
        return;
      }
    }
    anotarUso({
      tipo: "mensaje",
      nombre: text || sendingFiles.map((item) => item.file.name).join(", "),
      ruta: "/ai-test",
      detalle: {
        archivos: sendingFiles.map((item) => item.file.name).slice(0, 4),
      },
    });

    const userId = crypto.randomUUID();
    const history: ChatMessage[] = [
      ...messages,
      {
        id: userId,
        role: "user",
        content: text,
        attachments: sendingFiles.map((item) => ({
          id: item.id,
          name: item.file.name,
        })),
      },
    ];
    const assistantId = crypto.randomUUID();
    setMessages([
      ...history,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        tools: [],
        streaming: true,
      },
    ]);
    setDraft("");
    setStatus("Pensando…");
    setDraftFiles([]);
    setPending(true);
    setError(null);
    setStatus("Consultando…");

    try {
      const files = await Promise.all(
        sendingFiles.map(async (item) => ({
          name: item.file.name,
          mime: item.file.type,
          data: await fileToBase64(item.file),
        })),
      );
      for (const item of sendingFiles) {
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
      const nextCaso = resolveCaso(
        casoRef.current,
        text,
        casosEnPantallas(artifactsRef.current.promptViews()),
      );
      if (nextCaso) {
        casoRef.current = nextCaso;
        setCaso(nextCaso);
      }
      const casoNow = casoRef.current;
      const result = await cycleChat({
        history: history.map((message) => ({
          role: message.role,
          content: message.modelContent ?? message.content,
        })),
        files,
        artifacts: () => artifactsRef.current.promptViews(),
        caso: () => casoNow,
        execute: (act) => artifactsRef.current.execute(act),
        onText: (snapshot) => {
          setStatus("Escribiendo…");
          patch(assistantId, (message) => ({ ...message, content: snapshot }));
        },
        onThought: (thought) => {
          patch(assistantId, (message) => ({
            ...message,
            thought: `${message.thought ?? ""}${thought}`,
          }));
        },
        onTool: (tool) => {
          const nextStatus =
            tool.status === "running" ? `Consultando ${tool.label}…` : `Listo: ${tool.label}`;
          setStatus(nextStatus);
          patch(assistantId, (message) => ({
            ...message,
            tools: upsertTool(message.tools ?? [], tool),
          }));
        },
        onOpen: (id) => artifactsRef.current.open(id),
        onPanel: (panel) => {
          if (panel.kind === "client") {
            setCaso((prev) =>
              mergeCaso(prev, {
                userId: panel.userId,
                nombre: panel.displayName,
                cedula: prev?.userId === panel.userId ? prev.cedula : null,
                documentId: prev?.userId === panel.userId ? prev.documentId : null,
              }),
            );
          }
          patch(assistantId, (message) => ({ ...message, panel }));
        },
        onFiles: (context) => {
          patch(userId, (message) => ({
            ...message,
            modelContent: [message.content, context].filter(Boolean).join("\n\n"),
          }));
        },
      });
      const parsed = splitAssistantUi(result.text);
      const visible =
        [parsed.text, result.confirm].filter(Boolean).join("\n\n") ||
        "Listo.";
      patch(assistantId, (message) => ({
        ...message,
        streaming: false,
        content:
          [parsed.text, result.confirm].filter(Boolean).join("\n\n") ||
          (parsed.card || message.panel || (message.tools?.length ?? 0) > 0
            ? "Listo."
            : "El asistente no devolvió texto."),
        modelContent: [result.memory, visible].filter(Boolean).join("\n\n").slice(0, 12_000),
        card: parsed.card,
        tools: (message.tools ?? []).map((tool) => ({
          ...tool,
          status: "done" as const,
        })),
      }));
      setStatus(result.confirm ?? "");
    } catch (caught) {
      setStatus("");
      patch(assistantId, (message) => ({ ...message, streaming: false }));
      setError(
        isTimeout(caught)
          ? "La consulta superó los 5 minutos. Inténtalo de nuevo."
          : caught instanceof Error
            ? caught.message
            : "No se pudo consultar al asistente.",
      );
    } finally {
      setPending(false);
    }
  }

  function pickSlash(index: number) {
    const hit = slashHits[index];
    if (!hit) return;
    const query = slashQuery(draft) ?? "";
    const next = draft.replace(new RegExp(`/${query}$`), `/${hit.id} `);
    setDraft(next);
    setSlashIndex(0);
    inputRef.current?.focus();
  }

  function pickMention(displayName: string) {
    const query = mentionQuery(draft) ?? "";
    setDraft(draft.replace(new RegExp(`@${query}$`), `@${displayName} `));
    setMentions([]);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashHits.length > 0 && event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((current) => (current + 1) % slashHits.length);
      return;
    }
    if (slashHits.length > 0 && event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((current) => (current - 1 + slashHits.length) % slashHits.length);
      return;
    }
    if (event.key === "Escape") {
      setSlashIndex(0);
      setMentions([]);
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (slashHits.length > 0 && slash != null && !draft.trim().includes(" ")) {
        void send(`/${slashHits[slashIndex]?.id ?? slashHits[0]?.id ?? ""}`);
        return;
      }
      void send();
    }
  }

  function dismissDialog() {
    if (dialogIndex < 0) return;
    setMessages((current) =>
      current.map((message, index) =>
        index === dialogIndex ? { ...message, dismissed: true } : message,
      ),
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-2rem)] min-h-0 overflow-hidden rounded-xl border border-border bg-background sm:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-4rem)] lg:h-[calc(100dvh-4rem)]">
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">AI test</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pide una pantalla con / o en una frase. El asistente la usa desde el chat.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {threads.some((thread) => thread.messages.length > 0) ? (
            <select
              aria-label="Chats guardados"
              className="h-11 max-w-40 rounded-md border border-border bg-background px-2 text-sm"
              value={chatId}
              onChange={(event) => openThread(event.target.value)}
            >
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.messages.length ? thread.title : "Chat nuevo"}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={nuevoChat}
          >
            Nuevo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 lg:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <PanelRight aria-hidden="true" />
            Pantallas
          </Button>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
        inert={dialogMessage ? true : undefined}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {messages.length === 0 && !pending ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Bot className="size-5" strokeWidth={1.75} aria-hidden="true" />
              <p>Pregunta, por ejemplo: ¿Qué hay en inventario?</p>
            </div>
          ) : null}

          {messages.map((message) => {
            const spec = message.card ? getChatCard(message.card.id) : undefined;
            const inlineCard =
              spec &&
              message.card &&
              !spec.destructive &&
              message.card.ui !== "confirm";
            if (message.role === "user") {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-3xl bg-foreground px-4 py-2.5 text-sm leading-6 text-background">
                    {message.attachments?.length ? (
                      <ul className="grid gap-1">
                        {message.attachments.map((file) => (
                          <li key={file.id} className="truncate">
                            {file.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {message.content ? <p>{message.content}</p> : null}
                  </div>
                </div>
              );
            }
            return (
              <div key={message.id} className="flex gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot
                    className="size-4"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {message.thought ? (
                    <ThoughtBlock
                      text={message.thought}
                      streaming={Boolean(message.streaming)}
                    />
                  ) : null}
                  {message.tools?.length ? (
                    <ul className="mb-3 grid gap-1.5">
                      {message.tools.map((tool) => (
                        <li
                          key={tool.id ?? tool.name}
                          className="rounded-2xl border border-border px-3 py-2 text-sm"
                        >
                          <div className="flex min-h-11 items-center gap-2">
                            {tool.status === "running" ? (
                              <LoaderCircle
                                className="size-4 shrink-0 motion-safe:animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Check
                                className="size-4 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <span className="font-medium">{tool.label}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">
                              {tool.name}
                            </span>
                          </div>
                          {tool.detail ? (
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-muted-foreground">
                              {tool.detail}
                            </pre>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {message.panel?.kind === "inventory" ? (
                    <InventoryPanelView panel={message.panel} />
                  ) : null}
                  {message.panel?.kind === "module" ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center rounded-full bg-muted px-3 text-sm font-medium"
                      onClick={() => {
                        if (message.panel?.kind === "module") {
                          artifacts.open(message.panel.id);
                        }
                      }}
                    >
                      Abrir {message.panel.title}
                    </button>
                  ) : null}
                  {message.content ? (
                    <div className={cn(message.panel && "mt-3")}>
                      <ChatMarkdown text={message.content} />
                      {message.streaming ? (
                        <span
                          className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-foreground align-middle motion-safe:animate-pulse"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                  ) : message.streaming && !message.thought && !message.tools?.length ? (
                    <p className="text-sm text-muted-foreground">Pensando…</p>
                  ) : null}
                  {inlineCard && message.card ? (
                    <ChatActionCard
                      spec={spec}
                      block={message.card}
                      onDone={(note) => setStatus(note)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}

          <div role="status" aria-live="polite" className="sr-only">
            {status}
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        className="shrink-0 border-t border-border px-4 py-3"
        inert={dialogMessage ? true : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-3xl border border-border bg-background px-3 py-2 shadow-[0_1px_2px_oklch(0_0_0/0.06)]">
          {draftFiles.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {draftFiles.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-muted/40 pr-1 pl-2"
                >
                  {item.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.preview}
                      alt=""
                      className="size-8 rounded-lg object-cover"
                    />
                  ) : (
                    <FileText
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span className="max-w-40 truncate text-sm">
                    {item.file.name}
                  </span>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-xl hover:bg-muted"
                    aria-label={`Quitar ${item.file.name}`}
                    onClick={() => removeFile(item.id)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {slashHits.length > 0 ? (
            <ul className="grid gap-1" role="listbox" aria-label="Pantallas">
              {slashHits.map((hit, index) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === slashIndex}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm",
                      index === slashIndex ? "bg-muted" : "hover:bg-muted/60",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickSlash(index);
                    }}
                  >
                    <span className="font-medium">{hit.title}</span>
                    <span className="text-muted-foreground">{hit.group}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {mentions.length > 0 ? (
            <ul className="grid gap-1" role="listbox" aria-label="Clientes">
              {mentions.map((person) => (
                <li key={person.userId}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm hover:bg-muted"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickMention(person.displayName);
                    }}
                  >
                    <span>{person.displayName}</span>
                    <span className="text-muted-foreground">
                      {person.placa || person.cedula || ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              id="ai-test-archivos"
              type="file"
              multiple
              accept=".pdf,.xls,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp,.gif"
              tabIndex={-1}
              className="sr-only"
              onChange={(event) => addFiles(event.target.files)}
            />
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              className="size-11"
              aria-label="Adjuntar PDF, Excel, CSV, texto o imagen"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip aria-hidden="true" />
            </Button>
            <label htmlFor="ai-test-mensaje" className="sr-only">
              Mensaje
            </label>
            <Textarea
              ref={inputRef}
              id="ai-test-mensaje"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setSlashIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Escribe un mensaje"
              rows={1}
              disabled={pending}
              className="max-h-32 min-h-11 flex-1 resize-none border-0 bg-transparent py-2.5 shadow-none focus-visible:ring-0"
            />
            <Button
              type="submit"
              disabled={pending || (draft.trim().length === 0 && draftFiles.length === 0)}
              className="min-h-11 active:scale-[0.96]"
            >
              <Send aria-hidden="true" />
              Enviar
            </Button>
          </div>
        </div>
      </form>
    </div>
      <ArtifactCanvas className="hidden w-[min(42rem,48%)] border-l lg:flex" />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[85dvh] sm:max-w-none">
          <SheetHeader>
            <SheetTitle>Pantallas</SheetTitle>
          </SheetHeader>
          <ArtifactCanvas className="min-h-0 flex-1 border-0" />
        </SheetContent>
      </Sheet>

      {dialogMessage?.card && dialogSpec ? (
        <ChatActionCard
          spec={dialogSpec}
          block={dialogMessage.card}
          dialog
          onDismiss={dismissDialog}
          onDone={(note) => {
            setStatus(note);
            dismissDialog();
          }}
        />
      ) : null}
    </div>
  );
}

export function AiTestChat({ hideEquipo }: { hideEquipo: boolean }) {
  return (
    <ArtifactRuntime hideEquipo={hideEquipo}>
      <AiTestWorkspace />
    </ArtifactRuntime>
  );
}
