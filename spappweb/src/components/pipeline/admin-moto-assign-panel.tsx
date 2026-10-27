"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { assignMotoByAdmin } from "@/lib/actions/admin-actions";
import {
  calcMotoPayment,
  cobraCuotaAdelantada,
  cuotaDiariaFromPeriodo,
  FRECUENCIA_PERIOD_LUN_SAB,
} from "@/lib/moto-payment";
import {
  CALENDARIO_LUN_SAB,
  anclaPreviewYmd,
  fechasTalonarioLunSab,
  periodosAnuales,
  periodosContratoFromAdminData,
} from "@/lib/payments/calendario-cobro";
import { formatDateOnly } from "@/lib/utils/format-date";
import { MONTO_VISITA_DEFAULT } from "@/lib/payments/visita-monto";
import type { BikeRow, FrecuenciaPago, UserMotoCompraRow } from "@/lib/pipeline/types";
import { FRECUENCIA_LABELS } from "@/lib/pipeline/types";
import { formatCop } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TouchSelect } from "@/components/ui/touch-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminMotoAssignPanelProps {
  compra: UserMotoCompraRow | null;
  bikes: BikeRow[];
  userId: number;
  documentId: number;
}

const FRECUENCIAS: FrecuenciaPago[] = [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
];

function initialForm(compra: UserMotoCompraRow | null) {
  if (!compra) {
    return {
      bikeId: "",
      frecuencia: "semanal" as FrecuenciaPago,
      cuotaInicial: null as number | null,
      cuotaDiaria: null as number | null,
      montoVisita: null as number | null,
      cuotaAdelantada: null as number | null,
      condicion: "nueva" as "nueva" | "segunda_mano",
      periodos: periodosAnuales("semanal", CALENDARIO_LUN_SAB),
    };
  }
  const calendario =
    compra.admin_data?.calendario_cobro === "lun_sab"
      ? CALENDARIO_LUN_SAB
      : "lun_dom";
  return {
    bikeId: compra.bike_id ? String(compra.bike_id) : "",
    frecuencia: compra.frecuencia_pago,
    cuotaInicial: compra.cuota_inicial_monto,
    cuotaDiaria: cuotaDiariaFromPeriodo(
      compra.monto_cuota_periodo,
      compra.frecuencia_pago,
      calendario,
    ),
    montoVisita: compra.monto_visita_monto,
    cuotaAdelantada:
      compra.monto_cuota_adelantada ??
      (cobraCuotaAdelantada(compra) ? compra.monto_cuota_periodo : 0),
    condicion:
      compra.admin_data?.condicion === "segunda_mano"
        ? ("segunda_mano" as const)
        : ("nueva" as const),
    periodos:
      periodosContratoFromAdminData(compra.admin_data) ??
      periodosAnuales(compra.frecuencia_pago, CALENDARIO_LUN_SAB),
  };
}

export function AdminMotoAssignPanel({
  compra,
  bikes,
  userId,
  documentId,
}: AdminMotoAssignPanelProps) {
  const [pending, startTransition] = useTransition();
  const init = initialForm(compra);
  const [bikeId, setBikeId] = useState(init.bikeId);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>(init.frecuencia);
  const [cuotaInicial, setCuotaInicial] = useState<number | null>(
    init.cuotaInicial,
  );
  const [cuotaDiaria, setCuotaDiaria] = useState<number | null>(init.cuotaDiaria);
  const [montoVisita, setMontoVisita] = useState<number | null>(init.montoVisita);
  const [cuotaAdelantada, setCuotaAdelantada] = useState<number | null>(
    init.cuotaAdelantada,
  );
  const [condicion, setCondicion] = useState<"nueva" | "segunda_mano">(
    init.condicion,
  );
  const [periodos, setPeriodos] = useState<number>(init.periodos);
  const [periodosTouched, setPeriodosTouched] = useState(false);

  const activeBikes = bikes.filter((b) => b.activo);
  const selectedBike = activeBikes.find((b) => String(b.id) === bikeId);

  function applyBikeDefaults(
    bike: BikeRow,
    nextFrecuencia: FrecuenciaPago,
    keepExisting: boolean,
  ) {
    if (keepExisting && compra && String(compra.bike_id) === String(bike.id)) {
      const form = initialForm(compra);
      setCuotaInicial(form.cuotaInicial);
      setCuotaDiaria(form.cuotaDiaria);
      setMontoVisita(form.montoVisita);
      setCuotaAdelantada(form.cuotaAdelantada);
      return;
    }
    setCuotaInicial(null);
    setCuotaDiaria(bike.cuota_diaria);
    setMontoVisita(bike.monto_visita ?? MONTO_VISITA_DEFAULT);
    const periodo = calcMotoPayment(bike, nextFrecuencia, {
      cuotaDiaria: bike.cuota_diaria,
      calendario: CALENDARIO_LUN_SAB,
    }).monto_cuota_periodo;
    setCuotaAdelantada(periodo);
  }

  const parsedInicial = cuotaInicial ?? Number.NaN;
  const parsedDiaria = cuotaDiaria ?? Number.NaN;
  const parsedVisita = montoVisita ?? Number.NaN;
  const parsedAdelantada = cuotaAdelantada ?? Number.NaN;

  const paymentPreview =
    selectedBike &&
    Number.isFinite(parsedInicial) &&
    Number.isFinite(parsedDiaria) &&
    Number.isFinite(parsedVisita) &&
    Number.isFinite(parsedAdelantada) &&
    parsedDiaria > 0 &&
    parsedVisita >= 0 &&
    parsedAdelantada >= 0
      ? calcMotoPayment(selectedBike, frecuencia, {
          cuotaInicial: parsedInicial,
          cuotaDiaria: parsedDiaria,
          montoVisita: parsedVisita,
          cuotaAdelantada: parsedAdelantada,
          calendario: CALENDARIO_LUN_SAB,
        })
      : null;

  const periodoCompleto =
    selectedBike && Number.isFinite(parsedDiaria) && parsedDiaria > 0
      ? calcMotoPayment(selectedBike, frecuencia, {
          cuotaDiaria: parsedDiaria,
          calendario: CALENDARIO_LUN_SAB,
        }).monto_cuota_periodo
      : null;

  const fechasPreview =
    Number.isInteger(periodos) && periodos > 0
      ? fechasTalonarioLunSab({
          anclaYmd: anclaPreviewYmd(),
          frecuencia,
          periodos,
        })
      : [];
  const primeraFecha = fechasPreview[0];
  const ultimaFecha = fechasPreview[fechasPreview.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asignar moto y placa</CardTitle>
        <p className="text-sm text-muted-foreground">
            Elige la moto, la duración en cuotas y la periodicidad. Las cuotas
          se pagan de lunes a sábado. El catálogo es solo referencia.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const parsedBikeId = Number(bikeId);
            if (!Number.isFinite(parsedBikeId) || parsedBikeId <= 0) {
              toast.error("Selecciona una moto.");
              return;
            }
            if (cuotaInicial == null || !Number.isFinite(parsedInicial)) {
              toast.error("Indica la cuota inicial acordada (puede ser $0).");
              return;
            }
            if (parsedInicial < 0) {
              toast.error("La cuota inicial no puede ser negativa.");
              return;
            }
            if (!Number.isFinite(parsedDiaria) || parsedDiaria <= 0) {
              toast.error("Indica una cuota diaria válida.");
              return;
            }
            if (!Number.isFinite(parsedVisita) || parsedVisita < 0) {
              toast.error("Indica un monto de visita válido (puede ser $0).");
              return;
            }
            if (!Number.isFinite(parsedAdelantada) || parsedAdelantada < 0) {
              toast.error(
                "Indica la cuota adelantada (puede ser $0 o cualquier valor).",
              );
              return;
            }
            if (!Number.isInteger(periodos) || periodos < 1) {
              toast.error("Indica cuántas cuotas dura el contrato.");
              return;
            }
            startTransition(async () => {
              try {
                await assignMotoByAdmin({
                  userId,
                  documentId,
                  bikeId: parsedBikeId,
                  frecuencia,
                  placa: String(fd.get("placa") || "").trim() || undefined,
                  chasis: String(fd.get("chasis")),
                  serialMotor: String(fd.get("serial_motor") || "").trim(),
                  referencia: String(fd.get("referencia") || "") || undefined,
                  cuotaInicial: parsedInicial,
                  cuotaDiaria: parsedDiaria,
                  montoVisita: parsedVisita,
                  cuotaAdelantada: parsedAdelantada,
                  condicion,
                  periodos,
                });
                toast.success(
                  "Moto asignada. Envía el link de contrato al cliente.",
                );
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Error al guardar.",
                );
              }
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="assign-moto">Moto (modelo · color)</Label>
              <TouchSelect
                id="assign-moto"
                aria-label="Moto"
                value={bikeId}
                onChange={(v) => {
                  setBikeId(v);
                  const bike = activeBikes.find((b) => String(b.id) === v);
                  if (bike) applyBikeDefaults(bike, frecuencia, true);
                }}
                placeholder="Seleccionar moto"
                options={activeBikes.map((b) => ({
                  value: String(b.id),
                  label: `${b.modelo} · ${b.color} (stock ${b.stock})`,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="assign-condicion">Condición</Label>
              <TouchSelect
                id="assign-condicion"
                aria-label="Condición"
                value={condicion}
                onChange={(v) =>
                  setCondicion(v === "segunda_mano" ? "segunda_mano" : "nueva")
                }
                options={[
                  { value: "nueva", label: "Nueva" },
                  { value: "segunda_mano", label: "Usada" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="assign-frecuencia">Frecuencia de pago</Label>
              <TouchSelect
                id="assign-frecuencia"
                aria-label="Frecuencia"
                value={frecuencia}
                onChange={(v) => {
                  const next = v as FrecuenciaPago;
                  setFrecuencia(next);
                  if (!periodosTouched) {
                    setPeriodos(periodosAnuales(next, CALENDARIO_LUN_SAB));
                  }
                  if (selectedBike && cuotaDiaria != null && cuotaDiaria > 0) {
                    const periodo = calcMotoPayment(selectedBike, next, {
                      cuotaDiaria,
                      calendario: CALENDARIO_LUN_SAB,
                    }).monto_cuota_periodo;
                    const prevPeriodo = calcMotoPayment(
                      selectedBike,
                      frecuencia,
                      { cuotaDiaria, calendario: CALENDARIO_LUN_SAB },
                    ).monto_cuota_periodo;
                    if (
                      cuotaAdelantada == null ||
                      cuotaAdelantada === prevPeriodo
                    ) {
                      setCuotaAdelantada(periodo);
                    }
                  }
                }}
                options={FRECUENCIAS.map((f) => ({
                  value: f,
                  label: `${FRECUENCIA_LABELS[f]} · ${FRECUENCIA_PERIOD_LUN_SAB[f]}`,
                }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="assign-periodos">Número de cuotas</Label>
              <Input
                id="assign-periodos"
                type="number"
                min={1}
                step={1}
                value={periodos}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPeriodosTouched(true);
                  setPeriodos(Number.isFinite(n) ? Math.floor(n) : 0);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Duración del contrato. Un año de cobro lun–sáb son{" "}
                {periodosAnuales(frecuencia, CALENDARIO_LUN_SAB)} cuotas{" "}
                {FRECUENCIA_LABELS[frecuencia].toLowerCase()}.
              </p>
            </div>
            {selectedBike && (
              <>
                <div className="sm:col-span-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                  Catálogo: inicial {formatCop(selectedBike.cuota_inicial)} ·{" "}
                  {formatCop(selectedBike.cuota_diaria)}/día · visita{" "}
                  {formatCop(selectedBike.monto_visita ?? MONTO_VISITA_DEFAULT)}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cuota-inicial">Cuota inicial negociada</Label>
                  <CurrencyInput
                    id="cuota-inicial"
                    value={cuotaInicial}
                    onValueChange={setCuotaInicial}
                    min={0}
                    placeholder="Acordado con el cliente"
                  />
                  <p className="text-xs text-muted-foreground">
                    Catálogo sugiere {formatCop(selectedBike.cuota_inicial)}.
                    Puede ser $0.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() =>
                        setCuotaInicial(selectedBike.cuota_inicial)
                      }
                    >
                      Usar precio catálogo
                    </button>
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cuota-diaria">Cuota diaria negociada</Label>
                  <CurrencyInput
                    id="cuota-diaria"
                    value={cuotaDiaria}
                    onValueChange={(v) => {
                      setCuotaDiaria(v);
                      if (selectedBike && v != null && v > 0) {
                        const periodo = calcMotoPayment(
                          selectedBike,
                          frecuencia,
                          {
                            cuotaDiaria: v,
                            calendario: CALENDARIO_LUN_SAB,
                          },
                        ).monto_cuota_periodo;
                        const prev =
                          cuotaDiaria != null && cuotaDiaria > 0
                            ? calcMotoPayment(selectedBike, frecuencia, {
                                cuotaDiaria,
                                calendario: CALENDARIO_LUN_SAB,
                              }).monto_cuota_periodo
                            : null;
                        if (
                          cuotaAdelantada == null ||
                          (prev != null && cuotaAdelantada === prev)
                        ) {
                          setCuotaAdelantada(periodo);
                        }
                      }
                    }}
                    min={1}
                    placeholder={String(selectedBike.cuota_diaria)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Base diaria acordada. Define la cuota periódica
                    {parsedAdelantada > 0
                      ? " y sirve de referencia para la adelantada."
                      : "; la periódica empieza después de la entrega."}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="cuota-adelantada">
                    Cuota adelantada en el primer pago
                  </Label>
                  <CurrencyInput
                    id="cuota-adelantada"
                    value={cuotaAdelantada}
                    onValueChange={setCuotaAdelantada}
                    min={0}
                    placeholder={
                      periodoCompleto != null
                        ? String(periodoCompleto)
                        : undefined
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Cualquier valor desde $0.{" "}
                    {periodoCompleto != null && (
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => setCuotaAdelantada(periodoCompleto)}
                      >
                        Usar periodo completo ({formatCop(periodoCompleto)})
                      </button>
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="monto-visita">Monto visita domiciliaria</Label>
                  <CurrencyInput
                    id="monto-visita"
                    value={montoVisita}
                    onValueChange={setMontoVisita}
                    min={0}
                    placeholder={String(
                      selectedBike.monto_visita ?? MONTO_VISITA_DEFAULT,
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor de la visita al domicilio (puede ser $0).
                  </p>
                </div>
                {paymentPreview && (
                  <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <p className="font-medium text-emerald-900">
                      Primer pago acordado
                    </p>
                    <p className="mt-1 text-emerald-800">
                      Inicial {formatCop(paymentPreview.cuota_inicial_monto)}
                      {paymentPreview.monto_cuota_adelantada > 0 && (
                        <>
                          {" "}
                          + adelantada{" "}
                          {formatCop(paymentPreview.monto_cuota_adelantada)}
                        </>
                      )}
                      {paymentPreview.monto_visita_monto > 0 && (
                        <>
                          {" "}
                          + visita {formatCop(paymentPreview.monto_visita_monto)}
                        </>
                      )}{" "}
                      ={" "}
                      <span className="font-semibold">
                        {formatCop(paymentPreview.monto_total_primer_pago)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-emerald-800/80">
                      {paymentPreview.monto_cuota_adelantada > 0
                        ? `Adelantada ${formatCop(paymentPreview.monto_cuota_adelantada)}. Cuota periódica ${formatCop(paymentPreview.monto_cuota_periodo)} (${FRECUENCIA_LABELS[frecuencia].toLowerCase()}, lun–sáb).`
                        : `Sin adelantada. Cuota periódica ${formatCop(paymentPreview.monto_cuota_periodo)} (${FRECUENCIA_LABELS[frecuencia].toLowerCase()}, lun–sáb) desde la entrega.`}
                    </p>
                    {periodos > 0 && primeraFecha && ultimaFecha && (
                      <p className="mt-1 text-xs text-emerald-800/80">
                        {periodos} cuotas de{" "}
                        {formatCop(paymentPreview.monto_cuota_periodo)}.
                        Ejemplo de vencimientos: {formatDateOnly(primeraFecha)}{" "}
                        a {formatDateOnly(ultimaFecha)} (ninguno en domingo).
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="placa">Placa (opcional)</Label>
              <Input
                id="placa"
                name="placa"
                defaultValue={compra?.placa ?? ""}
                placeholder="ABC123"
                className="uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chasis">Chasis</Label>
              <Input
                id="chasis"
                name="chasis"
                required
                defaultValue={compra?.chasis ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="serial_motor">Serial del motor</Label>
              <Input
                id="serial_motor"
                name="serial_motor"
                defaultValue={
                  compra?.serial_motor ?? compra?.admin_data?.serial_motor ?? ""
                }
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="referencia">Referencia (opcional)</Label>
              <Input
                id="referencia"
                name="referencia"
                defaultValue={compra?.referencia ?? ""}
              />
            </div>
          </div>
          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full bg-primary text-primary-foreground hover:bg-primary/80 sm:w-auto"
            disabled={pending}
          >
            Guardar moto y generar contrato
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
