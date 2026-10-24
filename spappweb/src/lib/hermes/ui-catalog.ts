export type ChatFieldType =
  | "text"
  | "number"
  | "select"
  | "date"
  | "checkbox"
  | "textarea"
  | "file";

export type ChatField = {
  name: string;
  label: string;
  type: ChatFieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Bucket permitido por uploadAdminImage. */
  bucket?: string;
  /** El archivo viaja al servidor y lo guarda la acción, sin subirlo antes. */
  rawFile?: boolean;
};

export type ChatCardSpec = {
  id: string;
  title: string;
  verb: "Crear" | "Guardar" | "Eliminar" | "Confirmar";
  destructive?: boolean;
  /** Solo lectura: el modelo manda values y no hay envío. */
  summary?: boolean;
  /** La baja pide un motivo además de la clave. */
  needsMotivo?: boolean;
  fields: ChatField[];
};

const medioPago = [
  { value: "efectivo", label: "Efectivo" },
  { value: "datafono", label: "Datáfono" },
  { value: "nequi_nicolas", label: "Nequi" },
  { value: "davivienda", label: "Davivienda" },
];

const banco = [
  { value: "nequi", label: "Nequi" },
  { value: "davivienda", label: "Davivienda" },
  { value: "bancolombia", label: "Bancolombia" },
  { value: "banco_bogota", label: "Banco de Bogotá" },
  { value: "pse", label: "PSE" },
  { value: "otro", label: "Otro" },
];

const ubicacion = [
  { value: "Soluciones", label: "Soluciones" },
  { value: "Bera", label: "Bera" },
  { value: "Bodega", label: "Bodega" },
];

const siNo = [
  { value: "true", label: "Sí" },
  { value: "false", label: "No" },
];

function t(
  name: string,
  label: string,
  extra?: Partial<ChatField>,
): ChatField {
  return { name, label, type: "text", ...extra };
}

function n(name: string, label: string, required = true): ChatField {
  return { name, label, type: "number", required };
}

function sel(
  name: string,
  label: string,
  options: { value: string; label: string }[],
  required = true,
): ChatField {
  return { name, label, type: "select", options, required };
}

export const CHAT_CARDS: ChatCardSpec[] = [
  {
    id: "resumen",
    title: "Resumen",
    verb: "Confirmar",
    summary: true,
    fields: [],
  },
  {
    id: "client_pipeline",
    title: "Ficha del cliente",
    verb: "Confirmar",
    summary: true,
    fields: [],
  },
  {
    id: "caja_hoy",
    title: "Caja de hoy",
    verb: "Confirmar",
    summary: true,
    fields: [],
  },
  {
    id: "create_client",
    title: "Crear cliente",
    verb: "Crear",
    fields: [t("cedula", "Cédula", { required: true })],
  },
  {
    id: "approve_credit",
    title: "Aprobar crédito",
    verb: "Confirmar",
    fields: [n("documentId", "Id del documento"), n("userId", "Id del cliente")],
  },
  {
    id: "reject_credit",
    title: "Rechazar crédito",
    verb: "Confirmar",
    destructive: true,
    needsMotivo: true,
    fields: [
      n("documentId", "Id del documento"),
      n("userId", "Id del cliente"),
      sel("betado", "Vetar reenvío", siNo),
    ],
  },
  {
    id: "register_payment",
    title: "Registrar pago",
    verb: "Guardar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      sel("contexto", "Concepto", [
        { value: "inicial", label: "Cuota inicial" },
        { value: "cuota_adelantada", label: "Cuota adelantada" },
        { value: "visita", label: "Visita" },
        { value: "producto_inicial", label: "Inicial de producto" },
        { value: "producto_cuota", label: "Cuota de producto" },
      ]),
      n("monto", "Monto"),
      sel("medioPagoAdmin", "Medio de pago", medioPago),
      sel("bancoOrigen", "Banco de origen", banco),
      t("referencia", "Referencia"),
      t("tarifaId", "Id de la tarifa"),
      t("compraProductoCreditoId", "Id del producto a crédito"),
      t("comprobante", "Comprobante", {
        type: "file",
        rawFile: true,
      }),
      t("notas", "Notas"),
    ],
  },
  {
    id: "confirm_payment_flag",
    title: "Confirmar flag de pago",
    verb: "Guardar",
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
      sel("field", "Campo", [
        { value: "inicial", label: "Inicial" },
        { value: "cuota", label: "Cuota" },
      ]),
      sel("value", "Confirmado", siNo),
    ],
  },
  {
    id: "confirm_tarifa_pago",
    title: "Confirmar tarifa",
    verb: "Confirmar",
    fields: [
      t("tarifaId", "Id de la tarifa", { required: true }),
      n("userId", "Id del cliente"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "remove_pago_abono",
    title: "Quitar abono",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      t("pagoId", "Id del pago", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "update_pago_abono",
    title: "Corregir abono",
    verb: "Guardar",
    fields: [
      t("pagoId", "Id del pago", { required: true }),
      n("userId", "Id del cliente"),
      n("monto", "Monto"),
      t("referencia", "Referencia", { required: true }),
      sel("medioPagoAdmin", "Medio de pago", medioPago),
      sel("contexto", "Concepto", [
        { value: "inicial", label: "Inicial" },
        { value: "cuota_adelantada", label: "Cuota adelantada" },
        { value: "visita", label: "Visita" },
      ]),
    ],
  },
  {
    id: "assign_visit",
    title: "Asignar visita",
    verb: "Guardar",
    fields: [
      t("visitaId", "Id de la visita", { required: true }),
      n("userId", "Id del cliente"),
      n("visitadorId", "Id del visitador"),
      t("fechaProgramada", "Fecha y hora", { type: "date", required: true }),
    ],
  },
  {
    id: "complete_visit",
    title: "Completar visita",
    verb: "Confirmar",
    fields: [
      t("visitaId", "Id de la visita", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "cancel_visit",
    title: "Cancelar visita",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      t("visitaId", "Id de la visita", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "save_visitador",
    title: "Visitador",
    verb: "Guardar",
    fields: [
      n("id", "Id (vacío si es nuevo)", false),
      t("nombre", "Nombre", { required: true }),
      t("telefono", "Teléfono"),
      sel("activo", "Activo", siNo),
      t("username", "Usuario (solo al crear)"),
      t("password", "Contraseña (solo al crear)"),
    ],
  },
  {
    id: "delete_visitador",
    title: "Eliminar visitador",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [n("id", "Id del visitador")],
  },
  {
    id: "update_delivery",
    title: "Datos de entrega",
    verb: "Guardar",
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
      t("placa", "Placa", { required: true }),
      t("chasis", "Chasis", { required: true }),
      t("serialMotor", "Serial del motor"),
      t("referencia", "Referencia"),
      t("fechaEntrega", "Fecha de entrega", { type: "date", required: true }),
    ],
  },
  {
    id: "mark_delivered",
    title: "Marcar entregada",
    verb: "Confirmar",
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "cancel_compra",
    title: "Cancelar compra",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "update_vendida_estado_fisico",
    title: "Estado físico",
    verb: "Guardar",
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
      sel("estadoFisico", "Estado", [
        { value: "activa", label: "Activa" },
        { value: "recogida", label: "Recogida" },
        { value: "robada", label: "Robada" },
        { value: "en_transito", label: "En tránsito" },
        { value: "en_patio", label: "En patio" },
      ]),
    ],
  },
  {
    id: "delete_vendida_moto",
    title: "Eliminar venta entregada",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "set_tracking",
    title: "Seguimiento GPS",
    verb: "Guardar",
    fields: [
      n("userId", "Id del cliente"),
      sel("seguimiento", "Seguimiento activo", siNo),
    ],
  },
  {
    id: "resolve_moroso",
    title: "Regularizar mora",
    verb: "Confirmar",
    fields: [
      t("morosoId", "Id del moroso", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "mark_moto_recogida",
    title: "Marcar moto recogida",
    verb: "Confirmar",
    fields: [
      t("recogerId", "Id de la recogida", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "save_bike",
    title: "Moto de catálogo",
    verb: "Guardar",
    fields: [
      n("id", "Id (vacío si es nueva)", false),
      t("modelo", "Modelo", { required: true }),
      t("color", "Color", { required: true }),
      n("stock", "Stock"),
      n("cuotaInicial", "Cuota inicial"),
      n("cuotaDiaria", "Cuota diaria"),
      n("montoVisita", "Monto de visita", false),
      n("precioVenta", "Precio de venta", false),
      t("descripcion", "Descripción", { type: "textarea" }),
      sel("activo", "Activa", siNo),
      t("imagenUrl", "Foto", { type: "file", bucket: "bike-images" }),
    ],
  },
  {
    id: "delete_bike",
    title: "Eliminar moto de catálogo",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [n("id", "Id de la moto")],
  },
  {
    id: "save_categoria",
    title: "Categoría de inventario",
    verb: "Guardar",
    fields: [
      n("id", "Id (vacío si es nueva)", false),
      t("nombre", "Nombre", { required: true }),
      t("slug", "Slug", { required: true }),
      t("descripcion", "Descripción"),
      sel("activo", "Activa", siNo),
      n("orden", "Orden", false),
    ],
  },
  {
    id: "delete_categoria",
    title: "Eliminar categoría",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [n("id", "Id de la categoría")],
  },
  {
    id: "save_producto",
    title: "Producto de inventario",
    verb: "Guardar",
    fields: [
      n("id", "Id (vacío si es nuevo)", false),
      n("categoriaId", "Id de categoría"),
      t("sku", "SKU", { required: true }),
      t("nombre", "Nombre", { required: true }),
      n("precio", "Precio"),
      n("costo", "Costo"),
      n("stockSoluciones", "Stock Soluciones"),
      n("stockBera", "Stock Bera"),
      n("stockBodega", "Stock bodega"),
      n("stockMinimo", "Stock mínimo"),
      t("gaveta", "Gaveta"),
      t("descripcion", "Descripción", { type: "textarea" }),
      sel("activo", "Activo", siNo),
      t("imagenUrl", "Foto", { type: "file", bucket: "inventario-imagenes" }),
    ],
  },
  {
    id: "delete_producto",
    title: "Eliminar producto",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [n("id", "Id del producto")],
  },
  {
    id: "save_garaje_parqueadero",
    title: "Parqueadero",
    verb: "Guardar",
    fields: [
      n("id", "Id (vacío si es nuevo)", false),
      t("nombre", "Nombre", { required: true }),
      t("slug", "Slug", { required: true }),
      sel("activo", "Activo", siNo),
      n("orden", "Orden"),
    ],
  },
  {
    id: "delete_garaje_parqueadero",
    title: "Eliminar parqueadero",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [n("id", "Id del parqueadero")],
  },
  {
    id: "save_garaje_moto",
    title: "Moto del garaje",
    verb: "Guardar",
    fields: [
      t("id", "Id (vacío si es nueva)"),
      n("parqueaderoId", "Id del parqueadero", false),
      t("placa", "Placa"),
      t("referencia", "Referencia", { required: true }),
      t("modelo", "Modelo", { required: true }),
      t("color", "Color", { required: true }),
      sel("origen", "Origen", [
        { value: "manual", label: "Manual" },
        { value: "recuperacion", label: "Recuperación" },
      ]),
      sel("condicion", "Condición", [
        { value: "nueva", label: "Nueva" },
        { value: "segunda_mano", label: "Segunda mano" },
        { value: "recuperada", label: "Recuperada" },
      ]),
      sel("estado", "Estado", [
        { value: "en_garaje", label: "En garaje" },
        { value: "retenida", label: "Retenida" },
        { value: "en_mantenimiento", label: "En mantenimiento" },
        { value: "disponible", label: "Disponible" },
        { value: "vendida", label: "Vendida" },
        { value: "devuelta", label: "Devuelta" },
        { value: "baja", label: "Baja" },
      ]),
      t("notas", "Notas", { type: "textarea" }),
      t("placaFotoUrl", "Foto de placa", {
        type: "file",
        bucket: "garaje-imagenes",
      }),
    ],
  },
  {
    id: "delete_garaje_moto",
    title: "Eliminar moto del garaje",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [t("id", "Id de la moto", { required: true })],
  },
  {
    id: "abrir_caja",
    title: "Abrir caja",
    verb: "Confirmar",
    fields: [
      n("montoApertura", "Efectivo inicial"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "cerrar_caja",
    title: "Cerrar caja",
    verb: "Confirmar",
    fields: [
      t("sesionId", "Id de la sesión", { required: true }),
      n("montoCierre", "Efectivo contado"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "movimiento_caja",
    title: "Movimiento de caja",
    verb: "Guardar",
    fields: [
      t("sesionId", "Id de la sesión", { required: true }),
      sel("tipo", "Tipo", [
        { value: "entrada", label: "Entrada" },
        { value: "salida", label: "Salida" },
      ]),
      n("monto", "Monto"),
      t("concepto", "Concepto", { required: true }),
    ],
  },
  {
    id: "egreso_caja",
    title: "Egreso de caja",
    verb: "Guardar",
    fields: [
      t("sesionId", "Id de la sesión", { required: true }),
      t("concepto", "Concepto", { required: true }),
      t("beneficiario", "Beneficiario"),
      n("monto", "Monto"),
      sel("medioPago", "Medio", [
        { value: "efectivo", label: "Efectivo" },
        { value: "nequi", label: "Nequi" },
        { value: "davivienda", label: "Davivienda" },
      ]),
      t("notas", "Notas"),
    ],
  },
  {
    id: "cobro_visita_caja",
    title: "Cobrar visita en caja",
    verb: "Guardar",
    fields: [
      t("sesionId", "Id de la sesión", { required: true }),
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
      sel("medioPagoAdmin", "Medio", medioPago, false),
    ],
  },
  {
    id: "save_venta_moto",
    title: "Venta de moto al contado",
    verb: "Crear",
    fields: [
      n("bikeId", "Id de la moto en catálogo"),
      t("modelo", "Modelo", { required: true }),
      t("color", "Color", { required: true }),
      t("clienteNombre", "Nombre del cliente", { required: true }),
      sel("clienteTipoDocumento", "Tipo de documento", [
        { value: "cc", label: "Cédula" },
        { value: "ppt", label: "PPT" },
        { value: "p", label: "Pasaporte" },
        { value: "nit", label: "NIT" },
      ]),
      t("clienteCedula", "Documento", { required: true }),
      t("clienteCelular", "Celular", { required: true }),
      t("clienteDireccion", "Dirección", { required: true }),
      t("clienteCorreo", "Correo"),
      t("clienteFotoUrl", "URL de la foto del cliente", { required: true }),
      t("chasis", "Chasis", { required: true }),
      n("valorVenta", "Valor de venta", false),
      n("montoPagado", "Monto pagado", false),
      t("notas", "Notas"),
    ],
  },
  {
    id: "abono_venta_moto",
    title: "Abono a venta de moto",
    verb: "Guardar",
    fields: [
      t("id", "Id de la venta", { required: true }),
      n("monto", "Monto"),
    ],
  },
  {
    id: "update_venta_moto",
    title: "Corregir venta de moto",
    verb: "Guardar",
    fields: [
      t("id", "Id de la venta", { required: true }),
      t("clienteNombre", "Nombre", { required: true }),
      sel("clienteTipoDocumento", "Tipo de documento", [
        { value: "cc", label: "Cédula" },
        { value: "ppt", label: "PPT" },
        { value: "p", label: "Pasaporte" },
        { value: "nit", label: "NIT" },
      ]),
      t("clienteCedula", "Documento", { required: true }),
      t("clienteCelular", "Celular", { required: true }),
      t("clienteDireccion", "Dirección", { required: true }),
      t("clienteCorreo", "Correo"),
      t("chasis", "Chasis", { required: true }),
      t("placa", "Placa"),
      n("valorVenta", "Valor de venta", false),
      n("montoPagado", "Monto pagado"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "placa_venta_moto",
    title: "Placa de venta al contado",
    verb: "Guardar",
    fields: [
      t("id", "Id de la venta", { required: true }),
      t("placa", "Placa", { required: true }),
    ],
  },
  {
    id: "entregar_venta_moto",
    title: "Entregar moto de contado",
    verb: "Confirmar",
    fields: [t("id", "Id de la venta", { required: true })],
  },
  {
    id: "save_venta_producto",
    title: "Venta de tienda",
    verb: "Crear",
    fields: [
      t("clienteNombre", "Nombre", { required: true }),
      t("clienteCedula", "Documento"),
      t("clienteCelular", "Celular", { required: true }),
      n("productoId", "Id del producto"),
      n("cantidad", "Cantidad"),
      sel("ubicacion", "Ubicación", ubicacion, false),
      n("montoPagado", "Monto pagado", false),
      t("notas", "Notas"),
    ],
  },
  {
    id: "abono_venta_producto",
    title: "Abono a venta de tienda",
    verb: "Guardar",
    fields: [
      t("id", "Id de la venta", { required: true }),
      n("monto", "Monto"),
    ],
  },
  {
    id: "publicar_carrito",
    title: "Borrador de carrito",
    verb: "Crear",
    fields: [
      n("productoId", "Id del producto"),
      n("cantidad", "Cantidad"),
    ],
  },
  {
    id: "congelar_cuotas",
    title: "Congelar cuotas",
    verb: "Confirmar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      n("dias", "Días"),
      t("observaciones", "Observaciones", { type: "textarea" }),
    ],
  },
  {
    id: "refinanciar_credito",
    title: "Refinanciar crédito",
    verb: "Confirmar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      t("fechaRefinanciacion", "Fecha", { type: "date", required: true }),
      n("dias", "Días del nuevo plazo"),
      n("cuotaDiaria", "Cuota diaria"),
    ],
  },
  {
    id: "saldar_credito",
    title: "Saldar crédito",
    verb: "Confirmar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      n("monto", "Monto"),
      sel("medioPagoAdmin", "Medio (efectivo o datáfono en el chat)", [
        { value: "efectivo", label: "Efectivo" },
        { value: "datafono", label: "Datáfono" },
      ]),
      t("referencia", "Referencia"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "registrar_multa",
    title: "Registrar multa",
    verb: "Crear",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      n("monto", "Monto"),
      t("motivoMulta", "Motivo de la multa", { required: true }),
    ],
  },
  {
    id: "anular_multa",
    title: "Anular multa",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      n("userId", "Id del cliente"),
      t("tarifaId", "Id de la tarifa", { required: true }),
    ],
  },
  {
    id: "montos_primer_pago",
    title: "Montos del primer pago",
    verb: "Guardar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      n("cuotaInicial", "Cuota inicial"),
      n("montoCuotaPeriodo", "Cuota del periodo"),
    ],
  },
  {
    id: "monto_visita",
    title: "Monto de visita",
    verb: "Guardar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      n("montoVisita", "Monto"),
    ],
  },
  {
    id: "cobra_cuota_adelantada",
    title: "Cobrar cuota adelantada",
    verb: "Guardar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      sel("cobra", "Cobrar adelantada", siNo),
    ],
  },
  {
    id: "frecuencia_pago",
    title: "Frecuencia de pago",
    verb: "Guardar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      sel("frecuencia", "Frecuencia", [
        { value: "diario", label: "Diario" },
        { value: "semanal", label: "Semanal" },
        { value: "quincenal", label: "Quincenal" },
        { value: "mensual", label: "Mensual" },
      ]),
    ],
  },
  {
    id: "acuerdo_primer_pago",
    title: "Acuerdo del primer pago",
    verb: "Guardar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      n("cuotaInicial", "Cuota inicial"),
      n("montoCuotaAdelantada", "Cuota adelantada"),
      n("montoVisita", "Visita"),
    ],
  },
  {
    id: "cerrar_primer_pago",
    title: "Cerrar primer pago",
    verb: "Confirmar",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
    ],
  },
  {
    id: "save_producto_credito",
    title: "Extra a cuotas",
    verb: "Guardar",
    fields: [
      n("id", "Id (vacío si es nuevo)", false),
      t("nombre", "Nombre", { required: true }),
      t("descripcion", "Descripción"),
      n("cuotaInicial", "Cuota inicial"),
      n("cuotaDiaria", "Cuota diaria"),
      n("plazoDias", "Plazo en días"),
      n("orden", "Orden"),
      sel("activo", "Activo", siNo),
    ],
  },
  {
    id: "delete_producto_credito",
    title: "Eliminar extra a cuotas",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [n("id", "Id del extra")],
  },
  {
    id: "add_compra_producto_credito",
    title: "Agregar extra a una compra",
    verb: "Crear",
    fields: [
      n("userId", "Id del cliente"),
      t("compraId", "Id de la compra", { required: true }),
      n("productoCreditoId", "Id del extra", false),
      n("inventarioProductoId", "Id de inventario", false),
      sel("ubicacion", "Ubicación", ubicacion, false),
      t("nombre", "Nombre si no hay catálogo"),
      n("cuotaInicial", "Cuota inicial", false),
      n("cuotaDiaria", "Cuota diaria", false),
      n("plazoDias", "Plazo en días", false),
      n("cantidad", "Cantidad", false),
      t("notas", "Notas"),
    ],
  },
  {
    id: "remove_compra_producto_credito",
    title: "Quitar extra de la compra",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      t("itemId", "Id del ítem", { required: true }),
      n("userId", "Id del cliente"),
    ],
  },
  {
    id: "plazo_producto_credito",
    title: "Plazo del extra",
    verb: "Guardar",
    fields: [
      t("itemId", "Id del ítem", { required: true }),
      n("userId", "Id del cliente"),
      n("plazoDias", "Plazo en días"),
    ],
  },
  {
    id: "save_mecanico",
    title: "Mecánico",
    verb: "Guardar",
    fields: [
      n("id", "Id (vacío si es nuevo)", false),
      t("nombre", "Nombre", { required: true }),
      t("telefono", "Teléfono"),
      sel("activo", "Activo", siNo),
      t("fotoUrl", "Foto", { type: "file", bucket: "taller-fotos" }),
    ],
  },
  {
    id: "delete_mecanico",
    title: "Desactivar mecánico",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [n("id", "Id del mecánico")],
  },
  {
    id: "create_orden_taller",
    title: "Orden de taller",
    verb: "Crear",
    fields: [
      t("modelo", "Modelo", { required: true }),
      t("placa", "Placa"),
      t("color", "Color"),
      n("userId", "Id del cliente", false),
      t("userMotoCompraId", "Id de la compra"),
      t("contactoNombre", "Contacto"),
      t("contactoTelefono", "Teléfono"),
      t("descripcionFalla", "Falla", { type: "textarea" }),
      n("kilometraje", "Kilometraje", false),
      n("mecanicoId", "Id del mecánico", false),
    ],
  },
  {
    id: "update_orden_fotos",
    title: "Fotos de la orden",
    verb: "Guardar",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      t("foto1", "Foto 1", {
        type: "file",
        bucket: "taller-fotos",
        required: true,
      }),
      t("foto2", "Foto 2", { type: "file", bucket: "taller-fotos" }),
      t("foto3", "Foto 3", { type: "file", bucket: "taller-fotos" }),
    ],
  },
  {
    id: "assign_orden_mecanico",
    title: "Asignar mecánico a la orden",
    verb: "Guardar",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      n("mecanicoId", "Id del mecánico"),
    ],
  },
  {
    id: "update_orden_estado",
    title: "Estado de la orden",
    verb: "Guardar",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      sel("estado", "Estado", [
        { value: "en_reparacion", label: "En reparación" },
        { value: "lista", label: "Lista" },
        { value: "entregada", label: "Entregada" },
        { value: "cancelada", label: "Cancelada" },
      ]),
    ],
  },
  {
    id: "add_tarea",
    title: "Tarea de taller",
    verb: "Crear",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      t("zona", "Zona o parte", { required: true }),
      t("nota", "Qué se va a hacer", { required: true }),
      sel(
        "gravedad",
        "Gravedad",
        [
          { value: "bien", label: "Bien" },
          { value: "pronto", label: "Pronto" },
          { value: "urgente", label: "Urgente" },
        ],
        false,
      ),
    ],
  },
  {
    id: "toggle_tarea",
    title: "Marcar tarea",
    verb: "Guardar",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      t("tareaId", "Id de la tarea", { required: true }),
      sel("hecho", "Hecha", siNo),
    ],
  },
  {
    id: "remove_tarea",
    title: "Quitar tarea",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      t("tareaId", "Id de la tarea", { required: true }),
    ],
  },
  {
    id: "add_orden_repuesto",
    title: "Repuesto de la orden",
    verb: "Crear",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      n("productoId", "Id del producto", false),
      t("descripcion", "Descripción si no hay producto"),
      n("cantidad", "Cantidad", false),
      t("zona", "Zona"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "aprobar_repuesto",
    title: "Aprobar repuesto",
    verb: "Confirmar",
    fields: [t("repuestoId", "Id del repuesto", { required: true })],
  },
  {
    id: "rechazar_repuesto",
    title: "Rechazar repuesto",
    verb: "Confirmar",
    destructive: true,
    needsMotivo: true,
    fields: [t("repuestoId", "Id del repuesto", { required: true })],
  },
  {
    id: "quitar_repuesto",
    title: "Quitar repuesto",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [
      t("repuestoId", "Id del repuesto", { required: true }),
      t("ordenId", "Id de la orden", { required: true }),
    ],
  },
  {
    id: "start_timer",
    title: "Iniciar cronómetro",
    verb: "Confirmar",
    fields: [t("ordenId", "Id de la orden", { required: true })],
  },
  {
    id: "pause_timer",
    title: "Pausar cronómetro",
    verb: "Confirmar",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      t("motivoTimer", "Motivo"),
    ],
  },
  {
    id: "stop_timer",
    title: "Detener cronómetro",
    verb: "Confirmar",
    fields: [
      t("ordenId", "Id de la orden", { required: true }),
      t("motivoTimer", "Motivo"),
    ],
  },
  {
    id: "update_solicitud_estado",
    title: "Estado de solicitud de taller",
    verb: "Guardar",
    fields: [
      t("solicitudId", "Id de la solicitud", { required: true }),
      sel("estado", "Estado", [
        { value: "pendiente", label: "Pendiente" },
        { value: "en_proceso", label: "En proceso" },
        { value: "completada", label: "Completada" },
        { value: "cancelada", label: "Cancelada" },
      ]),
      t("notasAdmin", "Notas", { type: "textarea" }),
    ],
  },
  {
    id: "liberar_garaje",
    title: "Liberar moto retenida",
    verb: "Confirmar",
    fields: [t("garajeMotoId", "Id de la moto en garaje", { required: true })],
  },
  {
    id: "devolver_garaje",
    title: "Devolver moto al cliente",
    verb: "Confirmar",
    fields: [t("garajeMotoId", "Id de la moto en garaje", { required: true })],
  },
  {
    id: "add_mantenimiento_garaje",
    title: "Repuesto de mantenimiento",
    verb: "Crear",
    fields: [
      t("garajeMotoId", "Id de la moto", { required: true }),
      n("productoId", "Id del producto"),
      n("cantidad", "Cantidad"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "remove_mantenimiento_item",
    title: "Quitar ítem de mantenimiento",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [t("itemId", "Id del ítem", { required: true })],
  },
  {
    id: "terminar_mantenimiento",
    title: "Terminar mantenimiento",
    verb: "Confirmar",
    fields: [
      t("garajeMotoId", "Id de la moto", { required: true }),
      n("cuotaInicial", "Cuota inicial"),
      n("cuotaDiaria", "Cuota diaria"),
      n("montoVisita", "Monto de visita", false),
    ],
  },
  {
    id: "create_tarjeta",
    title: "Tarjeta de propiedad",
    verb: "Crear",
    fields: [
      t("placa", "Placa", { required: true }),
      t("imagen_url", "Foto del frente", {
        type: "file",
        bucket: "garaje-imagenes",
        required: true,
      }),
      t("imagen_reverso_url", "Foto del reverso", {
        type: "file",
        bucket: "garaje-imagenes",
        required: true,
      }),
    ],
  },
  {
    id: "delete_tarjeta",
    title: "Eliminar tarjeta",
    verb: "Eliminar",
    destructive: true,
    needsMotivo: true,
    fields: [t("id", "Id de la tarjeta", { required: true })],
  },
  {
    id: "transferir_titularidad",
    title: "Transferir titularidad",
    verb: "Confirmar",
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("fromUserId", "Cliente actual"),
      n("toUserId", "Cliente nuevo"),
      t("motivoTraspaso", "Motivo"),
    ],
  },
  {
    id: "save_conductor",
    title: "Conductor",
    verb: "Guardar",
    fields: [
      t("compraId", "Id de la compra", { required: true }),
      n("userId", "Id del cliente"),
      t("nombre", "Nombre", { required: true }),
      t("cedula", "Cédula", { required: true }),
      t("celular", "Celular"),
      t("notas", "Notas"),
    ],
  },
  {
    id: "trasladar_inventario",
    title: "Trasladar inventario",
    verb: "Confirmar",
    fields: [
      n("productoId", "Id del producto"),
      sel("desde", "Desde", ubicacion),
      sel("hacia", "Hacia", ubicacion),
      n("cantidad", "Cantidad"),
      t("nota", "Nota"),
      t("gavetaDestino", "Gaveta destino"),
    ],
  },
  {
    id: "add_producto_novedad",
    title: "Nota de producto",
    verb: "Crear",
    fields: [
      n("productoId", "Id del producto"),
      t("contenido", "Nota", { type: "textarea", required: true }),
    ],
  },
  {
    id: "update_hoja_vida",
    title: "Hoja de vida",
    verb: "Guardar",
    fields: [
      t("contractId", "Id del contrato", { required: true }),
      n("userId", "Id del cliente"),
      t("nombre_completo", "Nombre completo", { required: true }),
      sel("tipo_identificacion", "Tipo de identificación", [
        { value: "cc", label: "Cédula" },
        { value: "ppt", label: "PPT" },
        { value: "p", label: "Pasaporte" },
        { value: "cv", label: "CV" },
      ]),
      t("numero_identificacion", "Número", { required: true }),
      t("fecha_nacimiento", "Fecha de nacimiento", { type: "date" }),
      t("celular", "Celular", { required: true }),
      t("direccion", "Dirección", { required: true }),
      t("barrio", "Barrio"),
      t("correo", "Correo"),
      t("trabaja_empresa", "Trabaja en empresa", { type: "checkbox" }),
      t("nombre_empresa", "Empresa"),
      t("telefono_empresa", "Teléfono de la empresa"),
      t("direccion_empresa", "Dirección de la empresa"),
      t("independiente", "Independiente", { type: "checkbox" }),
      t("habilidad", "Habilidad"),
      sel(
        "estado_civil",
        "Estado civil",
        [
          { value: "soltero", label: "Soltero" },
          { value: "casado", label: "Casado" },
          { value: "union_libre", label: "Unión libre" },
        ],
        false,
      ),
      t("nombre_conyuge", "Nombre del cónyuge"),
      t("celular_conyuge", "Celular del cónyuge"),
      t("ref1_nombre", "Referencia 1"),
      t("ref1_celular", "Celular referencia 1"),
      t("ref2_nombre", "Referencia 2"),
      t("ref2_celular", "Celular referencia 2"),
    ],
  },
];

const BY_ID = new Map(CHAT_CARDS.map((card) => [card.id, card]));

export function getChatCard(id: string): ChatCardSpec | undefined {
  return BY_ID.get(id);
}

/** Lecturas del registro que el agente puede ejecutar solo. */
export const AGENT_READ_TOOLS = [
  "inbox_queues",
  "inbox_list",
  "search_clients",
  "get_client_pipeline",
  "list_pipeline_events",
  "ack_pipeline_events",
  "list_bikes",
  "list_categorias",
  "list_productos",
  "list_solicitudes_taller",
  "list_visitadores",
  "list_active_visitadores",
  "list_garaje_parqueaderos",
  "list_garaje_motos",
  "list_vendidas",
  "list_ventas_contado",
  "list_ventas_producto",
  "list_motos_credito_liquidado",
  "get_caja_hoy",
  "check_referencia_usada",
] as const;

const READ = new Set<string>(AGENT_READ_TOOLS);

export function isAgentWriteTool(name: string): boolean {
  return !READ.has(name);
}

export const AGENT_DELETE_TOOLS = new Set([
  "delete_visitador",
  "delete_bike",
  "delete_categoria",
  "delete_producto",
  "delete_garaje_parqueadero",
  "delete_garaje_moto",
  "delete_vendida_moto",
  "remove_pago_abono",
  "cancel_compra",
  "cancel_visit",
]);

export function buildHermesSystemPrompt(): string {
  return [
    "Eres el asistente del concesionario All4CFL. Responde en español.",
    "Usa el hilo, «Datos del sitio» y el estado de las pantallas abiertas. «Eso», «el mismo» y «el segundo» son el turno anterior.",
    "No ejecutes SQL. No inventes ids, precios, cédulas ni stock.",
    "Haz el cambio tú mismo. No pidas clave personal, código de Olga, Yenifer o Yennifer, ni confirmación extra.",
    "Si el mensaje incluye «Archivo adjunto» y el panel no dice que ya lo cargó, dilo. No inventes un insert.",
    "Inventario, repuestos y tienda son productos: nombre, código, categoría y stock por sede. No son motos.",
    "Garaje y patio son motos físicas en garaje_motos. El catálogo de motos a crédito es bike_table.",
    "Para actuar, termina el mensaje con un único JSON y nada después. Lee la pantalla abierta antes de inventar un id.",
    '{"ui":"act","op":"open_artifact","args":{"id":"inventario"}}',
  ].join("\n");
}
