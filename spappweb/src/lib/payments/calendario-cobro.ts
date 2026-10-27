import type { FrecuenciaPago } from "@/lib/pipeline/types";

/** Calendario de cobro del talonario. `lun_dom` es el histórico (incluye domingo). */
export type CalendarioCobro = "lun_dom" | "lun_sab";

export const CALENDARIO_LUN_SAB: CalendarioCobro = "lun_sab";
export const CALENDARIO_LEGACY: CalendarioCobro = "lun_dom";

/** Días de cobro que cubre cada cuota. */
export const DIAS_COBRO_POR_PERIODO: Record<
  CalendarioCobro,
  Record<FrecuenciaPago, number>
> = {
  lun_dom: { diario: 1, semanal: 7, quincenal: 15, mensual: 30 },
  lun_sab: { diario: 1, semanal: 6, quincenal: 12, mensual: 24 },
};

/** Cuotas de un año de cobro. */
export const PERIODOS_ANUALES_COBRO: Record<
  CalendarioCobro,
  Record<FrecuenciaPago, number>
> = {
  lun_dom: { diario: 365, semanal: 52, quincenal: 24, mensual: 12 },
  lun_sab: { diario: 312, semanal: 52, quincenal: 26, mensual: 13 },
};

export function calendarioFromAdminData(adminData: unknown): CalendarioCobro {
  if (!adminData || typeof adminData !== "object") return CALENDARIO_LEGACY;
  return (adminData as Record<string, unknown>).calendario_cobro === "lun_sab"
    ? CALENDARIO_LUN_SAB
    : CALENDARIO_LEGACY;
}

export function periodosContratoFromAdminData(
  adminData: unknown,
): number | undefined {
  if (!adminData || typeof adminData !== "object") return undefined;
  const n = Number((adminData as Record<string, unknown>).periodos_contrato);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export function periodosAnuales(
  frecuencia: FrecuenciaPago,
  calendario: CalendarioCobro = CALENDARIO_LEGACY,
): number {
  return PERIODOS_ANUALES_COBRO[calendario][frecuencia];
}

export function diasCobroPorPeriodo(
  frecuencia: FrecuenciaPago,
  calendario: CalendarioCobro = CALENDARIO_LEGACY,
): number {
  return DIAS_COBRO_POR_PERIODO[calendario][frecuencia];
}

export function parseIsoDateUtc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** ISO: 0 domingo … 6 sábado. */
export function isSundayUtc(date: Date): boolean {
  return date.getUTCDay() === 0;
}

export function skipSunday(date: Date): Date {
  return isSundayUtc(date) ? addUtcDays(date, 1) : date;
}

/** Siguiente día de cobro lun–sáb (el domingo no cobra). */
export function siguienteDiaCobro(date: Date): Date {
  return skipSunday(addUtcDays(date, 1));
}

export function todayBogotaYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

/** Ancla de preview: mañana en Bogotá, sin domingo. */
export function anclaPreviewYmd(): string {
  return formatIsoDateUtc(skipSunday(addUtcDays(parseIsoDateUtc(todayBogotaYmd()), 1)));
}

/**
 * Vencimientos lun–sáb: cada cuota cae el último día de cobro del grupo.
 * El ancla es el primer día de cobro (si es domingo, pasa al lunes).
 */
export function fechasTalonarioLunSab(args: {
  anclaYmd: string;
  frecuencia: FrecuenciaPago;
  periodos: number;
}): string[] {
  const periodos = Math.max(0, Math.floor(args.periodos));
  if (periodos === 0) return [];
  const size = diasCobroPorPeriodo(args.frecuencia, CALENDARIO_LUN_SAB);
  const needed = periodos * size;
  const dates: string[] = [];
  let current = skipSunday(parseIsoDateUtc(args.anclaYmd));
  for (let i = 1; i <= needed; i += 1) {
    if (i % size === 0) dates.push(formatIsoDateUtc(current));
    if (i < needed) current = siguienteDiaCobro(current);
  }
  return dates;
}

export function weekdayUtc(isoYmd: string): number {
  return parseIsoDateUtc(isoYmd).getUTCDay();
}
