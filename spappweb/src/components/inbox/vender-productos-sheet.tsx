"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { Minus, Package, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  lookupProductoBySku,
  searchProductosVenta,
} from "@/lib/actions/venta-actions";
import { saveVentaProducto } from "@/lib/actions/venta-producto-actions";
import type { InventarioProductoRow } from "@/lib/pipeline/types";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Pistolas HID (SAT, etc.) teclean el código muy rápido y terminan con Enter/Tab. */
const SCAN_CHAR_GAP_MS = 55;
const SCAN_MIN_LEN = 3;

type CartLine = {
  productoId: number;
  sku: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  stock: number;
};

type CartAction =
  | { type: "add"; producto: InventarioProductoRow }
  | { type: "inc"; productoId: number }
  | { type: "dec"; productoId: number }
  | { type: "remove"; productoId: number }
  | { type: "clear" };

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "clear":
      return [];
    case "remove":
      return state.filter((l) => l.productoId !== action.productoId);
    case "add": {
      const existing = state.find((l) => l.productoId === action.producto.id);
      if (existing) {
        if (existing.cantidad >= action.producto.stock) {
          return state;
        }
        return state.map((l) =>
          l.productoId === action.producto.id
            ? { ...l, cantidad: l.cantidad + 1 }
            : l,
        );
      }
      if (action.producto.stock <= 0) return state;
      return [
        ...state,
        {
          productoId: action.producto.id,
          sku: action.producto.sku,
          nombre: action.producto.nombre,
          precioUnitario: Math.max(action.producto.precio, action.producto.costo),
          cantidad: 1,
          stock: action.producto.stock,
        },
      ];
    }
    case "inc":
      return state.map((l) => {
        if (l.productoId !== action.productoId) return l;
        if (l.cantidad >= l.stock) return l;
        return { ...l, cantidad: l.cantidad + 1 };
      });
    case "dec":
      return state
        .map((l) =>
          l.productoId === action.productoId
            ? { ...l, cantidad: l.cantidad - 1 }
            : l,
        )
        .filter((l) => l.cantidad > 0);
    default:
      return state;
  }
}

interface VenderProductosSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function VenderProductosSheet({
  open,
  onOpenChange,
  onSaved,
}: VenderProductosSheetProps) {
  const [pending, startTransition] = useTransition();
  const [searchPending, startSearchTransition] = useTransition();
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<InventarioProductoRow[]>([]);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteCedula, setClienteCedula] = useState("");
  const [clienteCelular, setClienteCelular] = useState("");
  const [montoPagado, setMontoPagado] = useState("");
  const [notas, setNotas] = useState("");
  const [mobileLayout, setMobileLayout] = useState(false);
  const sheetSide = mobileLayout ? "bottom" : "right";
  const busquedaRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const resultadosRef = useRef(resultados);
  resultadosRef.current = resultados;

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.precioUnitario * l.cantidad, 0),
    [lines],
  );

  function resetForm() {
    dispatch({ type: "clear" });
    setBusqueda("");
    setResultados([]);
    setListaAbierta(false);
    setClienteNombre("");
    setClienteCedula("");
    setClienteCelular("");
    setMontoPagado("");
    setNotas("");
  }

  function parseCopInput(raw: string): number | undefined {
    const n = Number(raw.replace(/\D/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  const addProducto = useCallback((producto: InventarioProductoRow) => {
    if (!producto.activo) {
      toast.error("Producto inactivo.");
      return;
    }
    if (producto.stock <= 0) {
      toast.error("Sin stock disponible.");
      return;
    }
    const inCart = linesRef.current.find((l) => l.productoId === producto.id);
    if (inCart && inCart.cantidad >= producto.stock) {
      toast.error("Ya agregaste todo el stock disponible.");
      return;
    }
    dispatch({ type: "add", producto });
    toast.success(`${producto.nombre} agregado`);
    setBusqueda("");
    setResultados([]);
    setListaAbierta(false);
    busquedaRef.current?.focus();
  }, []);

  const lookupAndAdd = useCallback(
    (rawSku: string) => {
      const sku = rawSku.trim();
      if (!sku) return;

      // Siempre muestra el código completo en el input (pistola HID).
      setBusqueda(sku);
      setListaAbierta(false);

      startTransition(async () => {
        try {
          const producto = await lookupProductoBySku(sku);
          addProducto(producto);
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Producto no encontrado.",
          );
          setBusqueda(sku);
          busquedaRef.current?.focus();
        }
      });
    },
    [addProducto],
  );

  const lookupAndAddRef = useRef(lookupAndAdd);
  lookupAndAddRef.current = lookupAndAdd;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMobileLayout(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => busquedaRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  /** Captura lecturas de pistola láser HID y las vuelca completas en el buscador. */
  useEffect(() => {
    if (!open) return;

    let buffer = "";
    let lastKeyAt = 0;

    const isBusquedaFocused = () =>
      document.activeElement === busquedaRef.current;

    const stripScanFromFocusedInput = (code: string) => {
      const el = document.activeElement;
      if (el === busquedaRef.current) return;
      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      const value = el.value;
      let stripLen = 0;
      for (let i = code.length; i >= 1; i--) {
        if (value.endsWith(code.slice(0, i))) {
          stripLen = i;
          break;
        }
      }
      if (stripLen === 0) return;

      const next = value.slice(0, value.length - stripLen);
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      valueSetter?.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;

      const now = performance.now();

      if (e.key === "Enter" || e.key === "Tab") {
        const code = buffer.trim();
        const recent =
          buffer.length >= SCAN_MIN_LEN &&
          now - lastKeyAt <= SCAN_CHAR_GAP_MS * 2;
        buffer = "";
        if (!recent) return;

        e.preventDefault();
        e.stopPropagation();
        stripScanFromFocusedInput(code);
        // Código completo en el input + búsqueda
        busquedaRef.current?.focus();
        lookupAndAddRef.current(code);
        return;
      }

      if (e.key.length !== 1) {
        if (e.key !== "Shift") buffer = "";
        return;
      }

      if (now - lastKeyAt > SCAN_CHAR_GAP_MS) {
        buffer = e.key;
      } else {
        buffer += e.key;
        // Si no está en el buscador, no ensuciar Nombre/Cédula/etc.
        // En el buscador dejamos pasar todas las teclas para ver el código entero.
        if (!isBusquedaFocused() && buffer.length >= 2) {
          e.preventDefault();
        }
      }
      lastKeyAt = now;
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      setListaAbierta(false);
      return;
    }

    const timer = window.setTimeout(() => {
      startSearchTransition(async () => {
        try {
          const items = await searchProductosVenta(q);
          setResultados(items);
          setListaAbierta(true);
        } catch {
          setResultados([]);
        }
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [busqueda]);

  function resolverBusqueda(raw?: string) {
    const trimmed = (raw ?? busqueda).trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const producto = await lookupProductoBySku(trimmed);
        addProducto(producto);
        return;
      } catch {
        // no es SKU exacto; sigue con sugerencias
      }

      const items = resultadosRef.current;
      if (items.length === 1) {
        addProducto(items[0]);
        return;
      }

      if (items.length > 1) {
        setListaAbierta(true);
        toast.error("Selecciona un producto de la lista.");
        return;
      }

      toast.error("Sin resultados.");
    });
  }

  function submit() {
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto.");
      return;
    }
    if (!clienteNombre.trim()) {
      toast.error("Indica el nombre del cliente.");
      return;
    }
    if (clienteCelular.trim().length < 10) {
      toast.error("Indica un celular válido.");
      return;
    }

    const pagado = parseCopInput(montoPagado) ?? total;
    if (pagado > total) {
      toast.error("El pago no puede superar el total.");
      return;
    }

    startTransition(async () => {
      try {
        const venta = await saveVentaProducto({
          clienteNombre: clienteNombre.trim(),
          clienteCedula: clienteCedula.trim() || undefined,
          clienteCelular: clienteCelular.trim(),
          montoPagado: pagado,
          notas: notas.trim() || undefined,
          items: lines.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
          })),
        });
        await printVentaProductoReceipt(venta);
        toast.success(
          "Venta guardada. Si no ves impresión, permite ventanas emergentes o usa Ctrl+P en la pestaña del recibo.",
        );
        resetForm();
        onOpenChange(false);
        onSaved?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  const cantidadEnCarrito = (productoId: number) =>
    lines.find((l) => l.productoId === productoId)?.cantidad ?? 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side={sheetSide}
        className={cn(
          "flex flex-col gap-0 p-0 sm:max-w-md",
          sheetSide === "bottom" && "h-[92dvh] max-h-[92dvh] rounded-t-2xl",
        )}
      >
        <SheetHeader className="border-b border-border px-4 pb-3 pt-4">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Venta productos
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          <div className="flex flex-col gap-4 px-4 py-4">
            <div className="relative">
              <p className="mb-2 text-sm text-muted-foreground">
                Busca por nombre o código, o escanea con la pistola SAT
              </p>
              <div className="flex gap-2">
                <Input
                  ref={busquedaRef}
                  type="text"
                  inputMode="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Nombre, código o escaneo…"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onFocus={() => {
                    if (resultados.length > 0) setListaAbierta(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Valor nativo: la pistola escribe más rápido que React state
                      const code = e.currentTarget.value.trim();
                      if (code) setBusqueda(code);
                      resolverBusqueda(code);
                    }
                    if (e.key === "Escape") {
                      setListaAbierta(false);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resolverBusqueda()}
                  disabled={pending || searchPending}
                >
                  Agregar
                </Button>
              </div>

              {listaAbierta && busqueda.trim().length >= 2 ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                  {searchPending && resultados.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      Buscando…
                    </p>
                  ) : null}
                  {!searchPending && resultados.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      Sin resultados
                    </p>
                  ) : null}
                  {resultados.map((p) => {
                    const enCarrito = cantidadEnCarrito(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={cn(
                          "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted/50",
                          p.stock <= 0 && "opacity-50",
                          enCarrito > 0 && "bg-muted/40",
                        )}
                        disabled={p.stock <= 0 || enCarrito >= p.stock}
                        onClick={() => addProducto(p)}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                          <span>{p.nombre}</span>
                          {enCarrito > 0 ? (
                            <span className="shrink-0 text-xs font-semibold text-foreground">
                              ×{enCarrito}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.sku} · {formatCop(Math.max(p.precio, p.costo))} ·
                          stock {p.stock}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                Escanea un código o busca por nombre para agregar productos.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map((line) => (
                  <div
                    key={line.productoId}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{line.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.sku}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Quitar"
                        onClick={() =>
                          dispatch({
                            type: "remove",
                            productoId: line.productoId,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            dispatch({
                              type: "dec",
                              productoId: line.productoId,
                            })
                          }
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-8 text-center font-medium">
                          {line.cantidad}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={line.cantidad >= line.stock}
                          onClick={() =>
                            dispatch({
                              type: "inc",
                              productoId: line.productoId,
                            })
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <span className="font-semibold">
                        {formatCop(line.precioUnitario * line.cantidad)}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-right text-base font-bold">
                  Total: {formatCop(total)}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-sm font-medium">Cliente</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-cliente-nombre">Nombre</Label>
                <Input
                  id="prod-cliente-nombre"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-cliente-cedula">Cédula</Label>
                  <Input
                    id="prod-cliente-cedula"
                    inputMode="numeric"
                    value={clienteCedula}
                    onChange={(e) => setClienteCedula(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-cliente-celular">Celular</Label>
                  <Input
                    id="prod-cliente-celular"
                    inputMode="tel"
                    value={clienteCelular}
                    onChange={(e) => setClienteCelular(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-sm font-medium">Pago</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-monto-pagado">Pagado hoy</Label>
                <Input
                  id="prod-monto-pagado"
                  inputMode="numeric"
                  placeholder={total > 0 ? String(total) : "0"}
                  value={montoPagado}
                  onChange={(e) => setMontoPagado(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={total <= 0}
                onClick={() => setMontoPagado(String(total))}
              >
                Marcar pago de contado
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="prod-notas">Notas</Label>
              <Input
                id="prod-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <Button
            type="button"
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/80"
            disabled={pending || lines.length === 0}
            onClick={submit}
          >
            <Printer className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar e imprimir"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
