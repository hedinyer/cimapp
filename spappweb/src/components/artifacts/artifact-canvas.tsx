"use client";

import { ModulePanelView } from "@/components/ai-test/module-panel";
import { useArtifactRuntime } from "@/components/artifacts/artifact-runtime";
import { listArtifacts } from "@/lib/artifacts/catalog";
import { cn } from "@/lib/utils";

export function ArtifactCanvas({ className }: { className?: string }) {
  const api = useArtifactRuntime();
  const catalog = listArtifacts(api.hideEquipo);
  const titleOf = (id: string) =>
    catalog.find((item) => item.id === id)?.title ?? id;

  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 flex-col border-border bg-background",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Pantallas</h2>
      </div>
      {api.openIds.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Pide una pantalla en el chat o escribe /caja, /inventario, /garaje.
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Pantallas abiertas"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-2"
          >
            {api.openIds.map((id) => {
              const selected = id === api.activeId;
              return (
                <div key={id} className="flex shrink-0 items-center">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full px-3 text-sm",
                      selected
                        ? "bg-foreground text-background"
                        : "bg-muted text-foreground",
                    )}
                    onClick={() => api.focus(id)}
                  >
                    {titleOf(id)}
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center text-sm text-muted-foreground"
                    aria-label={`Cerrar ${titleOf(id)}`}
                    onClick={() => api.close(id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {api.openIds.map((id) => (
              <div
                key={id}
                className={cn("h-full overflow-y-auto", id !== api.activeId && "hidden")}
              >
                <ModulePanelView id={id} title={titleOf(id)} />
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
