import "server-only";

import { getChatCard } from "@/lib/hermes/ui-catalog";
import {
  AGENTE_EDITOR_CODIGO,
  INVENTARIO_EDITOR_CODIGOS,
} from "@/lib/inventario/editor-codigos";
import { emptyHojaVidaForm } from "@/lib/contracts/hoja-vida-schema";

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number(str(value));
}

function optNum(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = str(value).toLowerCase();
  return text === "true" || text === "1" || text === "si" || text === "sí";
}

function finish(result: unknown): unknown {
  if (
    result &&
    typeof result === "object" &&
    "ok" in result &&
    (result as { ok: boolean }).ok === false
  ) {
    const error = (result as { error?: string }).error;
    throw new Error(error || "No se pudo completar.");
  }
  return result ?? { ok: true };
}

export async function executeChatAction(input: {
  id: string;
  values: Record<string, unknown>;
  clave?: string;
  motivo?: string;
  files?: Record<string, File>;
}): Promise<unknown> {
  const card = getChatCard(input.id);
  if (!card || card.summary) {
    throw new Error("Esa tarjeta no se puede ejecutar.");
  }
  const autor = INVENTARIO_EDITOR_CODIGOS[AGENTE_EDITOR_CODIGO];
  const motivo = str(input.motivo);
  if (card.needsMotivo && !motivo) {
    throw new Error("Indica el motivo de la baja.");
  }

  const v = input.values;
  const id = input.id;

  if (id === "create_client") {
    const { createClientUser } = await import("@/lib/actions/admin-actions");
    return finish(await createClientUser({ cedula: str(v.cedula) }));
  }
  if (id === "approve_credit") {
    const { approveCredit } = await import("@/lib/actions/admin-actions");
    return finish(await approveCredit(num(v.documentId), num(v.userId)));
  }
  if (id === "reject_credit") {
    const { rejectCredit } = await import("@/lib/actions/admin-actions");
    return finish(
      await rejectCredit({
        documentId: num(v.documentId),
        userId: num(v.userId),
        motivo,
        betado: bool(v.betado),
      }),
    );
  }
  if (id === "register_payment") {
    const { confirmPagoConComprobante } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    const fd = new FormData();
    fd.set("userId", String(num(v.userId)));
    fd.set("compraId", str(v.compraId));
    fd.set("contexto", str(v.contexto));
    if (str(v.tarifaId)) fd.set("tarifaId", str(v.tarifaId));
    if (str(v.referencia)) fd.set("referencia", str(v.referencia));
    if (str(v.compraProductoCreditoId)) {
      fd.set("compraProductoCreditoId", str(v.compraProductoCreditoId));
    }
    fd.set("monto", String(num(v.monto)));
    fd.set("medioPagoAdmin", str(v.medioPagoAdmin));
    fd.set("bancoOrigen", str(v.bancoOrigen));
    fd.set("entradaManual", "true");
    if (str(v.notas)) fd.set("notas", str(v.notas));
    const comprobante = input.files?.comprobante;
    if (comprobante) fd.set("file", comprobante);
    return finish(await confirmPagoConComprobante(fd));
  }
  if (id === "confirm_payment_flag") {
    const { confirmPayment } = await import("@/lib/actions/admin-actions");
    return finish(
      await confirmPayment({
        compraId: str(v.compraId),
        userId: num(v.userId),
        field: str(v.field) as "inicial" | "cuota",
        value: bool(v.value),
      }),
    );
  }
  if (id === "confirm_tarifa_pago") {
    const { confirmTarifaPago } = await import("@/lib/actions/admin-actions");
    return finish(
      await confirmTarifaPago({
        tarifaId: str(v.tarifaId),
        userId: num(v.userId),
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "remove_pago_abono") {
    const { removePagoAbono } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(await removePagoAbono(str(v.pagoId), num(v.userId)));
  }
  if (id === "update_pago_abono") {
    const { updatePagoAbono } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(
      await updatePagoAbono({
        pagoId: str(v.pagoId),
        userId: num(v.userId),
        monto: num(v.monto),
        referencia: str(v.referencia),
        medioPagoAdmin: str(v.medioPagoAdmin) as
          | "nequi_nicolas"
          | "davivienda"
          | "efectivo"
          | "datafono",
        contexto: str(v.contexto) as "inicial" | "cuota_adelantada" | "visita",
      }),
    );
  }
  if (id === "assign_visit") {
    const { assignVisit } = await import("@/lib/actions/admin-actions");
    return finish(
      await assignVisit({
        visitaId: str(v.visitaId),
        userId: num(v.userId),
        visitadorId: num(v.visitadorId),
        fechaProgramada: str(v.fechaProgramada),
      }),
    );
  }
  if (id === "complete_visit") {
    const { completeVisit } = await import("@/lib/actions/admin-actions");
    return finish(await completeVisit(str(v.visitaId), num(v.userId)));
  }
  if (id === "cancel_visit") {
    const { cancelVisit } = await import("@/lib/actions/admin-actions");
    return finish(await cancelVisit(str(v.visitaId), num(v.userId)));
  }
  if (id === "save_visitador") {
    const { saveVisitador } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveVisitador({
        id: optNum(v.id),
        nombre: str(v.nombre),
        telefono: str(v.telefono) || undefined,
        fotoUrl: str(v.fotoUrl) || undefined,
        activo: bool(v.activo),
        username: str(v.username) || undefined,
        password: str(v.password) || undefined,
      }),
    );
  }
  if (id === "delete_visitador") {
    const { deleteVisitador } = await import("@/lib/actions/admin-actions");
    return finish(await deleteVisitador(num(v.id)));
  }
  if (id === "update_delivery") {
    const { updateDelivery } = await import("@/lib/actions/admin-actions");
    return finish(
      await updateDelivery({
        compraId: str(v.compraId),
        userId: num(v.userId),
        placa: str(v.placa),
        chasis: str(v.chasis),
        serialMotor: str(v.serialMotor) || undefined,
        referencia: str(v.referencia) || undefined,
        fechaEntrega: str(v.fechaEntrega),
      }),
    );
  }
  if (id === "mark_delivered") {
    const { markDelivered } = await import("@/lib/actions/admin-actions");
    return finish(await markDelivered(str(v.compraId), num(v.userId)));
  }
  if (id === "cancel_compra") {
    const { cancelCompra } = await import("@/lib/actions/admin-actions");
    return finish(await cancelCompra(str(v.compraId), num(v.userId)));
  }
  if (id === "update_vendida_estado_fisico") {
    const { updateVendidaEstadoFisico } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(
      await updateVendidaEstadoFisico({
        compraId: str(v.compraId),
        userId: num(v.userId),
        estadoFisico: str(v.estadoFisico) as
          | "activa"
          | "recogida"
          | "robada"
          | "en_transito"
          | "en_patio",
      }),
    );
  }
  if (id === "delete_vendida_moto") {
    const { deleteVendidaMoto } = await import("@/lib/actions/admin-actions");
    return finish(await deleteVendidaMoto(str(v.compraId), num(v.userId)));
  }
  if (id === "set_tracking") {
    const { setTracking } = await import("@/lib/actions/admin-actions");
    return finish(await setTracking(num(v.userId), bool(v.seguimiento)));
  }
  if (id === "resolve_moroso") {
    const { resolveMoroso } = await import("@/lib/actions/admin-actions");
    return finish(
      await resolveMoroso({
        morosoId: str(v.morosoId),
        userId: num(v.userId),
      }),
    );
  }
  if (id === "mark_moto_recogida") {
    const { markMotoRecogida } = await import("@/lib/actions/admin-actions");
    return finish(
      await markMotoRecogida({
        recogerId: str(v.recogerId),
        userId: num(v.userId),
      }),
    );
  }
  if (id === "save_bike") {
    const { saveBike } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveBike({
        id: optNum(v.id),
        modelo: str(v.modelo),
        color: str(v.color),
        imagenUrl: str(v.imagenUrl) || undefined,
        stock: num(v.stock),
        cuotaInicial: num(v.cuotaInicial),
        cuotaDiaria: num(v.cuotaDiaria),
        montoVisita: optNum(v.montoVisita) ?? 0,
        precioVenta: optNum(v.precioVenta) ?? null,
        descripcion: str(v.descripcion) || undefined,
        activo: bool(v.activo),
      }),
    );
  }
  if (id === "delete_bike") {
    const { deleteBike } = await import("@/lib/actions/admin-actions");
    return finish(await deleteBike(num(v.id)));
  }
  if (id === "save_categoria") {
    const { saveCategoria } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveCategoria({
        id: optNum(v.id),
        nombre: str(v.nombre),
        slug: str(v.slug),
        descripcion: str(v.descripcion) || undefined,
        activo: bool(v.activo),
        orden: optNum(v.orden),
      }),
    );
  }
  if (id === "delete_categoria") {
    const { deleteCategoria } = await import("@/lib/actions/admin-actions");
    return finish(await deleteCategoria(num(v.id)));
  }
  if (id === "save_producto") {
    const { saveProducto } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveProducto({
        id: optNum(v.id),
        categoriaId: num(v.categoriaId),
        sku: str(v.sku),
        nombre: str(v.nombre),
        descripcion: str(v.descripcion) || undefined,
        precio: num(v.precio),
        costo: num(v.costo),
        stockSoluciones: num(v.stockSoluciones),
        stockBera: num(v.stockBera),
        stockBodega: num(v.stockBodega),
        stockMinimo: num(v.stockMinimo),
        gaveta: str(v.gaveta) || undefined,
        editadoPor: optNum(v.id) != null ? AGENTE_EDITOR_CODIGO : undefined,
        motivoEdicion:
          optNum(v.id) != null ? motivo || "cambio desde el chat" : undefined,
        imagenUrl: str(v.imagenUrl) || undefined,
        activo: bool(v.activo),
      }),
    );
  }
  if (id === "delete_producto") {
    const { deleteProducto } = await import("@/lib/actions/admin-actions");
    return finish(
      await deleteProducto({
        id: num(v.id),
        eliminadoPor: AGENTE_EDITOR_CODIGO,
        motivoEliminacion: motivo,
      }),
    );
  }
  if (id === "save_garaje_parqueadero") {
    const { saveGarajeParqueadero } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveGarajeParqueadero({
        id: optNum(v.id),
        nombre: str(v.nombre),
        slug: str(v.slug),
        activo: bool(v.activo),
        orden: num(v.orden),
      }),
    );
  }
  if (id === "delete_garaje_parqueadero") {
    const { deleteGarajeParqueadero } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(await deleteGarajeParqueadero(num(v.id)));
  }
  if (id === "save_garaje_moto") {
    const { saveGarajeMoto } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveGarajeMoto({
        id: str(v.id) || undefined,
        parqueaderoId: optNum(v.parqueaderoId) ?? null,
        placa: str(v.placa) || undefined,
        placaFotoUrl: str(v.placaFotoUrl) || undefined,
        referencia: str(v.referencia),
        modelo: str(v.modelo),
        color: str(v.color),
        origen: str(v.origen) as "manual" | "recuperacion",
        condicion: str(v.condicion) as "nueva" | "segunda_mano" | "recuperada",
        estado: str(v.estado) as
          | "en_garaje"
          | "retenida"
          | "en_mantenimiento"
          | "disponible"
          | "vendida"
          | "devuelta"
          | "baja",
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "delete_garaje_moto") {
    const { deleteGarajeMoto } = await import("@/lib/actions/admin-actions");
    return finish(await deleteGarajeMoto(str(v.id)));
  }
  if (id === "abrir_caja") {
    const { abrirCaja } = await import("@/lib/actions/caja-actions");
    return finish(
      await abrirCaja({
        montoApertura: num(v.montoApertura),
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "cerrar_caja") {
    const { cerrarCaja } = await import("@/lib/actions/caja-actions");
    return finish(
      await cerrarCaja({
        sesionId: str(v.sesionId),
        montoCierre: num(v.montoCierre),
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "movimiento_caja") {
    const { registrarMovimientoCaja } = await import("@/lib/actions/caja-actions");
    return finish(
      await registrarMovimientoCaja({
        sesionId: str(v.sesionId),
        tipo: str(v.tipo) as "entrada" | "salida",
        monto: num(v.monto),
        concepto: str(v.concepto),
      }),
    );
  }
  if (id === "egreso_caja") {
    const { registrarEgresoCaja } = await import("@/lib/actions/caja-actions");
    return finish(
      await registrarEgresoCaja({
        sesionId: str(v.sesionId),
        concepto: str(v.concepto),
        beneficiario: str(v.beneficiario) || undefined,
        monto: num(v.monto),
        medioPago: str(v.medioPago) as "efectivo" | "nequi" | "davivienda",
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "cobro_visita_caja") {
    const { registrarCobroVisitaDesdeCaja } = await import(
      "@/lib/actions/caja-actions"
    );
    return finish(
      await registrarCobroVisitaDesdeCaja({
        sesionId: str(v.sesionId),
        compraId: str(v.compraId),
        userId: num(v.userId),
        medioPagoAdmin: (str(v.medioPagoAdmin) || "efectivo") as
          | "efectivo"
          | "datafono"
          | "nequi_nicolas"
          | "davivienda",
      }),
    );
  }
  if (id === "save_venta_moto") {
    const { saveVentaMoto } = await import("@/lib/actions/venta-moto-actions");
    return finish(
      await saveVentaMoto({
        bikeId: num(v.bikeId),
        modelo: str(v.modelo),
        color: str(v.color),
        clienteNombre: str(v.clienteNombre),
        clienteCedula: str(v.clienteCedula),
        clienteCelular: str(v.clienteCelular),
        clienteTipoDocumento: str(v.clienteTipoDocumento) as
          | "cc"
          | "ppt"
          | "p"
          | "nit",
        clienteDireccion: str(v.clienteDireccion),
        clienteCorreo: str(v.clienteCorreo) || undefined,
        clienteFotoUrl: str(v.clienteFotoUrl),
        chasis: str(v.chasis),
        valorVenta: optNum(v.valorVenta),
        montoPagado: optNum(v.montoPagado),
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "abono_venta_moto") {
    const { addAbonoVentaMoto } = await import("@/lib/actions/venta-moto-actions");
    return finish(await addAbonoVentaMoto(str(v.id), num(v.monto)));
  }
  if (id === "update_venta_moto") {
    const { updateVentaMoto } = await import("@/lib/actions/venta-moto-actions");
    return finish(
      await updateVentaMoto({
        id: str(v.id),
        clienteNombre: str(v.clienteNombre),
        clienteCedula: str(v.clienteCedula),
        clienteCelular: str(v.clienteCelular),
        clienteTipoDocumento: str(v.clienteTipoDocumento) as
          | "cc"
          | "ppt"
          | "p"
          | "nit",
        clienteDireccion: str(v.clienteDireccion),
        clienteCorreo: str(v.clienteCorreo) || undefined,
        chasis: str(v.chasis),
        placa: str(v.placa),
        valorVenta: optNum(v.valorVenta),
        montoPagado: num(v.montoPagado),
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "placa_venta_moto") {
    const { setPlacaVentaMoto } = await import("@/lib/actions/venta-moto-actions");
    return finish(await setPlacaVentaMoto(str(v.id), str(v.placa)));
  }
  if (id === "entregar_venta_moto") {
    const { marcarEntregadaVentaMoto } = await import(
      "@/lib/actions/venta-moto-actions"
    );
    return finish(await marcarEntregadaVentaMoto(str(v.id)));
  }
  if (id === "save_venta_producto") {
    const { saveVentaProducto } = await import(
      "@/lib/actions/venta-producto-actions"
    );
    return finish(
      await saveVentaProducto({
        clienteNombre: str(v.clienteNombre),
        clienteCedula: str(v.clienteCedula) || undefined,
        clienteCelular: str(v.clienteCelular),
        montoPagado: optNum(v.montoPagado),
        notas: str(v.notas) || undefined,
        items: [
          {
            productoId: num(v.productoId),
            cantidad: num(v.cantidad),
            ubicacion: (str(v.ubicacion) || undefined) as
              | "Soluciones"
              | "Bera"
              | "Bodega"
              | undefined,
          },
        ],
      }),
    );
  }
  if (id === "abono_venta_producto") {
    const { addAbonoVentaProducto } = await import(
      "@/lib/actions/venta-producto-actions"
    );
    return finish(await addAbonoVentaProducto(str(v.id), num(v.monto)));
  }
  if (id === "publicar_carrito") {
    const { publishVentaCarritoDraft } = await import(
      "@/lib/actions/venta-carrito-draft-actions"
    );
    return finish(
      await publishVentaCarritoDraft([
        { productoId: num(v.productoId), cantidad: num(v.cantidad) },
      ]),
    );
  }
  if (id === "congelar_cuotas") {
    const { congelarCuotas } = await import(
      "@/lib/actions/credito-operaciones-actions"
    );
    return finish(
      await congelarCuotas({
        userId: num(v.userId),
        compraId: str(v.compraId),
        dias: num(v.dias),
        observaciones: str(v.observaciones) || undefined,
      }),
    );
  }
  if (id === "refinanciar_credito") {
    const { refinanciarCredito } = await import(
      "@/lib/actions/credito-operaciones-actions"
    );
    return finish(
      await refinanciarCredito({
        userId: num(v.userId),
        compraId: str(v.compraId),
        fechaRefinanciacion: str(v.fechaRefinanciacion),
        dias: num(v.dias),
        cuotaDiaria: num(v.cuotaDiaria),
      }),
    );
  }
  if (id === "saldar_credito") {
    const { saldarCredito } = await import(
      "@/lib/actions/credito-operaciones-actions"
    );
    const fd = new FormData();
    fd.set("userId", String(num(v.userId)));
    fd.set("compraId", str(v.compraId));
    fd.set("monto", String(num(v.monto)));
    fd.set("medioPagoAdmin", str(v.medioPagoAdmin) || "efectivo");
    if (str(v.referencia)) fd.set("referencia", str(v.referencia));
    if (str(v.notas)) fd.set("notas", str(v.notas));
    const comprobanteSaldo = input.files?.comprobante;
    if (comprobanteSaldo) fd.set("file", comprobanteSaldo);
    return finish(await saldarCredito(fd));
  }
  if (id === "registrar_multa") {
    const { registrarMulta } = await import(
      "@/lib/actions/credito-operaciones-actions"
    );
    return finish(
      await registrarMulta({
        userId: num(v.userId),
        compraId: str(v.compraId),
        monto: num(v.monto),
        motivo: str(v.motivoMulta),
      }),
    );
  }
  if (id === "anular_multa") {
    const { anularMulta } = await import(
      "@/lib/actions/credito-operaciones-actions"
    );
    return finish(
      await anularMulta({ userId: num(v.userId), tarifaId: str(v.tarifaId) }),
    );
  }
  if (id === "montos_primer_pago") {
    const { updateMontosPrimerPagoCompra } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(
      await updateMontosPrimerPagoCompra({
        userId: num(v.userId),
        compraId: str(v.compraId),
        cuotaInicial: num(v.cuotaInicial),
        montoCuotaPeriodo: num(v.montoCuotaPeriodo),
      }),
    );
  }
  if (id === "monto_visita") {
    const { updateMontoVisitaCompra } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(
      await updateMontoVisitaCompra({
        userId: num(v.userId),
        compraId: str(v.compraId),
        montoVisita: num(v.montoVisita),
      }),
    );
  }
  if (id === "cobra_cuota_adelantada") {
    const { updateCobraCuotaAdelantadaCompra } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(
      await updateCobraCuotaAdelantadaCompra({
        userId: num(v.userId),
        compraId: str(v.compraId),
        cobra: bool(v.cobra),
      }),
    );
  }
  if (id === "frecuencia_pago") {
    const { updateFrecuenciaPagoCompra } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(
      await updateFrecuenciaPagoCompra({
        userId: num(v.userId),
        compraId: str(v.compraId),
        frecuencia: str(v.frecuencia) as
          | "diario"
          | "semanal"
          | "quincenal"
          | "mensual",
      }),
    );
  }
  if (id === "acuerdo_primer_pago") {
    const { updateAcuerdoPrimerPago } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(
      await updateAcuerdoPrimerPago({
        userId: num(v.userId),
        compraId: str(v.compraId),
        cuotaInicial: num(v.cuotaInicial),
        montoCuotaAdelantada: num(v.montoCuotaAdelantada),
        montoVisita: num(v.montoVisita),
      }),
    );
  }
  if (id === "cerrar_primer_pago") {
    const { cerrarPrimerPago } = await import(
      "@/lib/actions/payment-comprobante-actions"
    );
    return finish(
      await cerrarPrimerPago({
        userId: num(v.userId),
        compraId: str(v.compraId),
      }),
    );
  }
  if (id === "save_producto_credito") {
    const { saveProductoCredito } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveProductoCredito({
        id: optNum(v.id),
        nombre: str(v.nombre),
        descripcion: str(v.descripcion) || undefined,
        cuotaInicial: num(v.cuotaInicial),
        cuotaDiaria: num(v.cuotaDiaria),
        plazoDias: num(v.plazoDias),
        imagenUrl: str(v.imagenUrl) || undefined,
        activo: bool(v.activo),
        orden: num(v.orden),
      }),
    );
  }
  if (id === "delete_producto_credito") {
    const { deleteProductoCredito } = await import("@/lib/actions/admin-actions");
    return finish(await deleteProductoCredito(num(v.id)));
  }
  if (id === "add_compra_producto_credito") {
    const { addCompraProductoCredito } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(
      await addCompraProductoCredito({
        userId: num(v.userId),
        compraId: str(v.compraId),
        productoCreditoId: optNum(v.productoCreditoId),
        inventarioProductoId: optNum(v.inventarioProductoId),
        ubicacion: (str(v.ubicacion) || undefined) as
          | "Soluciones"
          | "Bera"
          | "Bodega"
          | undefined,
        nombre: str(v.nombre) || undefined,
        cuotaInicial: optNum(v.cuotaInicial),
        cuotaDiaria: optNum(v.cuotaDiaria),
        plazoDias: optNum(v.plazoDias),
        cantidad: optNum(v.cantidad) ?? 1,
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "remove_compra_producto_credito") {
    const { removeCompraProductoCredito } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(
      await removeCompraProductoCredito(str(v.itemId), num(v.userId)),
    );
  }
  if (id === "plazo_producto_credito") {
    const { setCompraProductoCreditoPlazo } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(
      await setCompraProductoCreditoPlazo({
        itemId: str(v.itemId),
        userId: num(v.userId),
        plazoDias: num(v.plazoDias),
      }),
    );
  }
  if (id === "save_mecanico") {
    const { saveMecanico } = await import("@/lib/actions/taller-actions");
    return finish(
      await saveMecanico({
        id: optNum(v.id),
        nombre: str(v.nombre),
        telefono: str(v.telefono) || undefined,
        activo: bool(v.activo),
        fotoUrl: str(v.fotoUrl) || null,
      }),
    );
  }
  if (id === "delete_mecanico") {
    const { deleteMecanico } = await import("@/lib/actions/taller-actions");
    return finish(await deleteMecanico(num(v.id)));
  }
  if (id === "create_orden_taller") {
    const { createOrdenTaller } = await import("@/lib/actions/taller-actions");
    return finish(
      await createOrdenTaller({
        userId: optNum(v.userId),
        userMotoCompraId: str(v.userMotoCompraId) || undefined,
        placa: str(v.placa) || undefined,
        modelo: str(v.modelo),
        color: str(v.color) || undefined,
        contactoNombre: str(v.contactoNombre) || undefined,
        contactoTelefono: str(v.contactoTelefono) || undefined,
        descripcionFalla: str(v.descripcionFalla) || undefined,
        kilometraje: optNum(v.kilometraje),
        mecanicoId: optNum(v.mecanicoId),
      }),
    );
  }
  if (id === "update_orden_fotos") {
    const { updateOrdenFotos } = await import("@/lib/actions/taller-actions");
    const fotos = ["foto1", "foto2", "foto3"]
      .map((key) => str(v[key]))
      .filter((url) => url.length > 0);
    return finish(
      await updateOrdenFotos({ ordenId: str(v.ordenId), fotos }),
    );
  }
  if (id === "assign_orden_mecanico") {
    const { assignOrdenMecanico } = await import("@/lib/actions/taller-actions");
    return finish(
      await assignOrdenMecanico({
        ordenId: str(v.ordenId),
        mecanicoId: num(v.mecanicoId),
      }),
    );
  }
  if (id === "update_orden_estado") {
    const { updateOrdenEstado } = await import("@/lib/actions/taller-actions");
    return finish(
      await updateOrdenEstado({
        ordenId: str(v.ordenId),
        estado: str(v.estado) as
          | "en_reparacion"
          | "lista"
          | "entregada"
          | "cancelada",
      }),
    );
  }
  if (id === "add_tarea") {
    const { addTarea } = await import("@/lib/actions/taller-actions");
    return finish(
      await addTarea({
        ordenId: str(v.ordenId),
        zona: str(v.zona),
        nota: str(v.nota),
        gravedad: (str(v.gravedad) || undefined) as
          | "bien"
          | "pronto"
          | "urgente"
          | undefined,
      }),
    );
  }
  if (id === "toggle_tarea") {
    const { toggleTareaHecha } = await import("@/lib/actions/taller-actions");
    return finish(
      await toggleTareaHecha({
        ordenId: str(v.ordenId),
        tareaId: str(v.tareaId),
        hecho: bool(v.hecho),
      }),
    );
  }
  if (id === "remove_tarea") {
    const { removeTarea } = await import("@/lib/actions/taller-actions");
    return finish(
      await removeTarea({ ordenId: str(v.ordenId), tareaId: str(v.tareaId) }),
    );
  }
  if (id === "add_orden_repuesto") {
    const { addOrdenRepuesto } = await import("@/lib/actions/taller-actions");
    return finish(
      await addOrdenRepuesto({
        ordenId: str(v.ordenId),
        productoId: optNum(v.productoId),
        descripcion: str(v.descripcion) || undefined,
        cantidad: optNum(v.cantidad) ?? 1,
        zona: str(v.zona) || undefined,
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "aprobar_repuesto") {
    const { aprobarOrdenRepuesto } = await import("@/lib/actions/taller-actions");
    return finish(await aprobarOrdenRepuesto({ repuestoId: str(v.repuestoId) }));
  }
  if (id === "rechazar_repuesto") {
    const { rechazarOrdenRepuesto } = await import("@/lib/actions/taller-actions");
    return finish(
      await rechazarOrdenRepuesto({
        repuestoId: str(v.repuestoId),
        motivo,
      }),
    );
  }
  if (id === "quitar_repuesto") {
    const { removeOrdenRepuesto } = await import("@/lib/actions/taller-actions");
    return finish(await removeOrdenRepuesto(str(v.repuestoId), str(v.ordenId)));
  }
  if (id === "start_timer") {
    const { startOrdenTimer } = await import("@/lib/actions/taller-actions");
    return finish(await startOrdenTimer({ ordenId: str(v.ordenId) }));
  }
  if (id === "pause_timer") {
    const { pauseOrdenTimer } = await import("@/lib/actions/taller-actions");
    return finish(
      await pauseOrdenTimer({
        ordenId: str(v.ordenId),
        motivo: str(v.motivoTimer) || null,
      }),
    );
  }
  if (id === "stop_timer") {
    const { stopOrdenTimer } = await import("@/lib/actions/taller-actions");
    return finish(
      await stopOrdenTimer({
        ordenId: str(v.ordenId),
        motivo: str(v.motivoTimer) || null,
      }),
    );
  }
  if (id === "update_solicitud_estado") {
    const { updateSolicitudEstado } = await import("@/lib/actions/admin-actions");
    return finish(
      await updateSolicitudEstado({
        solicitudId: str(v.solicitudId),
        estado: str(v.estado) as
          | "pendiente"
          | "en_proceso"
          | "completada"
          | "cancelada",
        notasAdmin: str(v.notasAdmin) || undefined,
      }),
    );
  }
  if (id === "liberar_garaje") {
    const { liberarGarajeMotoParaVenta } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(await liberarGarajeMotoParaVenta({ garajeMotoId: str(v.garajeMotoId) }));
  }
  if (id === "devolver_garaje") {
    const { devolverGarajeMotoAlCliente } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(
      await devolverGarajeMotoAlCliente({ garajeMotoId: str(v.garajeMotoId) }),
    );
  }
  if (id === "add_mantenimiento_garaje") {
    const { addGarajeMantenimientoItem } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(
      await addGarajeMantenimientoItem({
        garajeMotoId: str(v.garajeMotoId),
        productoId: num(v.productoId),
        cantidad: num(v.cantidad),
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "remove_mantenimiento_item") {
    const { removeGarajeMantenimientoItem } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(await removeGarajeMantenimientoItem(str(v.itemId)));
  }
  if (id === "terminar_mantenimiento") {
    const { terminarGarajeMantenimiento } = await import(
      "@/lib/actions/admin-actions"
    );
    return finish(
      await terminarGarajeMantenimiento({
        garajeMotoId: str(v.garajeMotoId),
        cuotaInicial: num(v.cuotaInicial),
        cuotaDiaria: num(v.cuotaDiaria),
        montoVisita: optNum(v.montoVisita),
      }),
    );
  }
  if (id === "create_tarjeta") {
    const { createTarjetaPropiedad } = await import(
      "@/lib/actions/tarjeta-propiedad-actions"
    );
    return finish(
      await createTarjetaPropiedad({
        placa: str(v.placa),
        imagen_url: str(v.imagen_url),
        imagen_reverso_url: str(v.imagen_reverso_url),
      }),
    );
  }
  if (id === "delete_tarjeta") {
    const { deleteTarjetaPropiedad } = await import(
      "@/lib/actions/tarjeta-propiedad-actions"
    );
    await deleteTarjetaPropiedad(str(v.id));
    return { ok: true };
  }
  if (id === "transferir_titularidad") {
    const { transferirTitularidad } = await import("@/lib/actions/admin-actions");
    return finish(
      await transferirTitularidad({
        compraId: str(v.compraId),
        fromUserId: num(v.fromUserId),
        toUserId: num(v.toUserId),
        motivo: str(v.motivoTraspaso) || undefined,
      }),
    );
  }
  if (id === "save_conductor") {
    const { saveConductorInfo } = await import("@/lib/actions/admin-actions");
    return finish(
      await saveConductorInfo({
        compraId: str(v.compraId),
        userId: num(v.userId),
        nombre: str(v.nombre),
        cedula: str(v.cedula),
        celular: str(v.celular) || undefined,
        notas: str(v.notas) || undefined,
      }),
    );
  }
  if (id === "trasladar_inventario") {
    const { trasladarInventario } = await import(
      "@/lib/actions/inventario-traslado-actions"
    );
    return finish(
      await trasladarInventario({
        productoId: num(v.productoId),
        desde: str(v.desde) as "Soluciones" | "Bera" | "Bodega",
        hacia: str(v.hacia) as "Soluciones" | "Bera" | "Bodega",
        cantidad: num(v.cantidad),
        autor,
        nota: str(v.nota) || undefined,
        gavetaDestino: str(v.gavetaDestino) || undefined,
      }),
    );
  }
  if (id === "add_producto_novedad") {
    const { addProductoNovedad } = await import("@/lib/actions/admin-actions");
    return finish(
      await addProductoNovedad({
        productoId: num(v.productoId),
        autor,
        contenido: str(v.contenido),
      }),
    );
  }
  if (id === "update_hoja_vida") {
    const { updateContractHojaVida } = await import("@/lib/actions/admin-actions");
    const base = emptyHojaVidaForm();
    const tipo = str(v.tipo_identificacion);
    const estado = str(v.estado_civil);
    return finish(
      await updateContractHojaVida({
        contractId: str(v.contractId),
        userId: num(v.userId),
        hojaVida: {
          ...base,
          nombre_completo: str(v.nombre_completo),
          tipo_identificacion:
            tipo === "cc" || tipo === "ppt" || tipo === "p" || tipo === "cv"
              ? tipo
              : null,
          numero_identificacion: str(v.numero_identificacion),
          fecha_nacimiento: str(v.fecha_nacimiento),
          celular: str(v.celular),
          direccion: str(v.direccion),
          barrio: str(v.barrio),
          correo: str(v.correo),
          trabaja_empresa: v.trabaja_empresa == null || v.trabaja_empresa === ""
            ? null
            : bool(v.trabaja_empresa),
          nombre_empresa: str(v.nombre_empresa),
          telefono_empresa: str(v.telefono_empresa),
          direccion_empresa: str(v.direccion_empresa),
          independiente:
            v.independiente == null || v.independiente === ""
              ? null
              : bool(v.independiente),
          habilidad: str(v.habilidad),
          estado_civil:
            estado === "soltero" || estado === "casado" || estado === "union_libre"
              ? estado
              : null,
          nombre_conyuge: str(v.nombre_conyuge),
          celular_conyuge: str(v.celular_conyuge),
          referencias: [
            { nombre: str(v.ref1_nombre), celular: str(v.ref1_celular) },
            { nombre: str(v.ref2_nombre), celular: str(v.ref2_celular) },
          ],
        },
      }),
    );
  }

  throw new Error("Esa acción no está disponible en el chat.");
}
