import { CONTEXTO_PAGO_LABELS, MEDIO_PAGO_ADMIN_LABELS } from "@/lib/pipeline/types";
import type { MedioPagoAdminStored } from "@/lib/pipeline/types";
import {
  CAJA_MEDIO_EGRESO_LABELS,
  classifyMedioEgreso,
  classifyMedioPago,
  type CajaMedioEgreso,
} from "@/lib/caja/caja-medios";

export interface CajaPagoConfirmadoRow {
  id: string;
  userId?: number;
  clienteNombre?: string;
  monto: number;
  medio: MedioPagoAdminStored | "efectivo";
  medioLabel: string;
  contexto: string | null;
  contextoLabel: string;
  confirmadoAt: string;
}

export interface CajaVisitaPendiente {
  userId: number;
  compraId: string;
  clienteNombre: string;
  montoEsperado: number;
  montoRecibido: number;
  faltante: number;
}

export interface CajaVisitaCobrada {
  pagoId: string;
  userId: number;
  clienteNombre: string;
  monto: number;
  medioLabel: string;
  confirmadoAt: string;
}

export interface CajaVisitasResumen {
  cobradas: CajaVisitaCobrada[];
  pendientes: CajaVisitaPendiente[];
  totalCobradoSesion: number;
  totalPendiente: number;
}

export interface CajaEgresoRow {
  id: string;
  concepto: string;
  beneficiario: string | null;
  monto: number;
  medio: CajaMedioEgreso;
  medioLabel: string;
  notas: string | null;
  createdAt: string;
}

export interface CajaInformeEgresos {
  efectivo: number;
  bancolombia: number;
  total: number;
  cantidad: number;
}

export interface CajaInformeTransferencias {
  monto: number;
  cantidad: number;
  pagosCredito: number;
  pagosSalida: number;
}

export interface CajaInformeIngresos {
  efectivo: {
    apertura: number;
    ventasProducto: number;
    ventasMoto: number;
    pagosCredito: number;
    pagosVisitaEfectivo: number;
    entradasManuales: number;
    salidasManuales: number;
    pagosSalida: number;
    esperadoEnCaja: number;
  };
  bancolombia: CajaInformeTransferencias;
  /** @deprecated Informes guardados antes de Bancolombia CIM */
  nequi?: CajaInformeTransferencias;
  /** @deprecated Informes guardados antes de Bancolombia CIM */
  davivienda?: CajaInformeTransferencias;
  ingresosDia: number;
  egresosDia: number;
  netoDia: number;
  totalRecaudado: number;
  visitas: {
    monto: number;
    cantidad: number;
  };
  pagos: CajaPagoConfirmadoRow[];
  egresos: CajaInformeEgresos & {
    nequi?: number;
    davivienda?: number;
  };
  egresosDetalle: CajaEgresoRow[];
}

function medioLabel(medio: string | null): string {
  if (!medio) return "Sin medio";
  if (medio in MEDIO_PAGO_ADMIN_LABELS) {
    return MEDIO_PAGO_ADMIN_LABELS[medio as MedioPagoAdminStored];
  }
  if (medio in CAJA_MEDIO_EGRESO_LABELS) {
    return CAJA_MEDIO_EGRESO_LABELS[medio as CajaMedioEgreso];
  }
  if (medio === "nequi") return "Nequi";
  if (medio === "davivienda") return "Davivienda / Daviplata";
  return medio;
}

function emptyTransferencias(): CajaInformeTransferencias {
  return { monto: 0, cantidad: 0, pagosCredito: 0, pagosSalida: 0 };
}

/** Normaliza informes guardados con Nequi/Davivienda al shape actual. */
export function normalizeCajaInforme(
  raw: CajaInformeIngresos,
): CajaInformeIngresos {
  if (raw.bancolombia) {
    return {
      ...raw,
      egresos: {
        efectivo: raw.egresos.efectivo,
        bancolombia:
          raw.egresos.bancolombia ??
          (raw.egresos.nequi ?? 0) + (raw.egresos.davivienda ?? 0),
        total: raw.egresos.total,
        cantidad: raw.egresos.cantidad,
      },
    };
  }

  const nequi = raw.nequi ?? emptyTransferencias();
  const davivienda = raw.davivienda ?? emptyTransferencias();
  return {
    ...raw,
    bancolombia: {
      monto: nequi.monto + davivienda.monto,
      cantidad: nequi.cantidad + davivienda.cantidad,
      pagosCredito: nequi.pagosCredito + davivienda.pagosCredito,
      pagosSalida: nequi.pagosSalida + davivienda.pagosSalida,
    },
    egresos: {
      efectivo: raw.egresos.efectivo,
      bancolombia:
        (raw.egresos.nequi ?? 0) + (raw.egresos.davivienda ?? 0),
      total: raw.egresos.total,
      cantidad: raw.egresos.cantidad,
    },
  };
}

export function buildCajaInforme(input: {
  montoApertura: number;
  ventasProducto: number;
  ventasMoto: number;
  entradas: number;
  salidas: number;
  pagosRaw: Array<{
    id: string;
    user_id?: number;
    cliente_nombre?: string | null;
    monto: number;
    medio_pago_admin: string | null;
    contexto_pago: string | null;
    confirmado_at: string;
  }>;
  egresosRaw: Array<{
    id: string;
    concepto: string;
    beneficiario: string | null;
    monto: number;
    medio_pago: string;
    notas: string | null;
    created_at: string;
  }>;
}): CajaInformeIngresos {
  const pagos: CajaPagoConfirmadoRow[] = input.pagosRaw.map((p) => {
    const contexto = p.contexto_pago;
    const contextoLabel =
      contexto && contexto in CONTEXTO_PAGO_LABELS
        ? CONTEXTO_PAGO_LABELS[contexto as keyof typeof CONTEXTO_PAGO_LABELS]
        : "Pago crédito";
    return {
      id: p.id,
      userId: p.user_id,
      clienteNombre: p.cliente_nombre ?? undefined,
      monto: p.monto,
      medio: (p.medio_pago_admin ?? "efectivo") as MedioPagoAdminStored | "efectivo",
      medioLabel: medioLabel(p.medio_pago_admin),
      contexto,
      contextoLabel,
      confirmadoAt: p.confirmado_at,
    };
  });

  const egresosDetalle: CajaEgresoRow[] = input.egresosRaw.map((e) => {
    const kind = classifyMedioEgreso(e.medio_pago);
    const medio: CajaMedioEgreso =
      kind === "bancolombia" ? "bancolombia" : "efectivo";
    return {
      id: e.id,
      concepto: e.concepto,
      beneficiario: e.beneficiario,
      monto: e.monto,
      medio,
      medioLabel: CAJA_MEDIO_EGRESO_LABELS[medio],
      notas: e.notas,
      createdAt: e.created_at,
    };
  });

  let pagosEfectivo = 0;
  let pagosCreditoEfectivo = 0;
  let pagosVisitaEfectivo = 0;
  let pagosBancolombia = 0;
  let pagosVisita = 0;
  let countVisita = 0;
  let countBancolombia = 0;

  for (const p of pagos) {
    const kind = classifyMedioPago(p.medio);
    const isVisita = p.contexto === "visita";

    if (isVisita) {
      pagosVisita += p.monto;
      countVisita += 1;
      if (kind === "efectivo") pagosVisitaEfectivo += p.monto;
    }

    if (kind === "efectivo") {
      pagosEfectivo += p.monto;
      if (!isVisita) pagosCreditoEfectivo += p.monto;
    } else if (kind === "bancolombia") {
      pagosBancolombia += p.monto;
      countBancolombia += 1;
    } else {
      pagosEfectivo += p.monto;
      if (!isVisita) pagosCreditoEfectivo += p.monto;
    }
  }

  let egresoEfectivo = 0;
  let egresoBancolombia = 0;

  for (const e of egresosDetalle) {
    if (e.medio === "efectivo") egresoEfectivo += e.monto;
    else egresoBancolombia += e.monto;
  }

  const egresosDia = egresoEfectivo + egresoBancolombia;

  const ingresosDia =
    input.ventasProducto +
    input.ventasMoto +
    pagosEfectivo +
    pagosBancolombia +
    input.entradas -
    input.salidas;

  const esperadoEnCaja =
    input.montoApertura +
    input.ventasProducto +
    input.ventasMoto +
    pagosEfectivo +
    input.entradas -
    input.salidas -
    egresoEfectivo;

  return {
    efectivo: {
      apertura: input.montoApertura,
      ventasProducto: input.ventasProducto,
      ventasMoto: input.ventasMoto,
      pagosCredito: pagosCreditoEfectivo,
      pagosVisitaEfectivo,
      entradasManuales: input.entradas,
      salidasManuales: input.salidas,
      pagosSalida: egresoEfectivo,
      esperadoEnCaja,
    },
    bancolombia: {
      monto: pagosBancolombia,
      cantidad: countBancolombia,
      pagosCredito: pagosBancolombia,
      pagosSalida: egresoBancolombia,
    },
    ingresosDia,
    egresosDia,
    netoDia: ingresosDia - egresosDia,
    totalRecaudado: ingresosDia + input.montoApertura,
    visitas: {
      monto: pagosVisita,
      cantidad: countVisita,
    },
    pagos,
    egresos: {
      efectivo: egresoEfectivo,
      bancolombia: egresoBancolombia,
      total: egresosDia,
      cantidad: egresosDetalle.length,
    },
    egresosDetalle,
  };
}
