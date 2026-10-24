"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CircleDollarSign,
  Bike,
  Download,
  Eye,
  Printer,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  listVentasProductoHistorial,
  type VentaProductoRow,
} from "@/lib/actions/venta-producto-actions";
import {
  listHistorialMotosCredito,
  type HistorialMotoVentaRow,
} from "@/lib/actions/historial-motos-actions";
import {
  getVentasContado,
  type VentaMotoRow,
} from "@/lib/actions/venta-moto-actions";
import { cn } from "@/lib/utils";
import { printVentaProductoReceipt } from "@/lib/printing/venta-producto-receipt";
import {
  downloadVentaMotoReceipt,
  getVentaMotoReceiptHtml,
  printVentaMotoReceipt,
} from "@/lib/printing/venta-moto-receipt";
import { formatCop, formatDate } from "@/lib/utils/format";
import { AbonoVentaProductoDialog } from "@/components/historial-ventas/abono-venta-producto-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const HISTORIAL_LIMIT = 500;

type PeriodoPreset = "hoy" | "ayer" | "semana" | "mes" | "rango";

const PRESETS: { id: PeriodoPreset; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "rango", label: "Elegir fechas" },
];

function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function startOfWeekYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function rangeForPreset(preset: PeriodoPreset): { desde: string; hasta: string } {
  const hoy = todayBogota();
  if (preset === "hoy") return { desde: hoy, hasta: hoy };
  if (preset === "ayer") {
    const ayer = addDaysYmd(hoy, -1);
    return { desde: ayer, hasta: ayer };
  }
  if (preset === "semana") return { desde: startOfWeekYmd(hoy), hasta: hoy };
  if (preset === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  return { desde: hoy, hasta: hoy };
}

function motoDesdeContado(venta: VentaMotoRow): HistorialMotoVentaRow {
  return {
    id: venta.id,
    origen: "contado",
    fecha: venta.createdAt,
    clienteNombre: venta.clienteNombre,
    clienteCedula: venta.clienteCedula,
    placa: venta.placa,
    modelo: venta.modelo,
    color: venta.color,
    monto: venta.valorVenta ?? venta.montoPagado,
    userId: null,
    ventaContado: venta,
  };
}

function reciboDesdeHistorial(venta: HistorialMotoVentaRow): VentaMotoRow {
  if (venta.ventaContado) return venta.ventaContado;
  return {
    id: venta.id,
    bikeId: null,
    modelo: venta.modelo,
    color: venta.color,
    placa: venta.placa,
    chasis: null,
    clienteNombre: venta.clienteNombre,
    clienteCedula: venta.clienteCedula ?? "",
    clienteCelular: "",
    clienteTipoDocumento: null,
    clienteDireccion: null,
    clienteCorreo: null,
    clienteFotoUrl: null,
    cuotaInicial: null,
    valorVenta: venta.monto,
    montoPagado: venta.monto,
    notas:
      venta.origen === "credito_liquidado" ? "Crédito liquidado" : null,
    createdAt: venta.fecha,
    entregadaAt: null,
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function searchableText(venta: VentaProductoRow): string {
  return normalize(
    [
      venta.clienteNombre,
      venta.clienteNombreReal ?? "",
      venta.clienteCedula ?? "",
      venta.clienteCelular,
      venta.motoPlaca ?? "",
      venta.motoModelo ?? "",
      venta.notas ?? "",
      ...venta.items.flatMap((i) => [i.nombre, i.sku]),
    ].join(" "),
  );
}

function searchableMoto(venta: HistorialMotoVentaRow): string {
  return normalize(
    [
      venta.clienteNombre,
      venta.clienteCedula ?? "",
      venta.placa ?? "",
      venta.modelo,
      venta.color,
      venta.origen,
    ].join(" "),
  );
}

export function HistorialVentasClient() {
  const [pending, startLoad] = useTransition();
  const [preset, setPreset] = useState<PeriodoPreset>("hoy");
  const initial = rangeForPreset("hoy");
  const [fechaDesde, setFechaDesde] = useState(initial.desde);
  const [fechaHasta, setFechaHasta] = useState(initial.hasta);
  const [ventas, setVentas] = useState<VentaProductoRow[]>([]);
  const [ventasMotos, setVentasMotos] = useState<HistorialMotoVentaRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [abonoVenta, setAbonoVenta] = useState<VentaProductoRow | null>(null);

  function load(next?: { desde?: string; hasta?: string }) {
    const desde = next?.desde ?? fechaDesde;
    const hasta = next?.hasta ?? fechaHasta;
    startLoad(async () => {
      try {
        const [productos, contado, creditos] = await Promise.all([
          listVentasProductoHistorial(HISTORIAL_LIMIT, { desde, hasta }),
          getVentasContado({ desde, hasta, limit: HISTORIAL_LIMIT }),
          listHistorialMotosCredito({ desde, hasta }),
        ]);
        setVentas(productos);
        setVentasMotos([
          ...contado.map(motoDesdeContado),
          ...creditos,
        ]);
        setTruncated(
          productos.length >= HISTORIAL_LIMIT ||
            contado.length >= HISTORIAL_LIMIT,
        );
        setLoaded(true);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo cargar el historial.",
        );
      }
    });
  }

  useEffect(() => {
    load();
    // Carga inicial de Hoy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPreset(next: PeriodoPreset) {
    setPreset(next);
    if (next === "rango") return;
    const range = rangeForPreset(next);
    setFechaDesde(range.desde);
    setFechaHasta(range.hasta);
    load({ desde: range.desde, hasta: range.hasta });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fechaDesde > fechaHasta) {
      toast.error("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }
    load();
  }

  const filteredProductos = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return ventas;
    const terms = q.split(/\s+/);
    return ventas.filter((venta) => {
      const haystack = searchableText(venta);
      return terms.every((term) => haystack.includes(term));
    });
  }, [ventas, query]);

  const filteredMotos = useMemo(() => {
    const q = normalize(query.trim());
    const sorted = [...ventasMotos].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );
    if (!q) return sorted;
    const terms = q.split(/\s+/);
    return sorted.filter((venta) => {
      const haystack = searchableMoto(venta);
      return terms.every((term) => haystack.includes(term));
    });
  }, [ventasMotos, query]);

  const totalVendido = filteredProductos.reduce((sum, v) => sum + v.total, 0);
  const totalUnidades = filteredProductos.reduce(
    (sum, v) => sum + v.items.reduce((s, i) => s + i.cantidad, 0),
    0,
  );
  const totalMotos = filteredMotos.reduce((sum, v) => sum + v.monto, 0);

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-3xl border border-border bg-background p-3 shadow-sm sm:p-4"
        aria-busy={pending}
      >
        <div className="flex flex-col gap-2">
          <span
            id="historial-periodo-label"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Periodo
          </span>
          <div
            role="group"
            aria-labelledby="historial-periodo-label"
            className="flex w-full flex-wrap gap-1 rounded-xl bg-muted p-1 lg:flex-nowrap"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => selectPreset(p.id)}
                className={cn(
                  "flex min-h-11 touch-manipulation items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-medium text-balance transition-[color,transform,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96] motion-reduce:active:scale-100 lg:min-w-0 lg:flex-1",
                  preset === p.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {preset === "rango" ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="hv-desde">Desde</FieldLabel>
              <Input
                id="hv-desde"
                type="date"
                className="min-h-11"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hv-hasta">Hasta</FieldLabel>
              <Input
                id="hv-hasta"
                type="date"
                className="min-h-11"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              className="min-h-11 w-fit active:scale-[0.96] motion-reduce:active:scale-100"
              disabled={pending}
            >
              {pending ? "Buscando…" : "Ver ventas"}
            </Button>
          </FieldGroup>
        ) : null}

        <div className="relative" role="search">
          <label htmlFor="historial-buscar" className="sr-only">
            Buscar en el historial
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="historial-buscar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, placa, producto…"
            className="min-h-11 pl-9"
            inputMode="search"
            autoComplete="off"
          />
        </div>
      </form>

      <p className="sr-only" role="status">
        {loaded
          ? `${filteredProductos.length + filteredMotos.length} ${
              filteredProductos.length + filteredMotos.length === 1
                ? "venta"
                : "ventas"
            } en el periodo${truncated ? ". Hay más resultados; acorta el rango." : ""}`
          : pending
            ? "Cargando ventas…"
            : ""}
      </p>

      <Tabs defaultValue="productos">
        <TabsList className="h-auto w-full max-w-full gap-1 overflow-x-auto p-1">
          <TabsTrigger
            value="productos"
            className="min-h-11 flex-1 touch-manipulation"
          >
            Productos de tienda ({filteredProductos.length})
          </TabsTrigger>
          <TabsTrigger
            value="motos"
            className="min-h-11 flex-1 touch-manipulation"
          >
            Motos ({filteredMotos.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="flex flex-col gap-4">
          {!loaded ? (
            <HistorialSkeleton />
          ) : (
            <>
              {ventas.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat
                    label="Ventas"
                    value={String(filteredProductos.length)}
                  />
                  <Stat label="Unidades" value={String(totalUnidades)} />
                  <Stat label="Total" value={formatCop(totalVendido)} />
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {query.trim()
                  ? `${filteredProductos.length} de ${ventas.length} en este periodo`
                  : `${ventas.length} en este periodo`}
                {truncated ? " Hay más resultados; acorta el rango." : ""}
              </p>
              {filteredProductos.length === 0 ? (
                <Empty className="border border-dashed border-border">
                  <EmptyHeader>
                    <EmptyTitle>
                      {ventas.length === 0
                        ? "No hay ventas en este periodo"
                        : "No aparece nada"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {ventas.length === 0
                        ? "Prueba otro día, semana o mes."
                        : "Prueba otra búsqueda o bórrala."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {filteredProductos.map((venta) => (
                    <VentaCard
                      key={venta.id}
                      venta={venta}
                      onAbonar={() => setAbonoVenta(venta)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="motos" className="flex flex-col gap-4">
          {!loaded ? (
            <HistorialSkeleton />
          ) : (
            <>
              {ventasMotos.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="Motos" value={String(filteredMotos.length)} />
                  <Stat label="Total" value={formatCop(totalMotos)} />
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {query.trim()
                  ? `${filteredMotos.length} de ${ventasMotos.length} en este periodo`
                  : `${ventasMotos.length} en este periodo`}
                {truncated ? " Hay más resultados; acorta el rango." : ""}
              </p>
              {filteredMotos.length === 0 ? (
                <Empty className="border border-dashed border-border">
                  <EmptyHeader>
                    <EmptyTitle>
                      {ventasMotos.length === 0
                        ? "No hay motos en este periodo"
                        : "No aparece nada"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {ventasMotos.length === 0
                        ? "Prueba otro día, semana o mes."
                        : "Prueba otra búsqueda o bórrala."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredMotos.map((venta) => (
                    <MotoVentaCard
                      key={`${venta.origen}-${venta.id}`}
                      venta={venta}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <AbonoVentaProductoDialog
        venta={abonoVenta}
        open={abonoVenta != null}
        onOpenChange={(open) => {
          if (!open) setAbonoVenta(null);
        }}
      />
    </div>
  );
}

function HistorialSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function PhotoThumb({
  src,
  alt,
  fallback,
}: {
  src: string | null;
  alt: string;
  fallback: "user" | "bike";
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      {fallback === "user" ? (
        <User className="h-8 w-8" />
      ) : (
        <Bike className="h-8 w-8" />
      )}
    </div>
  );
}

function MotoVentaCard({ venta }: { venta: HistorialMotoVentaRow }) {
  const [busy, startBusy] = useTransition();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const recibo = useMemo(() => reciboDesdeHistorial(venta), [venta]);

  function handleVer() {
    startBusy(async () => {
      try {
        const html = await getVentaMotoReceiptHtml(recibo);
        setPreviewHtml(html);
      } catch {
        toast.error("No se pudo abrir la factura.");
      }
    });
  }

  function handleDescargar() {
    startBusy(async () => {
      try {
        await downloadVentaMotoReceipt(recibo);
        toast.success("Factura descargada.");
      } catch {
        toast.error("No se pudo descargar la factura.");
      }
    });
  }

  function handleImprimir() {
    startBusy(async () => {
      try {
        await printVentaMotoReceipt(recibo);
      } catch {
        toast.error("No se pudo abrir la impresión de la factura.");
      }
    });
  }

  return (
    <>
      <Card className="border-border shadow-none">
        <CardContent className="flex flex-col gap-3 p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              {venta.userId ? (
                <Link
                  href={`/clientes/${venta.userId}`}
                  className="font-medium hover:underline"
                >
                  {venta.clienteNombre}
                </Link>
              ) : (
                <p className="font-medium">{venta.clienteNombre}</p>
              )}
              <p className="text-muted-foreground">
                {venta.modelo} · {venta.color}
              </p>
              {venta.placa ? (
                <p className="text-muted-foreground">Placa {venta.placa}</p>
              ) : null}
            </div>
            <Badge variant="outline" className="shrink-0 font-normal">
              {venta.origen === "contado" ? "Contado" : "Crédito liquidado"}
            </Badge>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{formatDate(venta.fecha)}</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatCop(venta.monto)}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={busy}
            onClick={handleVer}
          >
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            Ver factura
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={previewHtml != null}
        onOpenChange={(open) => {
          if (!open) setPreviewHtml(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col gap-4 bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Factura</DialogTitle>
            <DialogDescription>
              {venta.clienteNombre} · {venta.modelo} · {venta.color}
            </DialogDescription>
          </DialogHeader>
          {previewHtml ? (
            <iframe
              title={`Factura ${venta.clienteNombre}`}
              srcDoc={previewHtml}
              className="min-h-[50vh] w-full flex-1 rounded-lg border border-border bg-white"
            />
          ) : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:flex-1"
              disabled={busy}
              onClick={handleDescargar}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Descargar
            </Button>
            <Button
              type="button"
              className="min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/80 sm:flex-1"
              disabled={busy}
              onClick={handleImprimir}
            >
              <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VentaCard({
  venta,
  onAbonar,
}: {
  venta: VentaProductoRow;
  onAbonar: () => void;
}) {
  const [printing, startPrint] = useTransition();
  const saldo = venta.total - venta.montoPagado;
  const titulo =
    venta.clienteNombreReal ??
    (venta.motoPlaca && venta.clienteNombre.toUpperCase() === venta.motoPlaca
      ? venta.motoPlaca
      : venta.clienteNombre);
  const subtituloParts = [
    venta.motoPlaca && venta.clienteNombreReal
      ? `Placa ${venta.motoPlaca}`
      : null,
    venta.motoModelo
      ? `${venta.motoModelo}${venta.motoColor ? ` · ${venta.motoColor}` : ""}`
      : null,
    venta.clienteCelular,
    venta.clienteCedula ? `CC ${venta.clienteCedula}` : null,
  ].filter(Boolean);

  function handlePrint() {
    startPrint(async () => {
      try {
        await printVentaProductoReceipt(venta);
      } catch {
        toast.error("No se pudo abrir la impresión de la factura.");
      }
    });
  }

  return (
    <Card className="border-border shadow-none">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="photo-edge h-14 w-14 shrink-0 overflow-hidden rounded-lg">
            <PhotoThumb
              src={venta.clienteSelfieUrl}
              alt={`Foto de ${titulo}`}
              fallback="user"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{titulo}</p>
            {subtituloParts.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {subtituloParts.join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(venta.createdAt)}
            </p>
          </div>
          <p className="shrink-0 text-base font-semibold tabular-nums">
            {formatCop(venta.total)}
          </p>
        </div>
        <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
          {venta.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span className="truncate">
                {item.cantidad}× {item.nombre}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatCop(item.precioUnitario * item.cantidad)}
              </span>
            </li>
          ))}
        </ul>
        {saldo > 0 ? (
          <p className="text-xs text-amber-700">
            Falta por pagar {formatCop(saldo)}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          {saldo > 0 ? (
            <Button
              type="button"
              className="min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/80 sm:flex-1"
              onClick={onAbonar}
            >
              <CircleDollarSign className="mr-2 h-4 w-4" aria-hidden="true" />
              Abonar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:flex-1"
            disabled={printing}
            onClick={handlePrint}
          >
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            {printing ? "Imprimiendo…" : "Reimprimir"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
