import type { BikeRow, FrecuenciaPago } from "@/lib/pipeline/types";
import {
  CALENDARIO_LEGACY,
  type CalendarioCobro,
  diasCobroPorPeriodo,
} from "@/lib/payments/calendario-cobro";

/** Piso negociable de cuota inicial (COP). 0 = sin mínimo. */
export const MIN_CUOTA_INICIAL = 0;

export function cobraCuotaAdelantada(
  compra?: {
    monto_cuota_adelantada?: number | null;
    admin_data?: { cobra_cuota_adelantada?: boolean };
  } | null,
): boolean {
  if (compra?.monto_cuota_adelantada != null) {
    return compra.monto_cuota_adelantada > 0;
  }
  return compra?.admin_data?.cobra_cuota_adelantada !== false;
}

export function montoCuotaPeriodo(
  cuotaDiaria: number,
  frecuencia: FrecuenciaPago,
  calendario: CalendarioCobro = CALENDARIO_LEGACY,
): number {
  return cuotaDiaria * diasCobroPorPeriodo(frecuencia, calendario);
}

export function cuotaDiariaFromPeriodo(
  montoCuotaPeriodo: number,
  frecuencia: FrecuenciaPago,
  calendario: CalendarioCobro = CALENDARIO_LEGACY,
): number {
  const dias = diasCobroPorPeriodo(frecuencia, calendario);
  return dias === 1 ? montoCuotaPeriodo : Math.round(montoCuotaPeriodo / dias);
}

export function calcMotoPayment(
  bike: Pick<BikeRow, "cuota_inicial" | "cuota_diaria" | "monto_visita">,
  frecuencia: FrecuenciaPago,
  overrides?: {
    cuotaInicial?: number;
    cuotaDiaria?: number;
    montoVisita?: number;
    cobraCuotaAdelantada?: boolean;
    cuotaAdelantada?: number;
    calendario?: CalendarioCobro;
  },
) {
  const cuota_inicial_monto = overrides?.cuotaInicial ?? bike.cuota_inicial;
  const cuotaDiaria = overrides?.cuotaDiaria ?? bike.cuota_diaria;
  const monto_visita_monto = overrides?.montoVisita ?? bike.monto_visita ?? 0;
  const calendario = overrides?.calendario ?? CALENDARIO_LEGACY;
  const monto_cuota_periodo = montoCuotaPeriodo(
    cuotaDiaria,
    frecuencia,
    calendario,
  );

  let monto_cuota_adelantada: number;
  if (overrides?.cuotaAdelantada != null) {
    monto_cuota_adelantada = Math.max(0, overrides.cuotaAdelantada);
  } else if (overrides?.cobraCuotaAdelantada === false) {
    monto_cuota_adelantada = 0;
  } else {
    monto_cuota_adelantada = monto_cuota_periodo;
  }

  return {
    cuota_inicial_monto,
    monto_cuota_periodo,
    monto_cuota_adelantada,
    monto_visita_monto,
    monto_total_primer_pago:
      cuota_inicial_monto + monto_cuota_adelantada + monto_visita_monto,
  };
}

export const FRECUENCIA_PERIOD: Record<FrecuenciaPago, string> = {
  diario: "por día",
  semanal: "7 días · por adelantado",
  quincenal: "15 días · por adelantado",
  mensual: "30 días · por adelantado",
};

export const FRECUENCIA_PERIOD_LUN_SAB: Record<FrecuenciaPago, string> = {
  diario: "lun–sáb · por día",
  semanal: "lun–sáb · 6 días por adelantado",
  quincenal: "lun–sáb · 12 días por adelantado",
  mensual: "lun–sáb · 24 días por adelantado",
};
