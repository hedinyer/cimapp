export const CAJA_MEDIO_EGRESO_VALUES = ["efectivo", "bancolombia"] as const;

export type CajaMedioEgreso = (typeof CAJA_MEDIO_EGRESO_VALUES)[number];

export const CAJA_MEDIO_EGRESO_LABELS: Record<CajaMedioEgreso, string> = {
  efectivo: "Efectivo",
  bancolombia: "Bancolombia CIM",
};

export function classifyMedioPago(
  medio: string | null,
): "efectivo" | "bancolombia" | "otro" {
  if (!medio || medio === "efectivo" || medio === "datafono") return "efectivo";
  if (
    medio === "bancolombia_cim" ||
    medio === "bancolombia" ||
    medio === "davivienda" ||
    medio.startsWith("nequi")
  ) {
    return "bancolombia";
  }
  return "otro";
}

export function classifyMedioEgreso(
  medio: string | null,
): "efectivo" | "bancolombia" | "otro" {
  if (!medio || medio === "efectivo") return "efectivo";
  if (
    medio === "bancolombia" ||
    medio === "nequi" ||
    medio === "davivienda"
  ) {
    return "bancolombia";
  }
  return "otro";
}
