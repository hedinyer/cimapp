"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import {
  abrirCaja,
  registrarMovimientoCaja,
  type CajaSesionState,
} from "@/lib/actions/caja-actions";
import {
  CajaArqueoDialog,
  CajaCerrarDialog,
  CuadreEfectivo,
} from "@/components/caja/caja-cerrar-dialog";
import { CajaInformePanel } from "@/components/caja/caja-informe-panel";
import { CajaPagosPanel } from "@/components/caja/caja-pagos-panel";
import { CajaVisitasPanel } from "@/components/caja/caja-visitas-panel";
import { formatCop, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function parseCopInput(raw: string): number | undefined {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function CajaCuadrePanel({
  initialSesion,
}: {
  initialSesion: CajaSesionState | null;
}) {
  const [sesion, setSesion] = useState(initialSesion);
  const [montoApertura, setMontoApertura] = useState("");
  const [notasApertura, setNotasApertura] = useState("");
  const [movTipo, setMovTipo] = useState<"entrada" | "salida">("entrada");
  const [movMonto, setMovMonto] = useState("");
  const [movConcepto, setMovConcepto] = useState("");
  const [arqueoOpen, setArqueoOpen] = useState(false);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [confirmAbrirOpen, setConfirmAbrirOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSesion(initialSesion);
  }, [initialSesion]);

  const montoAperturaNum = useMemo(
    () => parseCopInput(montoApertura),
    [montoApertura],
  );

  function requestAbrir() {
    if (montoAperturaNum == null || montoAperturaNum <= 0) {
      toast.error("El efectivo inicial debe ser mayor a 0.");
      return;
    }
    setConfirmAbrirOpen(true);
  }

  function handleAbrir() {
    const monto = parseCopInput(montoApertura);
    if (monto == null || monto <= 0) {
      toast.error("El efectivo inicial debe ser mayor a 0.");
      return;
    }
    startTransition(async () => {
      try {
        const next = await abrirCaja({
          montoApertura: monto,
          notas: notasApertura.trim() || undefined,
        });
        setSesion(next);
        setMontoApertura("");
        setNotasApertura("");
        setConfirmAbrirOpen(false);
        toast.success("Caja abierta.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo abrir la caja.",
        );
      }
    });
  }

  function handleMovimiento() {
    if (!sesion) return;
    const monto = parseCopInput(movMonto);
    if (monto == null || monto <= 0) {
      toast.error("Indica un monto válido.");
      return;
    }
    if (!movConcepto.trim()) {
      toast.error("Indica el concepto del movimiento.");
      return;
    }
    startTransition(async () => {
      try {
        const next = await registrarMovimientoCaja({
          sesionId: sesion.id,
          tipo: movTipo,
          monto,
          concepto: movConcepto.trim(),
        });
        setSesion(next);
        setMovMonto("");
        setMovConcepto("");
        toast.success(
          movTipo === "entrada" ? "Entrada registrada." : "Salida registrada.",
        );
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "No se pudo registrar el movimiento.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section
        className="tienda-card flex flex-col gap-5 p-4 sm:p-5"
        aria-labelledby="caja-dinero-titulo"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              id="caja-dinero-titulo"
              className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground"
            >
              {sesion?.abierta ? (
                <Unlock className="size-5" aria-hidden="true" />
              ) : (
                <Lock className="size-5" aria-hidden="true" />
              )}
              {sesion?.abierta ? "Caja abierta" : "Caja cerrada"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {sesion
                ? `Apertura: ${formatDate(sesion.openedAt)}${
                    sesion.closedAt
                      ? ` · Cierre: ${formatDate(sesion.closedAt)}`
                      : ""
                  }`
                : "Cuenta el efectivo y abre la caja para empezar el día."}
            </p>
          </div>
          {sesion ? (
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="sm:text-right">
                <p className="text-sm text-muted-foreground">Esperado en caja</p>
                <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {formatCop(sesion.efectivoEsperado)}
                </p>
              </div>
              {sesion.abierta ? (
                <Button
                  type="button"
                  className="min-h-11 active:scale-[0.96] motion-reduce:active:scale-100"
                  onClick={() => setCerrarOpen(true)}
                >
                  <Lock data-icon="inline-start" aria-hidden="true" />
                  Cerrar caja
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!sesion ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="caja-apertura-monto">
                ¿Cuánto efectivo hay ahora?
              </FieldLabel>
              <Input
                id="caja-apertura-monto"
                className="min-h-11"
                inputMode="numeric"
                placeholder="Ej. 200.000"
                value={montoApertura}
                onChange={(e) => setMontoApertura(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="caja-apertura-notas">
                Nota (opcional)
              </FieldLabel>
              <Textarea
                id="caja-apertura-notas"
                rows={2}
                value={notasApertura}
                onChange={(e) => setNotasApertura(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              className="min-h-11 w-fit active:scale-[0.96] motion-reduce:active:scale-100"
              disabled={pending}
              onClick={requestAbrir}
            >
              <Unlock data-icon="inline-start" aria-hidden="true" />
              {pending ? "Abriendo…" : "Abrir caja"}
            </Button>
          </FieldGroup>
        ) : sesion.montoCierre != null ? (
          <CuadreEfectivo sesion={sesion} />
        ) : null}

        {!sesion?.abierta && sesion?.notasCierre ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Notas de cierre:</span>{" "}
            {sesion.notasCierre}
          </p>
        ) : null}
      </section>

      {sesion ? (
        <Tabs defaultValue="resumen">
          <TabsList className="h-auto w-full gap-1 overflow-x-auto p-1">
            <TabsTrigger value="resumen" className="min-h-11 flex-1">
              Resumen
            </TabsTrigger>
            <TabsTrigger value="cobros" className="min-h-11 flex-1">
              Cobros
            </TabsTrigger>
            <TabsTrigger value="movimientos" className="min-h-11 flex-1">
              Movimientos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="flex flex-col gap-3">
            <div className="tienda-card p-3 sm:p-4">
              <CajaInformePanel
                informe={sesion.informe}
                visitasResumen={sesion.visitasResumen}
                title={sesion.abierta ? "Vista previa" : "Informe de cierre"}
              />
            </div>
            {!sesion.abierta ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-fit active:scale-[0.96] motion-reduce:active:scale-100"
                onClick={() => setArqueoOpen(true)}
              >
                Ver e imprimir arqueo
              </Button>
            ) : null}
          </TabsContent>

          <TabsContent value="cobros" className="flex flex-col gap-6">
            <CajaVisitasPanel sesion={sesion} onUpdated={setSesion} />
            {sesion.abierta ? (
              <CajaPagosPanel sesion={sesion} onUpdated={setSesion} />
            ) : null}
          </TabsContent>

          <TabsContent value="movimientos" className="flex flex-col gap-6">
            {sesion.movimientos.length > 0 ? (
              <ul
                className="tienda-card flex max-h-64 flex-col gap-1.5 overflow-y-auto p-2"
                aria-label="Movimientos del día"
              >
                {sesion.movimientos.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm hover:bg-muted/40"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      {m.tipo === "entrada" ? (
                        <ArrowDownCircle
                          className="size-4 shrink-0 text-green-600"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowUpCircle
                          className="size-4 shrink-0 text-destructive"
                          aria-hidden="true"
                        />
                      )}
                      {m.concepto}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {m.tipo === "salida" ? "−" : "+"}
                      {formatCop(m.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aún no hay movimientos manuales hoy.
              </p>
            )}

            {sesion.abierta ? (
              <section
                className="tienda-card flex flex-col gap-3 p-3 sm:p-4"
                aria-labelledby="caja-meter-sacar-titulo"
              >
                <div>
                  <h3
                    id="caja-meter-sacar-titulo"
                    className="text-base font-semibold text-foreground"
                  >
                    Meter o sacar plata
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Solo movimientos manuales (cambio, retiro, gasto menor).
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Tipo de movimiento"
                  className="flex w-full gap-1 rounded-xl bg-muted p-1"
                >
                  <button
                    type="button"
                    aria-pressed={movTipo === "entrada"}
                    onClick={() => setMovTipo("entrada")}
                    className={cn(
                      "min-h-11 flex-1 touch-manipulation rounded-lg px-3 text-sm font-medium transition-[color,transform,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96] motion-reduce:active:scale-100",
                      movTipo === "entrada"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Meter plata
                  </button>
                  <button
                    type="button"
                    aria-pressed={movTipo === "salida"}
                    onClick={() => setMovTipo("salida")}
                    className={cn(
                      "min-h-11 flex-1 touch-manipulation rounded-lg px-3 text-sm font-medium transition-[color,transform,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96] motion-reduce:active:scale-100",
                      movTipo === "salida"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Sacar plata
                  </button>
                </div>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="caja-mov-monto">¿Cuánto?</FieldLabel>
                    <Input
                      id="caja-mov-monto"
                      className="min-h-11"
                      inputMode="numeric"
                      value={movMonto}
                      onChange={(e) => setMovMonto(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="caja-mov-concepto">
                      ¿Para qué?
                    </FieldLabel>
                    <Input
                      id="caja-mov-concepto"
                      className="min-h-11"
                      placeholder="Ej. cambio, retiro, gasto menor…"
                      value={movConcepto}
                      onChange={(e) => setMovConcepto(e.target.value)}
                    />
                  </Field>
                </FieldGroup>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-fit active:scale-[0.96] motion-reduce:active:scale-100"
                  disabled={pending}
                  onClick={handleMovimiento}
                >
                  {movTipo === "entrada"
                    ? "Registrar entrada"
                    : "Registrar salida"}
                </Button>
              </section>
            ) : null}
          </TabsContent>
        </Tabs>
      ) : null}

      <AlertDialog open={confirmAbrirOpen} onOpenChange={setConfirmAbrirOpen}>
        <AlertDialogContent className="border-2 border-amber-400 bg-amber-50 sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-lg text-amber-950">
              ¿El efectivo inicial es correcto?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-amber-900">
              Mira bien el valor antes de abrir la caja. Si está mal, el cuadre
              del día saldrá errado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 text-center">
            <p className="caja-monto-blink rounded-xl px-4 py-5 text-3xl font-black tabular-nums tracking-tight sm:text-4xl">
              {formatCop(montoAperturaNum ?? 0)}
            </p>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Confirma solo si contaste este efectivo
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Revisar monto
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                handleAbrir();
              }}
            >
              {pending ? "Abriendo…" : "Sí, es correcto — abrir caja"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CajaCerrarDialog
        open={cerrarOpen}
        onOpenChange={setCerrarOpen}
        sesion={sesion}
        onClosed={(state) => {
          setSesion(state);
          setArqueoOpen(true);
        }}
      />
      <CajaArqueoDialog
        open={arqueoOpen}
        onOpenChange={setArqueoOpen}
        sesion={sesion}
      />
    </div>
  );
}
