"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Package, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { addOrdenRepuesto, addTarea } from "@/lib/actions/taller-actions";
import {
  zonaMotoLabel,
  zonaMotoTareasRapidas,
  type ZonaMotoId,
} from "@/lib/taller/zonas-moto";
import type { TareaGravedad } from "@/lib/taller/types";
import { GRAVEDAD_LABEL } from "@/lib/taller/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const GRAVEDAD_BTN: Record<
  TareaGravedad,
  { bg: string; active: string; icon: string }
> = {
  bien: {
    bg: "border-emerald-300 hover:bg-emerald-50",
    active: "bg-emerald-600 text-white border-emerald-600",
    icon: "✓",
  },
  pronto: {
    bg: "border-amber-300 hover:bg-amber-50",
    active: "bg-amber-500 text-white border-amber-500",
    icon: "!",
  },
  urgente: {
    bg: "border-red-300 hover:bg-red-50",
    active: "bg-red-600 text-white border-red-600",
    icon: "!!",
  },
};

type ProductoLite = {
  id: number;
  nombre: string;
  sku: string;
  stock: number;
  precio: number;
  imagen_url: string | null;
};

export function TallerZonaSheet({
  ordenId,
  zona,
  open,
  onOpenChange,
  productos = [],
}: {
  ordenId: string;
  zona: ZonaMotoId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productos?: ProductoLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gravedad, setGravedad] = useState<TareaGravedad>("pronto");
  const [nota, setNota] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [prodQ, setProdQ] = useState("");
  const [selectedProd, setSelectedProd] = useState<ProductoLite | null>(null);
  const [cantidad, setCantidad] = useState(1);

  const label = zona ? zonaMotoLabel(zona) : "";
  const rapidas = zona ? zonaMotoTareasRapidas(zona) : [];

  const productosFiltrados = useMemo(() => {
    const q = prodQ.trim().toLowerCase();
    if (!q) return productos.slice(0, 20);
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [productos, prodQ]);

  function reset() {
    setGravedad("pronto");
    setNota("");
    setChip(null);
    setProdQ("");
    setSelectedProd(null);
    setCantidad(1);
  }

  function save() {
    if (!zona || !nota.trim()) return;
    const text = nota.trim();
    const prod = selectedProd;
    const qty = cantidad;
    startTransition(async () => {
      const r = await addTarea({
        ordenId,
        zona,
        nota: text,
        gravedad,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      if (prod) {
        const rr = await addOrdenRepuesto({
          ordenId,
          productoId: prod.id,
          cantidad: qty,
          zona,
        });
        if (!rr.ok) {
          toast.error(`Tarea guardada, pero el repuesto falló: ${rr.error}`);
          reset();
          onOpenChange(false);
          router.refresh();
          return;
        }
        toast.success(
          rr.stockWarning
            ? `Tarea + repuesto. ${rr.stockWarning}`
            : "Tarea y repuesto enviados a Sebastian",
        );
      } else {
        toast.success("Tarea guardada");
      }

      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 safe-area-bottom"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3">
          <SheetTitle>{label || "Parte de la moto"}</SheetTitle>
          <SheetDescription>
            Anota el trabajo y, si hace falta, elige el repuesto del inventario.
          </SheetDescription>
        </SheetHeader>

        {zona ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
              <div
                className="grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label="Qué tan grave"
              >
                {(["bien", "pronto", "urgente"] as const).map((g) => {
                  const active = gravedad === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setGravedad(g)}
                      className={cn(
                        "flex min-h-14 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl border-2 text-sm font-semibold",
                        active ? GRAVEDAD_BTN[g].active : GRAVEDAD_BTN[g].bg,
                      )}
                    >
                      <span aria-hidden className="text-lg">
                        {GRAVEDAD_BTN[g].icon}
                      </span>
                      {GRAVEDAD_LABEL[g]}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Tareas rápidas</p>
                <div className="flex flex-wrap gap-2">
                  {rapidas.map((t) => {
                    const on = chip === t;
                    return (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        className="min-h-10 touch-manipulation"
                        onClick={() => {
                          setChip(t);
                          setNota(t);
                        }}
                      >
                        {on ? <Check className="size-3.5" /> : null}
                        {t}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tarea-nota">Qué vas a hacer</Label>
                <Textarea
                  id="tarea-nota"
                  value={nota}
                  onChange={(e) => {
                    setNota(e.target.value);
                    setChip(null);
                  }}
                  placeholder="Ej.: Pastillas al 2 mm, cambiar ya"
                  className="min-h-24 text-base"
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Package className="size-4" />
                  Repuesto del inventario{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </p>
                {selectedProd ? (
                  <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {selectedProd.nombre}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        × {cantidad} · Hay {selectedProd.stock}
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="size-9"
                        aria-label="Menos"
                        onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center tabular-nums">
                        {cantidad}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="size-9"
                        aria-label="Más"
                        onClick={() => setCantidad((c) => c + 1)}
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-9"
                      aria-label="Quitar repuesto"
                      onClick={() => {
                        setSelectedProd(null);
                        setCantidad(1);
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={prodQ}
                      onChange={(e) => setProdQ(e.target.value)}
                      placeholder="Buscar en inventario…"
                      className="min-h-11 text-base"
                      autoComplete="off"
                    />
                    <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto overscroll-contain">
                      {productosFiltrados.length === 0 ? (
                        <li className="px-1 py-3 text-sm text-muted-foreground">
                          {productos.length === 0
                            ? "No hay productos cargados."
                            : "Nada coincide. Prueba otra búsqueda."}
                        </li>
                      ) : (
                        productosFiltrados.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedProd(p)}
                              className="flex w-full min-h-12 touch-manipulation items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm active:bg-muted"
                            >
                              {p.imagen_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.imagen_url}
                                  alt=""
                                  className="size-10 rounded object-cover"
                                />
                              ) : (
                                <span className="flex size-10 items-center justify-center rounded bg-muted text-xs">
                                  —
                                </span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">
                                  {p.nombre}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Hay {p.stock}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="shrink-0 space-y-2 border-t border-border bg-background px-4 py-3">
              <Button
                type="button"
                className="min-h-12 w-full touch-manipulation gap-2 text-base"
                disabled={pending || !nota.trim()}
                onClick={save}
              >
                <Plus className="size-5" />
                {selectedProd ? "Guardar tarea y pedir repuesto" : "Guardar tarea"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full touch-manipulation gap-2"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" />
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
