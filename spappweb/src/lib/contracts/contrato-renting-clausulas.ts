/**
 * Texto legal: Contrato de Renting Operativo de Motocicleta (plantilla CIM).
 * Placeholders comerciales los completa la asignación de moto al firmar.
 */

import type { FrecuenciaPago } from "../pipeline/types";
import { FRECUENCIA_LABELS } from "../pipeline/types";
import {
  CALENDARIO_LEGACY,
  type CalendarioCobro,
  calendarioFromAdminData,
  diasCobroPorPeriodo,
  periodosAnuales,
  periodosContratoFromAdminData,
} from "../payments/calendario-cobro";
import { formatCop } from "../utils/format-cop";

export const EMPRESA_PROPIETARIA = {
  razonSocial: "CIM – Comercializadora Internacional Automotriz S.A.S.",
  razonSocialCorto: "CIM",
  representante: "Daniel Enrique Londoño Palacio",
  cedula: "C.C. 1.047.409.769",
  ciudad: "Cartagena",
  nit: "901.913.624-2",
  email: "",
  direccion: "Pie de la Popa, Cra. 32 # 19 – 142, Cartagena",
  daviviendaConvenio: "",
  llave: "",
  daviplata: "",
  daviplataTitular: "",
  comprobanteBera: "",
  comprobanteNkd: "",
  marcaMoto: "BERA",
  logoFile: "logo-cim.png",
  firmaFile: "firma-daniel-londono.png",
} as const;

/** Marca comercial según el modelo de catálogo (NKD125 → AKT, BERA150 → BERA). */
export function marcaMotoFromModelo(modelo: string): string {
  const m = modelo.trim().toUpperCase();
  if (m.includes("NKD")) return "AKT";
  if (m.includes("BERA")) return "BERA";
  return EMPRESA_PROPIETARIA.marcaMoto;
}

export interface ContratoData {
  nombreContratante: string;
  cedulaContratante: string;
  /** Abreviatura del doc del contratante en firma (PPT, C.C., …). */
  tipoDocumentoContratante: string;
  direccionNotificaciones: string;
  ciudadContratante: string;
  departamentoContratante: string;
  fechaFirmaDia: string;
  fechaFirmaMes: string;
  fechaFirmaAnio: string;
  /** Celular del contratante (hoja de vida). */
  celularContratante: string;
  marca: string;
  modelo: string;
  linea: string;
  estado: string;
  chasis: string;
  motor: string;
  placa: string;
  color: string;
  referencia: string;
  cuotaInicial: string;
  valorCuota: string;
  frecuenciaPago: string;
  totalContrato: string;
  formaPagoSaldo: string;
  mediosPago: string;
  /** Cuotas/periodos del contrato (p. ej. 324 en renovación diaria). */
  diasContrato: number;
  /** Contrato de renovación (etiqueta en PDF y ficha). */
  esRenovacion: boolean;
  /** Texto de la cláusula de duración (ej. "un 12 meses" o "324 días"). */
  duracionTexto: string;
  /** "a las 5 p.m. de cada día" o "...de cobro (lunes a sábado)". */
  horarioCobro: string;
}

export type CondicionMotoContrato = "nueva" | "segunda_mano" | "recuperada";

export interface CompraContratoInput {
  modelo: string;
  color: string;
  placa: string;
  chasis: string;
  referencia: string | null;
  frecuencia_pago: FrecuenciaPago;
  cuota_inicial_monto: number;
  monto_cuota_periodo: number;
  condicion?: CondicionMotoContrato | null;
  /** Override del plazo en días/periodos (default anual según frecuencia). */
  diasContrato?: number | null;
  /** Número de cuotas (prioridad sobre diasContrato). */
  periodosContrato?: number | null;
  calendarioCobro?: CalendarioCobro;
  esRenovacion?: boolean;
}

export function estadoContratoFromCondicion(
  condicion?: string | null,
): "Nueva" | "Usada" {
  if (condicion === "segunda_mano" || condicion === "recuperada") return "Usada";
  return "Nueva";
}

export function condicionFromAdminData(
  adminData: unknown,
): CondicionMotoContrato | undefined {
  if (!adminData || typeof adminData !== "object") return undefined;
  const c = (adminData as Record<string, unknown>).condicion;
  if (c === "nueva" || c === "segunda_mano" || c === "recuperada") return c;
  return undefined;
}

export function diasContratoFromAdminData(adminData: unknown): number | undefined {
  if (!adminData || typeof adminData !== "object") return undefined;
  const d = Number((adminData as Record<string, unknown>).dias_contrato);
  return Number.isFinite(d) && d > 0 ? Math.floor(d) : undefined;
}

export { calendarioFromAdminData, periodosContratoFromAdminData };

export function esRenovacionFromAdminData(adminData: unknown): boolean {
  if (!adminData || typeof adminData !== "object") return false;
  return (adminData as Record<string, unknown>).es_renovacion === true;
}

export function compraToContratoInput(compra: {
  modelo: string;
  color: string;
  placa: string;
  chasis: string;
  referencia: string | null;
  frecuencia_pago: FrecuenciaPago;
  cuota_inicial_monto: number;
  monto_cuota_periodo: number;
  admin_data?: unknown;
}): CompraContratoInput {
  return {
    modelo: compra.modelo,
    color: compra.color,
    placa: compra.placa,
    chasis: compra.chasis,
    referencia: compra.referencia,
    frecuencia_pago: compra.frecuencia_pago,
    cuota_inicial_monto: compra.cuota_inicial_monto,
    monto_cuota_periodo: compra.monto_cuota_periodo,
    condicion: condicionFromAdminData(compra.admin_data),
    diasContrato: diasContratoFromAdminData(compra.admin_data),
    periodosContrato: periodosContratoFromAdminData(compra.admin_data),
    calendarioCobro: calendarioFromAdminData(compra.admin_data),
    esRenovacion: esRenovacionFromAdminData(compra.admin_data),
  };
}

export interface Clausula {
  titulo: string;
  texto: string;
}

export interface ClausulaBlock {
  title: string;
  clausulas: Clausula[];
}

const PERIODO_UNIDAD: Record<FrecuenciaPago, string> = {
  diario: "CUOTAS DIARIAS",
  semanal: "CUOTAS SEMANALES",
  quincenal: "CUOTAS QUINCENALES",
  mensual: "CUOTAS MENSUALES",
};

/** Periodos del contrato; si hay override de cuotas o días, lo usa. */
export function periodosContrato(
  frecuencia: FrecuenciaPago,
  diasContrato?: number | null,
  opts?: { periodos?: number | null; calendario?: CalendarioCobro },
): number {
  if (opts?.periodos != null && opts.periodos > 0) return opts.periodos;
  const calendario = opts?.calendario ?? CALENDARIO_LEGACY;
  if (diasContrato != null && diasContrato > 0) {
    if (frecuencia === "diario") return diasContrato;
    const dias = diasCobroPorPeriodo(frecuencia, calendario);
    return Math.max(1, Math.round(diasContrato / dias));
  }
  return periodosAnuales(frecuencia, calendario);
}

export function labelPeriodosContrato(
  frecuencia: FrecuenciaPago,
  periodos: number,
): string {
  return `${periodos} ${PERIODO_UNIDAD[frecuencia]}`;
}

export function duracionContratoTexto(
  frecuencia: FrecuenciaPago,
  diasContrato?: number | null,
  opts?: { periodos?: number | null; calendario?: CalendarioCobro },
): string {
  const calendario = opts?.calendario ?? CALENDARIO_LEGACY;
  const periodos = periodosContrato(frecuencia, diasContrato, opts);
  if (frecuencia === "diario" && periodos !== periodosAnuales("diario", calendario)) {
    return `${periodos} días`;
  }
  if (periodos === periodosAnuales(frecuencia, calendario) && frecuencia === "diario") {
    return "un 12 meses";
  }
  if (frecuencia === "mensual" && periodos === periodosAnuales("mensual", calendario)) {
    return "un 12 meses";
  }
  return `${periodos} ${PERIODO_UNIDAD[frecuencia].toLowerCase()}`;
}

export function horarioCobroTexto(calendario: CalendarioCobro = CALENDARIO_LEGACY): string {
  return calendario === "lun_sab"
    ? "a las 5 p.m. de cada día de cobro (lunes a sábado)"
    : "a las 5 p.m. de cada día";
}

export function buildFormaPagoSaldoText(
  frecuencia: FrecuenciaPago,
  valorCuota: string,
  diasContrato?: number | null,
  opts?: { periodos?: number | null; calendario?: CalendarioCobro },
): string {
  const periodos = periodosContrato(frecuencia, diasContrato, opts);
  const base = `El saldo restante será cancelado por EL ARRENDATARIO a favor de CIM en ${labelPeriodosContrato(frecuencia, periodos)} DE ${valorCuota} MCTE (${valorCuota}).`;
  if (opts?.calendario === "lun_sab") {
    return `${base} Las cuotas se pagan de lunes a sábado.`;
  }
  return base;
}

export function buildMediosPagoText(): string {
  return `efectivo o Bancolombia a nombre de ${EMPRESA_PROPIETARIA.razonSocialCorto}`;
}

export function totalContratoMonto(
  cuotaInicial: number,
  montoCuotaPeriodo: number,
  frecuencia: FrecuenciaPago,
  diasContrato?: number | null,
  opts?: { periodos?: number | null; calendario?: CalendarioCobro },
): number {
  return (
    cuotaInicial +
    montoCuotaPeriodo * periodosContrato(frecuencia, diasContrato, opts)
  );
}

export function buildContratoComercial(compra: CompraContratoInput): Omit<
  ContratoData,
  | "nombreContratante"
  | "cedulaContratante"
  | "tipoDocumentoContratante"
  | "direccionNotificaciones"
  | "ciudadContratante"
  | "departamentoContratante"
  | "fechaFirmaDia"
  | "fechaFirmaMes"
  | "fechaFirmaAnio"
  | "celularContratante"
> {
  const valorCuota = formatCop(compra.monto_cuota_periodo);
  const cuotaInicial = formatCop(compra.cuota_inicial_monto);
  const calendario = compra.calendarioCobro ?? CALENDARIO_LEGACY;
  const plazoOpts = {
    periodos: compra.periodosContrato,
    calendario,
  };
  const diasContrato = periodosContrato(
    compra.frecuencia_pago,
    compra.diasContrato,
    plazoOpts,
  );
  const esRenovacion = compra.esRenovacion === true;
  const total = formatCop(
    totalContratoMonto(
      compra.cuota_inicial_monto,
      compra.monto_cuota_periodo,
      compra.frecuencia_pago,
      compra.diasContrato,
      plazoOpts,
    ),
  );
  return {
    marca: marcaMotoFromModelo(compra.modelo),
    modelo: compra.modelo,
    linea: compra.modelo,
    estado: estadoContratoFromCondicion(compra.condicion),
    chasis: compra.chasis,
    motor: "N/A",
    placa: compra.placa,
    color: compra.color,
    referencia: compra.referencia?.trim() || "—",
    cuotaInicial,
    valorCuota,
    frecuenciaPago: FRECUENCIA_LABELS[compra.frecuencia_pago],
    totalContrato: total,
    formaPagoSaldo: buildFormaPagoSaldoText(
      compra.frecuencia_pago,
      valorCuota,
      compra.diasContrato,
      plazoOpts,
    ),
    mediosPago: buildMediosPagoText(),
    diasContrato,
    esRenovacion,
    duracionTexto: duracionContratoTexto(
      compra.frecuencia_pago,
      compra.diasContrato,
      plazoOpts,
    ),
    horarioCobro: horarioCobroTexto(calendario),
  };
}

const FRECUENCIAS: FrecuenciaPago[] = ["diario", "semanal", "quincenal", "mensual"];

function asFrecuencia(value: unknown): FrecuenciaPago {
  return FRECUENCIAS.includes(value as FrecuenciaPago)
    ? (value as FrecuenciaPago)
    : "diario";
}

/** Reconstruye ContratoData desde contrato_data guardado (+ compra si hay). */
export function buildContratoDataFromStored(
  stored: Record<string, unknown>,
  compra?: CompraContratoInput | null,
): ContratoData {
  const storedEstado = String(stored.moto_estado ?? "").toLowerCase();
  const frecuencia = asFrecuencia(
    compra?.frecuencia_pago ?? stored.frecuencia_pago,
  );
  const diasFromStored = Number(stored.dias_contrato);
  const diasContrato =
    compra?.diasContrato ??
    (Number.isFinite(diasFromStored) && diasFromStored > 0
      ? Math.floor(diasFromStored)
      : undefined);
  const periodosFromStored = Number(stored.periodos_contrato);
  const periodosContratoN =
    compra?.periodosContrato ??
    (Number.isFinite(periodosFromStored) && periodosFromStored > 0
      ? Math.floor(periodosFromStored)
      : undefined);
  const calendarioCobro =
    compra?.calendarioCobro ??
    (stored.calendario_cobro === "lun_sab" ? "lun_sab" : CALENDARIO_LEGACY);
  const esRenovacion =
    compra?.esRenovacion === true || stored.es_renovacion === true;
  const comercial = buildContratoComercial({
    modelo: String(compra?.modelo ?? stored.moto_modelo ?? ""),
    color: String(compra?.color ?? stored.moto_color ?? ""),
    placa: String(compra?.placa ?? stored.moto_placa ?? ""),
    chasis: String(compra?.chasis ?? stored.moto_chasis ?? ""),
    referencia: compra?.referencia ?? null,
    frecuencia_pago: frecuencia,
    cuota_inicial_monto: Number(
      compra?.cuota_inicial_monto ?? stored.cuota_inicial ?? 0,
    ),
    monto_cuota_periodo: Number(
      compra?.monto_cuota_periodo ?? stored.valor_cuota ?? 0,
    ),
    condicion:
      compra?.condicion ??
      (storedEstado === "usada" ? "segunda_mano" : "nueva"),
    diasContrato,
    periodosContrato: periodosContratoN,
    calendarioCobro,
    esRenovacion,
  });

  const tipoRaw = String(stored.tipo_documento_contratante ?? "").toLowerCase();
  const tipoDocumentoContratante =
    tipoRaw === "ppt"
      ? "PPT"
      : tipoRaw === "p"
        ? "PV"
        : tipoRaw === "cv"
          ? "CV"
          : "C.C.";

  return {
    nombreContratante: String(stored.nombre_contratante ?? ""),
    cedulaContratante: String(stored.cedula_contratante ?? ""),
    tipoDocumentoContratante,
    direccionNotificaciones: String(stored.direccion_notificaciones ?? ""),
    ciudadContratante: String(stored.ciudad_contratante ?? ""),
    departamentoContratante: String(stored.departamento_contratante ?? ""),
    fechaFirmaDia: String(stored.fecha_firma_dia ?? ""),
    fechaFirmaMes: String(stored.fecha_firma_mes ?? ""),
    fechaFirmaAnio: String(stored.fecha_firma_anio ?? ""),
    celularContratante: String(stored.celular_contratante ?? ""),
    ...comercial,
  };
}

export const introTemplate = `Entre los suscritos, de una parte, ${EMPRESA_PROPIETARIA.representante} mayor de edad, domiciliado en la ciudad de ${EMPRESA_PROPIETARIA.ciudad}, identificado con cédula de ciudadanía Nº 1.047.409.769, actuando en calidad de representante legal de ${EMPRESA_PROPIETARIA.razonSocial}, sociedad mercantil domiciliada en ${EMPRESA_PROPIETARIA.ciudad}, identificada con el Nit # ${EMPRESA_PROPIETARIA.nit}, ubicada en ${EMPRESA_PROPIETARIA.direccion}, quien en adelante se denominará indistintamente EL ARRENDADOR o CIM; y de otra, [NOMBRE_CONTRATANTE], identificado(a) con [TIPO_DOC_CONTRATANTE] No. [CEDULA_CONTRATANTE], domiciliado(a) en [DIRECCION_NOTIFICACIONES], [CIUDAD_CONTRATANTE] ([DEPARTAMENTO_CONTRATANTE]), quien en adelante se denominará EL ARRENDATARIO, se celebra el presente [TIPO_CONTRATO], regido por las siguientes cláusulas:`;

export const blocks: ClausulaBlock[] = [
  {
    title: "Cláusulas 1 a 5",
    clausulas: [
      {
        titulo: "PRIMERA. OBJETO.",
        texto:
          "Por medio del presente contrato, EL ARRENDADOR entrega a EL ARRENDATARIO, a título de arrendamiento operativo (renting), el uso y goce temporal de la motocicleta identificada en el Anexo de Condiciones Particulares y Acta de Entrega. CIM conserva la propiedad del vehículo durante toda la vigencia del contrato.",
      },
      {
        titulo: "SEGUNDA. IDENTIFICACIÓN DEL VEHÍCULO.",
        texto:
          "Marca: [MARCA]. Línea/referencia: [REFERENCIA]. Modelo: [MODELO]. Color: [COLOR]. Placa: [PLACA]. VIN/chasis: [CHASIS]. Motor: [MOTOR]. Estado: [ESTADO]. Los demás datos constarán en el Acta de Entrega.",
      },
      {
        titulo: "TERCERA. NATURALEZA DEL CONTRATO.",
        texto:
          "Las partes declaran que el negocio tiene como finalidad principal permitir el uso temporal de un activo de propiedad de CIM a cambio de un canon. No constituye compraventa, promesa de compraventa, financiación de adquisición ni transferencia de dominio. El tratamiento jurídico y tributario deberá atender la naturaleza económica de la operación y la legislación vigente.",
      },
      {
        titulo: "CUARTA. PROPIEDAD Y AUSENCIA DE TRANSFERENCIA AUTOMÁTICA.",
        texto:
          "La propiedad de la motocicleta permanece en CIM. La terminación del contrato, el pago total de los cánones o la restitución del vehículo no generan por sí mismos transferencia de dominio a favor de EL ARRENDATARIO.",
      },
      {
        titulo: "QUINTA. EVENTUAL VENTA POSTERIOR.",
        texto:
          "Al finalizar el contrato, CIM podrá, si comercialmente lo considera conveniente, ofrecer la motocicleta en venta. Cualquier venta deberá instrumentarse mediante negocio jurídico independiente y a un precio determinado con criterios comerciales y de mercado. Este contrato no contiene una opción de compra automática ni establece un precio residual obligatorio de transferencia.",
      },
    ],
  },
  {
    title: "Cláusulas 6 a 10",
    clausulas: [
      {
        titulo: "SEXTA. PLAZO.",
        texto:
          "El presente contrato empieza a correr con la entrega material de la motocicleta en las instalaciones de CIM. El plazo será de [DURACION], contado desde esa fecha de entrega. La prórroga requerirá acuerdo escrito de las partes, salvo renovación expresamente prevista en las Condiciones Particulares.",
      },
      {
        titulo: "SÉPTIMA. CANON.",
        texto:
          "EL ARRENDATARIO pagará un canon de [VALOR_CUOTA] ([FRECUENCIA_PAGO]), más los impuestos que legalmente correspondan. Valor total estimado del contrato: [TOTAL_CONTRATO]. Cuota inicial: [CUOTA_INICIAL], pagadera al momento de la entrega.\n\n[FORMA_PAGO_SALDO]\n\nLas cuotas deberán pagarse [HORARIO_COBRO], empezando a partir del día siguiente de la entrega material de la motocicleta en CIM. Medios de pago: [MEDIOS_PAGO]. La fecha, medio de pago, periodicidad y demás componentes económicos también constarán en el Anexo de Condiciones Particulares cuando aplique.",
      },
      {
        titulo: "OCTAVA. MORA.",
        texto:
          "El retardo o incumplimiento en el pago oportuno de los cánones de arrendamiento, o de cualquier otra suma de dinero a cargo de EL ARRENDATARIO en virtud del presente contrato, causará de pleno derecho y sin necesidad de requerimiento judicial o extrajudicial previo para constituir en mora, a los cuales EL ARRENDATARIO renuncia expresamente. El retardo o incumplimiento del ARRENDATARIO, también causará intereses moratorios a la tasa máxima legal permitida por la ley y certificada por la Superintendencia Financiera de Colombia para la correspondiente modalidad, los cuales se liquidarán diariamente desde el día siguiente al del vencimiento de la obligación hasta la fecha en que se verifique el pago efectivo. Asimismo, EL ARRENDATARIO asumirá la totalidad de los costos, honorarios y gastos de cobranza presencial, prejudicial o judicial en que deba incurrir CIM para el cobro de acreencias o para la recuperación física del vehículo, previo informe de los valores correspondientes conforme a la normativa de protección al consumidor aplicable.",
      },
      {
        titulo: "NOVENA. DESTINACIÓN Y USO.",
        texto:
          "La motocicleta será utilizada exclusivamente para fines lícitos y por los conductores autorizados. Cuando se autorice expresamente el uso para actividades de reparto, mensajería, plataformas tecnológicas u otras actividades productivas, dicho uso deberá quedar señalado en las Condiciones Particulares y estará sujeto a las condiciones de aseguramiento, mantenimiento y seguridad aplicables.",
      },
      {
        titulo: "DÉCIMA. CONDUCTORES AUTORIZADOS.",
        texto:
          "Solo podrán conducir la motocicleta las personas que cumplan los requisitos legales y contractuales y que hayan sido previamente informadas o autorizadas por CIM. El ARRENDATARIO responderá por la información suministrada sobre los conductores y por el uso realizado por ellos en los términos legalmente procedentes.",
      },
    ],
  },
  {
    title: "Cláusulas 11 a 15",
    clausulas: [
      {
        titulo: "DÉCIMA PRIMERA. LICENCIA Y DOCUMENTOS.",
        texto:
          "El conductor deberá portar y mantener vigentes los documentos exigidos por la normativa de tránsito. EL ARRENDATARIO deberá informar inmediatamente cualquier suspensión, pérdida o limitación que afecte la habilitación para conducir.",
      },
      {
        titulo: "DÉCIMA SEGUNDA. KILOMETRAJE.",
        texto:
          "El kilometraje incluido y el tratamiento del kilometraje excedente, si aplica, serán los indicados en las Condiciones Particulares y/o Acta de Entrega. El odómetro no podrá ser alterado, desconectado o manipulado.",
      },
      {
        titulo: "DÉCIMA TERCERA. MANTENIMIENTO.",
        texto:
          "El mantenimiento preventivo y, cuando corresponda, los correctivos estarán a cargo de la parte indicada en las Condiciones Particulares. EL ARRENDATARIO deberá cumplir las frecuencias y protocolos técnicos, conservar soportes y abstenerse de realizar modificaciones no autorizadas.\n\n" +
          buildClausulaMantenimientoText() +
          "\n\nLa omisión o retardo en la ejecución de los mantenimientos preventivos por parte del Arrendatario, faculta a CIM para: (i) inmovilizar o requerir la entrega del vehículo, (ii) trasladar directamente al arrendatario los costos de reparaciones por desgastes prematuros derivados de dicha negligencia, y (iii) rescindir la garantía o cobertura comercial contratada.",
      },
      {
        titulo: "DÉCIMA CUARTA. COMBUSTIBLE Y ELEMENTOS DE DESGASTE.",
        texto:
          "Combustible, lubricantes y consumibles ordinarios de operación estarán a cargo de EL ARRENDATARIO, salvo pacto distinto. Neumáticos, batería, frenos y demás elementos se atenderán conforme al plan de mantenimiento y a la cobertura contratada.",
      },
      {
        titulo: "DÉCIMA QUINTA. SOAT.",
        texto:
          "CIM mantendrá vigente y al día el Seguro Obligatorio de Accidentes de Tránsito (SOAT) correspondiente a la motocicleta durante toda la vigencia del contrato. Por su parte, EL ARRENDATARIO se obliga a:\n\ni) Portar y conservar en todo momento el documento físico o digital del SOAT vigente durante la operación del vehículo;\n\nii) Notificar a CIM con al menos cuarenta y cinco (45) días de anticipación al vencimiento del SOAT, para coordinar oportunamente su renovación y expedición; y\n\niii) En caso de accidente de tránsito, dar aplicación prioritaria e inmediata a la cobertura del SOAT conforme a las normas legales aplicables, informando de inmediato a las autoridades de tránsito y a CIM.",
      },
    ],
  },
  {
    title: "Cláusulas 16 a 20",
    clausulas: [
      {
        titulo: "DÉCIMA SEXTA. ACCIDENTES E INDEMNIDAD.",
        texto:
          "Ante un accidente, EL ARRENDATARIO deberá priorizar la seguridad de las personas, solicitar la asistencia de las autoridades cuando corresponda, informar a CIM inmediatamente y seguir el Protocolo de Accidentes. No podrá reconocer responsabilidad, conciliar daños o efectuar arreglos materiales en nombre de CIM sin autorización, salvo actuaciones urgentes legalmente necesarias. Como quiera que, EL ARRENDATARIO ostenta la guarda material, tenencia, dirección, uso y control exclusivo del vehículo, este mantendrá indemne a CIM frente a cualquier reclamación, sanción, demanda o proceso de responsabilidad civil contractual o extracontractual, penal o administrativa incoado por terceros o autoridades con ocasión del uso u operación de la motocicleta. Si CIM llegare a ser vinculada procesalmente o condenada por dichos conceptos, EL ARRENDATARIO deberá asumir directamente la defensa técnica, sufragar los costos y gastos procesales (incluyendo honorarios de abogados) y reembolsar a CIM el 100% de los montos que esta se viere obligada a pagar, dentro de los cinco (5) días hábiles siguientes al requerimiento escrito.",
      },
      {
        titulo: "DÉCIMA SÉPTIMA. HURTO, PÉRDIDA O SINIESTRO TOTAL.",
        texto:
          "En caso de hurto, tentativa de hurto, pérdida o siniestro total, EL ARRENDATARIO deberá denunciar e informar inmediatamente y suministrar la documentación requerida para la reclamación. La liquidación contractual se sujetará a la causa del evento y a las obligaciones legalmente exigibles.",
      },
      {
        titulo: "DÉCIMA OCTAVA. INFRACCIONES Y COMPARENDOS.",
        texto:
          "Las infracciones a las normas de tránsito, multas, comparendos, costos de grúa, patios, peritajes y demás trámites administrativos o judiciales causados durante la vigencia del contrato o con ocasión de la tenencia del bien, serán de cargo exclusivo de EL ARRENDATARIO o del conductor responsable.\n\nPARÁGRAFO PRIMERO: Si para evitar sanciones, embargos, limitaciones al dominio o la inmovilización prolongada del activo, CIM se viere forzada o decidiere cancelar directamente tales valores o adelantar gestiones de desempatado o rescate, EL ARRENDATARIO se obliga a reembolsar a CIM la totalidad de las sumas pagadas, más los gastos administrativos y de gestoría que se generen, dentro de los cinco (5) días hábiles siguientes al envío de la cuenta de cobro correspondiente acompañada de los comprobantes respectivos.\n\nPARÁGRAFO SEGUNDO: En caso de no verificar el reembolso dentro del término establecido, la suma adeudada causará intereses de mora a la tasa máxima legal permitida a favor de CIM, sin perjuicio de la facultad de cargar dicho monto al depósito de garantía de que trata la Cláusula Vigésima Sexta o de dar por terminado unilateralmente el presente contrato con justa causa.",
      },
      {
        titulo: "DÉCIMA NOVENA. CUSTODIA.",
        texto:
          "EL ARRENDATARIO deberá custodiar diligentemente la motocicleta, utilizar sistemas de seguridad razonables y evitar dejarla en lugares o condiciones que incrementen injustificadamente el riesgo de hurto o daño.",
      },
      {
        titulo: "VIGÉSIMA. GPS Y DATOS.",
        texto:
          "Si la motocicleta cuenta con dispositivo de geolocalización, su tratamiento se regirá por la autorización y política de tratamiento de datos correspondiente. La finalidad deberá estar informada y limitarse a fines legítimos como seguridad, gestión contractual, recuperación del activo, asistencia y administración del servicio, conforme a la normativa aplicable.\n\nSerá causal de terminación inmediata del contrato con justa causa la desconexión, alteración, manipulación no autorizada, retiro o interferencia del dispositivo de geolocalización (GPS) o de sus componentes por parte de EL ARRENDATARIO o terceros. En tal evento, CIM quedará facultada para requerir la restitución inmediata del bien y ejecutar las garantías correspondientes.",
      },
    ],
  },
  {
    title: "Cláusulas 21 a 26",
    clausulas: [
      {
        titulo: "VIGÉSIMA PRIMERA. PROHIBICIONES.",
        texto:
          "Se prohíbe subarrendar, ceder el uso a terceros no autorizados, alterar identificadores, modificar estructuralmente el vehículo, participar en carreras o actividades ilícitas, transportar sustancias u objetos ilícitos, utilizarlo para fines distintos de los autorizados o trasladarlo fuera de las zonas autorizadas cuando exista una restricción expresa y válida.",
      },
      {
        titulo: "VIGÉSIMA SEGUNDA. INSPECCIÓN.",
        texto:
          "CIM podrá solicitar revisiones razonables del estado del vehículo, previa coordinación, y podrá requerir fotografías, documentos o información necesaria para verificar el cumplimiento contractual, respetando los derechos del ARRENDATARIO y la normativa de protección de datos.",
      },
      {
        titulo: "VIGÉSIMA TERCERA. INCUMPLIMIENTO Y TERMINACIÓN.",
        texto:
          "Serán causas de terminación las previstas en la ley y las expresamente pactadas, incluyendo incumplimiento grave o reiterado, mora, uso no autorizado, ocultamiento o alteración del vehículo, imposibilidad jurídica de ejecución o pérdida de confianza derivada de hechos objetivamente verificables. Cuando corresponda, CIM requerirá el cumplimiento y aplicará el procedimiento legal antes de exigir la restitución.",
      },
      {
        titulo: "VIGÉSIMA CUARTA. RESTITUCIÓN.",
        texto:
          "Al terminar el contrato, EL ARRENDATARIO deberá restituir la motocicleta, llaves, accesorios y documentos en el lugar indicado por CIM. Se elaborará Acta de Devolución con kilometraje, estado general, daños y elementos entregados.",
      },
      {
        titulo: "VIGÉSIMA QUINTA. DESGASTE NORMAL.",
        texto:
          "No se cobrarán deterioros propios del uso normal y diligente. Los daños atribuibles a uso indebido, negligencia, accidente no cubierto, modificaciones no autorizadas o incumplimiento serán evaluados con soporte técnico y de conformidad con la ley.",
      },
      {
        titulo: "VIGÉSIMA SEXTA. GARANTÍAS.",
        texto:
          "Las garantías pactadas constarán en documento separado y podrán comprender pagaré y carta de instrucciones, depósito o garantía permitida por la ley, y/o codeudor o garante, según el perfil de riesgo. Ninguna garantía podrá extenderse más allá de las obligaciones válidamente garantizadas.",
      },
    ],
  },
  {
    title: "Cláusulas 27 a 31",
    clausulas: [
      {
        titulo: "VIGÉSIMA SÉPTIMA. DATOS PERSONALES Y CENTRALES DE INFORMACIÓN.",
        texto:
          "EL ARRENDATARIO autorizará, en documentos separados cuando corresponda, el tratamiento de sus datos personales y la consulta/reporte ante operadores de información, conforme a la legislación aplicable y a las finalidades informadas.",
      },
      {
        titulo: "VIGÉSIMA OCTAVA. CESIÓN.",
        texto:
          "CIM podrá ceder sus derechos económicos o posición contractual cuando legalmente proceda y se respeten los derechos del ARRENDATARIO. EL ARRENDATARIO no podrá ceder el contrato ni entregar el uso del vehículo sin autorización previa y escrita.",
      },
      {
        titulo: "VIGÉSIMA NOVENA. NOTIFICACIONES.",
        texto:
          `Las comunicaciones se efectuarán a los datos registrados en las Condiciones Particulares, incluyendo correo electrónico, dirección física, teléfono y/o canales digitales autorizados, respetando las reglas legales de notificación y protección de datos. CIM recibirá notificaciones en ${EMPRESA_PROPIETARIA.email || EMPRESA_PROPIETARIA.direccion} o en [DIRECCION_EMPRESA]; EL ARRENDATARIO, en la dirección: [DIRECCION_NOTIFICACIONES], teléfono: [CELULAR_CONTRATANTE].`,
      },
      {
        titulo: "TRIGÉSIMA. INTEGRIDAD CONTRACTUAL.",
        texto:
          "Forman parte integral del contrato las Condiciones Particulares, Acta de Entrega, Reglamento de Uso, protocolos y demás anexos efectivamente suscritos. En caso de contradicción, prevalecerá la norma imperativa y luego el contrato y sus anexos en el orden definido en las Condiciones Particulares.",
      },
      {
        titulo: "TRIGÉSIMA PRIMERA. DOMICILIO Y LEY APLICABLE.",
        texto:
          `El contrato se regirá por la legislación colombiana. Para efectos contractuales se tendrá como domicilio la ciudad de ${EMPRESA_PROPIETARIA.ciudad}, sin perjuicio de las reglas imperativas de competencia y protección al consumidor que resulten aplicables.`,
      },
    ],
  },
];

export function buildClausulaMantenimientoText(): string {
  return "Se informa al arrendatario que el primer cambio de aceite se realizará entre los 500 a 1000 kilómetros; segundo, tercero, cuarto, quinto, sexto, octavo, noveno, décimo, onceavo y doceavo cambio de aceite se contará 1000 kilómetros más desde el último cambio de aceite; todos los aceites se deberán pagar. Hay mantenimientos preventivos adicionales (preventivo, medio y general) obligatorios para obtener la garantía, que serán en la tercera, sexta y novena revisión, los cuales deberán ser pagados según las tarifas establecidas.";
}

export const firmaTemplate = `Para constancia se firma en ${EMPRESA_PROPIETARIA.ciudad} a los [DIA] días del mes de [MES] de [ANIO], por quienes intervinieron.`;

function applyContratantePlaceholders(text: string, form: ContratoData): string {
  return text
    .replaceAll("[CIUDAD_CONTRATANTE]", form.ciudadContratante || "_________________________")
    .replaceAll(
      "[DEPARTAMENTO_CONTRATANTE]",
      form.departamentoContratante || "_________________________",
    )
    .replaceAll(
      "[DIRECCION_NOTIFICACIONES]",
      form.direccionNotificaciones || "_________________________",
    )
    .replaceAll(
      "[CELULAR_CONTRATANTE]",
      form.celularContratante.trim() || "________________",
    )
    .replaceAll("[DIRECCION_EMPRESA]", EMPRESA_PROPIETARIA.direccion);
}

function applyComercialPlaceholders(text: string, form: ContratoData): string {
  return text
    .replaceAll("[MARCA]", form.marca)
    .replaceAll("[MODELO]", form.modelo)
    .replaceAll("[LINEA]", form.linea)
    .replaceAll("[ESTADO]", form.estado)
    .replaceAll("[CHASIS]", form.chasis)
    .replaceAll("[MOTOR]", form.motor)
    .replaceAll("[PLACA]", form.placa)
    .replaceAll("[COLOR]", form.color)
    .replaceAll("[REFERENCIA]", form.referencia)
    .replaceAll("[TOTAL_CONTRATO]", form.totalContrato)
    .replaceAll("[CUOTA_INICIAL]", form.cuotaInicial)
    .replaceAll("[FORMA_PAGO_SALDO]", form.formaPagoSaldo)
    .replaceAll("[MEDIOS_PAGO]", form.mediosPago)
    .replaceAll("[VALOR_CUOTA]", form.valorCuota)
    .replaceAll("[FRECUENCIA_PAGO]", form.frecuenciaPago)
    .replaceAll("[DURACION]", form.duracionTexto)
    .replaceAll("[HORARIO_COBRO]", form.horarioCobro);
}

export function tipoContratoLabel(esRenovacion: boolean): string {
  return esRenovacion
    ? "CONTRATO DE RENTING OPERATIVO DE MOTOCICLETA (RENOVACIÓN)"
    : "CONTRATO DE RENTING OPERATIVO DE MOTOCICLETA";
}

export function renderIntro(form: ContratoData): string {
  return applyContratantePlaceholders(
    introTemplate
      .replaceAll("[DIA]", form.fechaFirmaDia)
      .replaceAll("[MES]", form.fechaFirmaMes)
      .replaceAll("[ANIO]", form.fechaFirmaAnio)
      .replaceAll("[NOMBRE_CONTRATANTE]", form.nombreContratante)
      .replaceAll(
        "[TIPO_DOC_CONTRATANTE]",
        form.tipoDocumentoContratante || "C.C.",
      )
      .replaceAll("[CEDULA_CONTRATANTE]", form.cedulaContratante)
      .replaceAll("[TIPO_CONTRATO]", tipoContratoLabel(form.esRenovacion)),
    form,
  );
}

export function renderClausulaTexto(texto: string, form: ContratoData): string {
  return applyComercialPlaceholders(
    applyContratantePlaceholders(texto, form),
    form,
  );
}

export function renderFirma(form: ContratoData): string {
  return firmaTemplate
    .replaceAll("[DIA]", form.fechaFirmaDia)
    .replaceAll("[MES]", form.fechaFirmaMes)
    .replaceAll("[ANIO]", form.fechaFirmaAnio)
    .replaceAll("[ANIO_NUM]", form.fechaFirmaAnio)
    .replaceAll("[NOMBRE_CONTRATANTE]", form.nombreContratante)
    .replaceAll(
      "[TIPO_DOC_CONTRATANTE]",
      form.tipoDocumentoContratante || "C.C.",
    )
    .replaceAll("[CEDULA_CONTRATANTE]", form.cedulaContratante)
    .replaceAll(
      "[CELULAR_CONTRATANTE]",
      form.celularContratante.trim() || "________________",
    );
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Partes de la fecha actual en Colombia (UTC-5) para prellenar el contrato. */
export function colombiaDateParts(): {
  dia: string;
  mes: string;
  anio: string;
} {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return {
    dia: String(d.getUTCDate()),
    mes: MESES[d.getUTCMonth()],
    anio: String(d.getUTCFullYear()),
  };
}

/** ponytail: runnable self-check — node -e "require('./...')" or import in dev */
export function contratoClausulasSelfCheck(): void {
  const saldo = buildFormaPagoSaldoText("semanal", "$50.000");
  if (!saldo.includes("52 CUOTAS SEMANALES")) {
    throw new Error("buildFormaPagoSaldoText semanal");
  }
  const mant = buildClausulaMantenimientoText();
  if (!mant.includes("500") || !mant.includes("1000")) {
    throw new Error("buildClausulaMantenimientoText");
  }
  const medios = buildMediosPagoText();
  if (!medios.includes("efectivo") || !medios.includes("Bancolombia")) {
    throw new Error("buildMediosPagoText");
  }
  if (!medios.includes(EMPRESA_PROPIETARIA.razonSocialCorto)) {
    throw new Error("buildMediosPagoText empresa");
  }
  const intro = renderIntro({
    nombreContratante: "JUAN PEREZ",
    cedulaContratante: "1.000.000",
    tipoDocumentoContratante: "C.C.",
    direccionNotificaciones: "Calle 1",
    ciudadContratante: "CONFIGURAR",
    departamentoContratante: "Santander",
    fechaFirmaDia: "14",
    fechaFirmaMes: "julio",
    fechaFirmaAnio: "2026",
    celularContratante: "3001234567",
    marca: "BERA",
    modelo: "X",
    linea: "X",
    estado: "Nueva",
    chasis: "1",
    motor: "N/A",
    placa: "ABC123",
    color: "Rojo",
    referencia: "—",
    cuotaInicial: "$1",
    valorCuota: "$1",
    frecuenciaPago: "Diario",
    totalContrato: "$1",
    formaPagoSaldo: "",
    mediosPago: "",
    diasContrato: 365,
    esRenovacion: false,
    duracionTexto: "un 12 meses",
    horarioCobro: "a las 5 p.m. de cada día",
  });
  if (
    !intro.includes(EMPRESA_PROPIETARIA.representante) ||
    !intro.includes("EL ARRENDADOR")
  ) {
    throw new Error("renderIntro representante");
  }
  if (!intro.includes("CONTRATO DE RENTING OPERATIVO")) {
    throw new Error("renderIntro tipo");
  }

  const renovacion = buildContratoComercial({
    modelo: "X",
    color: "Rojo",
    placa: "ABC123",
    chasis: "1",
    referencia: null,
    frecuencia_pago: "diario",
    cuota_inicial_monto: 0,
    monto_cuota_periodo: 38000,
    diasContrato: 324,
    esRenovacion: true,
  });
  if (!renovacion.esRenovacion || renovacion.diasContrato !== 324) {
    throw new Error("buildContratoComercial renovacion");
  }
  if (!renovacion.formaPagoSaldo.includes("324 CUOTAS DIARIAS")) {
    throw new Error("buildContratoComercial 324 cuotas");
  }
  if (renovacion.duracionTexto !== "324 días") {
    throw new Error("buildContratoComercial duracion");
  }
  if (marcaMotoFromModelo("NKD125") !== "AKT") {
    throw new Error("marcaMotoFromModelo NKD→AKT");
  }
  if (marcaMotoFromModelo("BERA150") !== "BERA") {
    throw new Error("marcaMotoFromModelo BERA");
  }
  if (buildContratoComercial({
    modelo: "NKD125",
    color: "Negro",
    placa: "ABC123",
    chasis: "1",
    referencia: null,
    frecuencia_pago: "diario",
    cuota_inicial_monto: 0,
    monto_cuota_periodo: 38000,
  }).marca !== "AKT") {
    throw new Error("buildContratoComercial marca AKT");
  }
  if (
    !tipoContratoLabel(true).includes("RENOVACIÓN") ||
    tipoContratoLabel(false) !== "CONTRATO DE RENTING OPERATIVO DE MOTOCICLETA"
  ) {
    throw new Error("tipoContratoLabel");
  }

  const rebuilt = buildContratoDataFromStored({
    nombre_contratante: "Ana Lopez",
    cedula_contratante: "123",
    tipo_documento_contratante: "ppt",
    direccion_notificaciones: "Calle 1, barrio Centro",
    ciudad_contratante: "CONFIGURAR",
    departamento_contratante: "Santander",
    fecha_firma_dia: "4",
    fecha_firma_mes: "agosto",
    fecha_firma_anio: "2026",
    celular_contratante: "3001112233",
    moto_modelo: "X1",
    moto_color: "Rojo",
    moto_placa: "ABC123",
    moto_chasis: "CH1",
    moto_estado: "Usada",
    frecuencia_pago: "semanal",
    cuota_inicial: 100000,
    valor_cuota: 50000,
  });
  if (rebuilt.nombreContratante !== "Ana Lopez" || rebuilt.placa !== "ABC123") {
    throw new Error("buildContratoDataFromStored");
  }
  if (rebuilt.tipoDocumentoContratante !== "PPT") {
    throw new Error("buildContratoDataFromStored tipo PPT");
  }
  if (rebuilt.estado !== "Usada") {
    throw new Error("buildContratoDataFromStored estado usada");
  }
  if (rebuilt.celularContratante !== "3001112233") {
    throw new Error("buildContratoDataFromStored celular");
  }
  if (!rebuilt.formaPagoSaldo.includes("52 CUOTAS SEMANALES")) {
    throw new Error("buildContratoDataFromStored frecuencia");
  }

  const lunSab = buildContratoComercial({
    modelo: "X",
    color: "Rojo",
    placa: "ABC123",
    chasis: "1",
    referencia: null,
    frecuencia_pago: "semanal",
    cuota_inicial_monto: 0,
    monto_cuota_periodo: 60_000,
    periodosContrato: 8,
    calendarioCobro: "lun_sab",
  });
  if (!lunSab.formaPagoSaldo.includes("8 CUOTAS SEMANALES")) {
    throw new Error("buildContratoComercial lun_sab cuotas");
  }
  if (!lunSab.formaPagoSaldo.includes("lunes a sábado")) {
    throw new Error("buildContratoComercial lun_sab texto");
  }
  if (lunSab.horarioCobro.indexOf("lunes a sábado") < 0) {
    throw new Error("buildContratoComercial horario lun_sab");
  }
  if (lunSab.duracionTexto !== "8 cuotas semanales") {
    throw new Error("buildContratoComercial duracion lun_sab");
  }
  const firmaPpt = renderFirma({ ...rebuilt, tipoDocumentoContratante: "PPT" });
  if (!firmaPpt.includes("Cartagena") || !firmaPpt.includes("agosto")) {
    throw new Error("renderFirma fecha");
  }
  const notif = blocks
    .flatMap((b) => b.clausulas)
    .find((c) => /VIG[ÉE]SIMA NOVENA/.test(c.titulo));
  if (!notif) throw new Error("cláusula vigésima novena");
  const notifTxt = renderClausulaTexto(notif.texto, {
    ...rebuilt,
    celularContratante: "3001112233",
  });
  if (
    !notifTxt.includes("Calle 1, barrio Centro") ||
    !notifTxt.includes("teléfono: 3001112233")
  ) {
    throw new Error("cláusula notificaciones dirección + celular");
  }
}
