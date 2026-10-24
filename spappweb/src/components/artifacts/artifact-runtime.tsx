"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z, type ZodType } from "zod";
import { applyA11y, snapshotArtifact } from "@/lib/artifacts/a11y-snapshot";
import { findArtifact } from "@/lib/artifacts/catalog";
import type { ArtifactPromptView } from "@/lib/artifacts/prompt";
import {
  isDestructiveLabel,
  type UiAct,
  type UiOp,
} from "@/lib/artifacts/protocol";
import type { ModuleId } from "@/lib/hermes/chat-events";

type ActionDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  destructive?: boolean;
  prepare?: (args: Record<string, unknown>) => Promise<string>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

type Host = {
  id: ModuleId;
  title: string;
  version: number;
  state: unknown;
  ready: boolean;
  root: HTMLElement | null;
  actions: Map<string, ActionDef>;
};

type UndoItem = {
  label: string;
  run: () => Promise<string>;
};

export type UiResult = {
  ok: boolean;
  error?: string;
  needsConfirm?: boolean;
  detail?: string;
  result?: unknown;
  version?: number;
  state?: unknown;
  snapshot?: string;
};

type PendingAct = {
  act: UiAct;
  prompt: string;
};

type ArtifactApi = {
  hideEquipo: boolean;
  openIds: ModuleId[];
  activeId: ModuleId | null;
  reloadToken: Record<string, number>;
  open: (id: ModuleId) => void;
  close: (id: ModuleId) => void;
  focus: (id: ModuleId) => void;
  reload: (id: ModuleId) => void;
  setState: (id: ModuleId, state: unknown) => void;
  setReady: (id: ModuleId, ready: boolean) => void;
  bindRoot: (id: ModuleId, root: HTMLElement | null) => void;
  registerAction: (id: ModuleId, action: ActionDef) => () => void;
  pushUndo: (item: UndoItem) => void;
  undo: () => Promise<string | null>;
  pending: () => PendingAct | null;
  clearPending: () => void;
  execute: (act: UiAct, confirmed?: boolean) => Promise<UiResult>;
  promptViews: () => ArtifactPromptView[];
};

const ArtifactContext = createContext<ArtifactApi | null>(null);

function useApi(): ArtifactApi {
  const api = useContext(ArtifactContext);
  if (!api) throw new Error("El chat de artifacts no está montado.");
  return api;
}

export function useArtifactRuntime(): ArtifactApi {
  return useApi();
}

function parametersOf(schema: ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema) as Record<string, unknown>;
  } catch {
    return { type: "object" };
  }
}

export function useArtifactState(id: ModuleId, state: unknown) {
  const api = useApi();
  const apiRef = useRef(api);
  apiRef.current = api;
  const json = JSON.stringify(state);
  useEffect(() => {
    apiRef.current.setState(id, JSON.parse(json) as unknown);
  }, [id, json]);
}

export function useArtifactAction(
  id: ModuleId,
  name: string,
  description: string,
  schema: ZodType,
  handler: (args: Record<string, unknown>) => Promise<unknown>,
  options?: {
    destructive?: boolean;
    prepare?: (args: Record<string, unknown>) => Promise<string>;
  },
) {
  const api = useApi();
  const apiRef = useRef(api);
  apiRef.current = api;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const prepareRef = useRef(options?.prepare);
  prepareRef.current = options?.prepare;
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const destructive = options?.destructive ?? false;
  const hasPrepare = Boolean(options?.prepare);
  useEffect(() => {
    return apiRef.current.registerAction(id, {
      name,
      description,
      destructive,
      parameters: parametersOf(schemaRef.current),
      prepare: hasPrepare
        ? (args) => prepareRef.current?.(args) ?? Promise.resolve("")
        : undefined,
      run: (args) => handlerRef.current(args),
    });
  }, [description, destructive, hasPrepare, id, name]);
}

export function useArtifactHost(id: ModuleId) {
  const api = useApi();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    api.bindRoot(id, ref.current);
    return () => api.bindRoot(id, null);
  }, [api, id]);
  return ref;
}

export function useArtifactReloadToken(id: ModuleId): number {
  return useApi().reloadToken[id] ?? 0;
}

function asArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function ArtifactRuntime({
  hideEquipo,
  children,
}: {
  hideEquipo: boolean;
  children: ReactNode;
}) {
  const [openIds, setOpenIds] = useState<ModuleId[]>([]);
  const [activeId, setActiveId] = useState<ModuleId | null>(null);
  const [reloadToken, setReloadToken] = useState<Record<string, number>>({});
  const hosts = useRef(new Map<ModuleId, Host>());
  const undoStack = useRef<UndoItem[]>([]);
  const pendingRef = useRef<PendingAct | null>(null);
  const openIdsRef = useRef(openIds);
  const activeIdRef = useRef(activeId);
  openIdsRef.current = openIds;
  activeIdRef.current = activeId;

  const methods = useMemo<Omit<ArtifactApi, "openIds" | "activeId" | "reloadToken">>(() => {
    const ensure = (id: ModuleId): Host => {
      const current = hosts.current.get(id);
      if (current) return current;
      const meta = findArtifact(hideEquipo, id);
      const host: Host = {
        id,
        title: meta?.title ?? id,
        version: 0,
        state: null,
        ready: false,
        root: null,
        actions: new Map(),
      };
      hosts.current.set(id, host);
      return host;
    };

    const viewOf = (host: Host): ArtifactPromptView => {
      const snapshot = host.root ? snapshotArtifact(host.root).text : "";
      return {
        id: host.id,
        title: host.title,
        version: host.version,
        state: host.state,
        snapshot,
        actions: [...host.actions.values()].map((action) => ({
          name: action.name,
          description: action.description,
          destructive: action.destructive,
          parameters: action.parameters,
        })),
      };
    };

    const waitReady = async (id: ModuleId) => {
      const start = Date.now();
      while (Date.now() - start < 8000) {
        const host = hosts.current.get(id);
        if (host?.ready && host.root) return host;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return hosts.current.get(id) ?? null;
    };

    const openScreen = (id: ModuleId) => {
      if (!findArtifact(hideEquipo, id)) return;
      ensure(id);
      setOpenIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
      setActiveId(id);
    };
    const closeScreen = (id: ModuleId) => {
      setOpenIds((current) => current.filter((item) => item !== id));
      setActiveId((current) => (current === id ? null : current));
    };

    return {
      hideEquipo,
      open: openScreen,
      close: closeScreen,
      focus: openScreen,
      reload(id) {
        setReloadToken((current) => ({
          ...current,
          [id]: (current[id] ?? 0) + 1,
        }));
      },
      setState(id, state) {
        const host = ensure(id);
        host.state = state;
        host.version += 1;
      },
      setReady(id, ready) {
        ensure(id).ready = ready;
      },
      bindRoot(id, root) {
        ensure(id).root = root;
      },
      registerAction(id, action) {
        const host = ensure(id);
        host.actions.set(action.name, action);
        return () => {
          if (host.actions.get(action.name) === action) {
            host.actions.delete(action.name);
          }
        };
      },
      pushUndo(item) {
        undoStack.current = [...undoStack.current.slice(-11), item];
      },
      async undo() {
        const item = undoStack.current.pop();
        if (!item) return null;
        return item.run();
      },
      pending() {
        return pendingRef.current;
      },
      clearPending() {
        pendingRef.current = null;
      },
      async execute(act, confirmed = false) {
        const args: Record<string, unknown> = {
          ...asArgs(act.args),
          ...(confirmed ? { confirmed: true } : {}),
        };
        if (act.op === "open_artifact") {
          const id = String(args.id ?? "") as ModuleId;
          if (!findArtifact(hideEquipo, id)) {
            return { ok: false, error: `No existe la pantalla ${id}.` };
          }
          openScreen(id);
          const host = await waitReady(id);
          if (!host?.ready) {
            return { ok: false, error: `No pude abrir ${id}.` };
          }
          const view = viewOf(host);
          return {
            ok: true,
            detail: `Abierta ${host.title}.`,
            version: view.version,
            state: view.state,
            snapshot: view.snapshot,
          };
        }
        if (act.op === "close_artifact") {
          const id = String(args.id ?? "") as ModuleId;
          closeScreen(id);
          return { ok: true, detail: `Cerré ${id}.` };
        }

        const artifactId = String(args.artifact ?? activeIdRef.current ?? "") as ModuleId;
        if (!artifactId) return { ok: false, error: "No hay pantalla activa." };
        openScreen(artifactId);
        const host = await waitReady(artifactId);
        if (!host?.root) {
          return { ok: false, error: `La pantalla ${artifactId} no está lista.` };
        }

        if (act.op === "ui_action") {
          const name = String(args.action ?? "");
          const action = host.actions.get(name);
          if (!action) {
            const names = [...host.actions.keys()].join(", ") || "ninguna";
            return { ok: false, error: `${artifactId} no tiene la acción ${name}. Hay: ${names}.` };
          }
          if ((action.destructive || isDestructiveLabel(name)) && !confirmed) {
            let prompt = `¿Confirmas ${action.name} en ${host.title}? Escribe sí.`;
            if (action.prepare) {
              try {
                const prepared = await action.prepare(asArgs(args.args));
                if (prepared) prompt = prepared;
              } catch (error) {
                return {
                  ok: false,
                  error: error instanceof Error ? error.message : "La acción falló.",
                };
              }
            }
            pendingRef.current = {
              act: { ...act, args: { ...args, artifact: artifactId } },
              prompt,
            };
            return { ok: false, needsConfirm: true, error: prompt };
          }
          try {
            const result = await action.run(asArgs(args.args));
            const view = viewOf(host);
            return {
              ok: true,
              result,
              detail: `${action.name} listo.`,
              version: view.version,
              state: view.state,
              snapshot: view.snapshot,
            };
          } catch (error) {
            return {
              ok: false,
              error: error instanceof Error ? error.message : "La acción falló.",
            };
          }
        }

        const op = act.op as Exclude<UiOp, "open_artifact" | "close_artifact" | "ui_action">;
        snapshotArtifact(host.root);
        const applied = applyA11y(host.root, op, args);
        if (!applied.ok && applied.needsConfirm) {
          pendingRef.current = {
            act: { ...act, args: { ...args, artifact: artifactId } },
            prompt: applied.error,
          };
          return applied;
        }
        const view = viewOf(host);
        return applied.ok
          ? { ...applied, version: view.version, state: view.state, snapshot: view.snapshot }
          : applied;
      },
      promptViews() {
        return openIdsRef.current
          .map((id) => hosts.current.get(id))
          .filter((host): host is Host => Boolean(host))
          .map(viewOf);
      },
    };
  }, [hideEquipo]);

  const api = useMemo<ArtifactApi>(
    () => ({ ...methods, openIds, activeId, reloadToken }),
    [activeId, methods, openIds, reloadToken],
  );

  return (
    <ArtifactContext.Provider value={api}>{children}</ArtifactContext.Provider>
  );
}
