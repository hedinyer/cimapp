"use client";

import { useRef } from "react";
import { z } from "zod";
import { dispatchArtifactIntent } from "@/components/artifacts/artifact-intent";
import {
  useArtifactAction,
  useArtifactRuntime,
  useArtifactState,
} from "@/components/artifacts/artifact-runtime";
import {
  abrirCaja,
  registrarMovimientoCaja,
  type CajaSesionState,
} from "@/lib/actions/caja-actions";
import { saveVentaProducto } from "@/lib/actions/venta-producto-actions";
import type { VentaMotoRow } from "@/lib/actions/venta-moto-actions";
import { fold } from "@/lib/artifacts/intent";
import type { ModuleId } from "@/lib/hermes/chat-events";
import type {
  BikeRow,
  GarajeMotoRow,
  InventarioCategoriaRow,
  InventarioProductoRow,
  TarjetaPropiedadRow,
  VendidaMotoRow,
} from "@/lib/pipeline/types";
import type { MecanicoRow, OrdenTallerRow } from "@/lib/taller/types";

const previousSearch = new Map<string, string>();

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function useBuscar(
  id: ModuleId,
  description: string,
  onSearch: (texto: string) => unknown,
) {
  const api = useArtifactRuntime();
  useArtifactAction(
    id,
    "buscar",
    description,
    z.object({ texto: z.string() }),
    async (args) => {
      const texto = text(args.texto);
      const before = previousSearch.get(id) ?? "";
      api.pushUndo({
        label: `Búsqueda de ${id}`,
        run: async () => {
          previousSearch.set(id, before);
          dispatchArtifactIntent(id, { texto: before });
          return "Restauré la búsqueda anterior.";
        },
      });
      previousSearch.set(id, texto);
      dispatchArtifactIntent(id, { texto });
      return onSearch(texto);
    },
  );
}

export function useAbrirCredito() {
  useArtifactAction(
    "creditos",
    "abrir",
    "Muestra la ficha de esa solicitud dentro de esta pantalla.",
    z.object({ userId: z.number().int().positive(), nombre: z.string() }),
    async (args) => {
      const userId = Number(args.userId);
      const nombre = text(args.nombre);
      dispatchArtifactIntent("creditos", { userId, nombre });
      return { userId, nombre };
    },
  );
}
export function useFiltroCreditos() {
  useArtifactAction(
    "creditos",
    "filtro",
    "Cambia la pestaña visible: pendiente, aceptada (Aprobado) o rechazada.",
    z.object({ estado: z.enum(["pendiente", "aceptada", "rechazada"]) }),
    async (args) => {
      const estado = text(args.estado);
      dispatchArtifactIntent("creditos", { estado });
      return { estado };
    },
  );
}

export type EntregaPropuesta = {
  chasis: string;
  serialMotor: string;
  placa: string;
  fechaEntrega: string;
};

type FichaEntrega = {
  userId: number;
  compraId: string;
  placa: string;
  fechaEntrega: string;
};

function entregaFrom(args: Record<string, unknown>, ficha: FichaEntrega | null): EntregaPropuesta & FichaEntrega {
  if (!ficha?.compraId) {
    throw new Error("Abre la ficha del cliente. No hay una compra para registrar la entrega.");
  }
  const chasis = text(args.chasis).trim();
  if (!chasis) throw new Error("Falta el chasis.");
  const placa = text(args.placa).trim() || ficha.placa.trim();
  if (!placa) throw new Error("Falta la placa.");
  const fecha = (text(args.fechaEntrega).trim() || ficha.fechaEntrega.trim()).slice(0, 10);
  if (!fecha) throw new Error("Falta la fecha de entrega.");
  return {
    userId: ficha.userId,
    compraId: ficha.compraId,
    chasis,
    serialMotor: text(args.serialMotor).trim(),
    placa,
    fechaEntrega: fecha,
  };
}

export function useEntregaCredito(ficha: FichaEntrega | null) {
  const fichaRef = useRef(ficha);
  fichaRef.current = ficha;
  const prepare = async (args: Record<string, unknown>) => {
    const next = entregaFrom(args, fichaRef.current);
    const propuesta: EntregaPropuesta = {
      chasis: next.chasis,
      serialMotor: next.serialMotor,
      placa: next.placa,
      fechaEntrega: next.fechaEntrega,
    };
    dispatchArtifactIntent("creditos", { propuesta });
    const serial = propuesta.serialMotor || "sin serial";
    return `Chasis ${propuesta.chasis}, serial ${serial}, placa ${propuesta.placa}, fecha ${propuesta.fechaEntrega}. Escribe sí para guardarlos.`;
  };
  useArtifactAction(
    "creditos",
    "entrega",
    "Escribe chasis y serial en la ficha abierta. Placa y fecha salen de la ficha; si faltan, responde ese campo. No guarda hasta el sí.",
    z.object({
      chasis: z.string().min(1),
      serialMotor: z.string().optional(),
      placa: z.string().optional(),
      fechaEntrega: z.string().optional(),
    }),
    async (args) => {
      const next = entregaFrom(args, fichaRef.current);
      const { updateDelivery } = await import("@/lib/actions/admin-actions");
      await updateDelivery({
        compraId: next.compraId,
        userId: next.userId,
        placa: next.placa,
        chasis: next.chasis,
        serialMotor: next.serialMotor,
        fechaEntrega: next.fechaEntrega,
      });
      dispatchArtifactIntent("creditos", { propuesta: null, entregaGuardada: true });
      return { chasis: next.chasis, serialMotor: next.serialMotor };
    },
    { destructive: true, prepare },
  );
}

export function CajaBridge({ sesion }: { sesion: CajaSesionState | null }) {
  const api = useArtifactRuntime();
  useArtifactState("caja", {
    abierta: Boolean(sesion?.abierta),
    sesionId: sesion?.id ?? null,
    montoApertura: sesion?.montoApertura ?? null,
    efectivoEsperado: sesion?.efectivoEsperado ?? null,
    movimientos: (sesion?.movimientos ?? []).slice(-6).map((item) => ({
      tipo: item.tipo,
      monto: item.monto,
      concepto: item.concepto,
    })),
  });
  useArtifactAction(
    "caja",
    "abrir",
    "Abre la caja del día con el efectivo inicial en pesos.",
    z.object({
      montoApertura: z.number().int().positive(),
      notas: z.string().optional(),
    }),
    async (args) => {
      const next = await abrirCaja({
        montoApertura: Number(args.montoApertura),
        notas: args.notas ? text(args.notas) : undefined,
      });
      api.reload("caja");
      api.reload("vender");
      return { abierta: Boolean(next?.abierta), sesionId: next?.id ?? null };
    },
  );
  useArtifactAction(
    "caja",
    "movimiento",
    "Registra una entrada o salida de efectivo en la caja abierta.",
    z.object({
      tipo: z.enum(["entrada", "salida"]),
      monto: z.number().int().positive(),
      concepto: z.string().min(1),
    }),
    async (args) => {
      if (!sesion?.abierta || !sesion.id) {
        throw new Error("La caja no está abierta.");
      }
      await registrarMovimientoCaja({
        sesionId: sesion.id,
        tipo: args.tipo === "salida" ? "salida" : "entrada",
        monto: Number(args.monto),
        concepto: text(args.concepto),
      });
      api.reload("caja");
      return { ok: true };
    },
  );
  return null;
}

export function VenderBridge({ sesion }: { sesion: CajaSesionState | null }) {
  const api = useArtifactRuntime();
  useArtifactState("vender", {
    cajaAbierta: Boolean(sesion?.abierta),
    sesionId: sesion?.id ?? null,
  });
  useArtifactAction(
    "vender",
    "cobrar",
    "Cobra uno o más productos iguales. Necesita productoId del inventario, celular de 10 dígitos y monto pagado si es efectivo.",
    z.object({
      clienteNombre: z.string().min(1),
      clienteCelular: z.string().min(10),
      clienteCedula: z.string().optional(),
      productoId: z.number().int().positive(),
      cantidad: z.number().int().positive(),
      ubicacion: z.enum(["Soluciones", "Bera", "Bodega"]).optional(),
      montoPagado: z.number().int().nonnegative().optional(),
      notas: z.string().optional(),
    }),
    async (args) => {
      const ubicacion = args.ubicacion;
      const venta = await saveVentaProducto({
        clienteNombre: text(args.clienteNombre),
        clienteCelular: text(args.clienteCelular),
        clienteCedula: args.clienteCedula ? text(args.clienteCedula) : undefined,
        montoPagado:
          args.montoPagado == null ? undefined : Number(args.montoPagado),
        notas: args.notas ? text(args.notas) : undefined,
        items: [
          {
            productoId: Number(args.productoId),
            cantidad: Number(args.cantidad),
            ubicacion:
              ubicacion === "Soluciones" ||
              ubicacion === "Bera" ||
              ubicacion === "Bodega"
                ? ubicacion
                : undefined,
          },
        ],
      });
      api.reload("vender");
      api.reload("caja");
      api.reload("inventario");
      return {
        id: venta.id,
        total: venta.total,
        montoPagado: venta.montoPagado,
      };
    },
  );
  return null;
}

export function InventarioBridge({
  categorias,
  productos,
}: {
  categorias: InventarioCategoriaRow[];
  productos: InventarioProductoRow[];
}) {
  const api = useArtifactRuntime();
  useArtifactState("inventario", {
    categorias: categorias.map((item) => ({ id: item.id, nombre: item.nombre })),
    mostrados: Math.min(productos.length, 20),
    total: productos.length,
    productos: productos.slice(0, 20).map((item) => ({
      id: item.id,
      nombre: item.nombre,
      sku: item.sku,
      precio: item.precio,
      stock: item.stock,
      categoria: item.inventario_categorias?.nombre ?? "",
    })),
  });
  useArtifactAction(
    "inventario",
    "buscar",
    "Busca productos por nombre o sku y devuelve id, precio y stock.",
    z.object({ texto: z.string() }),
    async (args) => {
      const texto = text(args.texto);
      const before = previousSearch.get("inventario") ?? "";
      api.pushUndo({
        label: "Filtro de inventario",
        run: async () => {
          previousSearch.set("inventario", before);
          dispatchArtifactIntent("inventario", { texto: before });
          return "Quité el filtro de inventario.";
        },
      });
      previousSearch.set("inventario", texto);
      dispatchArtifactIntent("inventario", { texto });
      const query = fold(texto);
      const matches = productos
        .filter((item) => fold(`${item.nombre} ${item.sku}`).includes(query))
        .slice(0, 12)
        .map((item) => ({
          id: item.id,
          nombre: item.nombre,
          sku: item.sku,
          precio: item.precio,
          stock: item.stock,
        }));
      return { matches };
    },
  );
  return null;
}

export function GarajeBridge({ motos }: { motos: GarajeMotoRow[] }) {
  useArtifactState("garaje", {
    total: motos.length,
    motos: motos.slice(0, 20).map((moto) => ({
      id: moto.id,
      placa: moto.placa,
      modelo: moto.modelo,
      estado: moto.estado,
    })),
  });
  useBuscar("garaje", "Filtra motos por placa o modelo.", (texto) => {
    const query = fold(texto);
    return {
      matches: motos
        .filter((moto) => fold(`${moto.placa ?? ""} ${moto.modelo}`).includes(query))
        .slice(0, 12)
        .map((moto) => ({
          id: moto.id,
          placa: moto.placa,
          modelo: moto.modelo,
          estado: moto.estado,
        })),
    };
  });
  return null;
}

export function CatalogoBridge({ bikes }: { bikes: BikeRow[] }) {
  useArtifactState("catalogo", {
    total: bikes.length,
    motos: bikes.slice(0, 20).map((bike) => ({
      id: bike.id,
      modelo: bike.modelo,
      color: bike.color,
      stock: bike.stock,
      precioVenta: bike.precio_venta,
    })),
  });
  useBuscar("catalogo", "Busca una referencia por modelo.", (texto) => {
    const query = fold(texto);
    return {
      matches: bikes
        .filter((bike) => fold(bike.modelo).includes(query))
        .slice(0, 12)
        .map((bike) => ({ id: bike.id, modelo: bike.modelo, stock: bike.stock })),
    };
  });
  return null;
}

export function ContadoBridge({ ventas }: { ventas: VentaMotoRow[] }) {
  useArtifactState("contado", {
    total: ventas.length,
    ventas: ventas.slice(0, 15).map((venta) => ({
      id: venta.id,
      cliente: venta.clienteNombre,
      modelo: venta.modelo,
      placa: venta.placa,
    })),
  });
  useBuscar("contado", "Filtra ventas al contado por cliente o placa.", (texto) => ({
    texto,
  }));
  return null;
}

export function CreditoCalleBridge({ motos }: { motos: VendidaMotoRow[] }) {
  useArtifactState("credito-calle", {
    total: motos.length,
    motos: motos.slice(0, 15).map((moto) => ({
      placa: moto.placa,
      modelo: moto.modelo,
      estado: moto.estado_fisico,
    })),
  });
  useBuscar("credito-calle", "Filtra motos en calle por placa o modelo.", (texto) => ({
    texto,
  }));
  return null;
}

export function TallerBridge({ ordenes }: { ordenes: OrdenTallerRow[] }) {
  useArtifactState("taller", {
    total: ordenes.length,
    ordenes: ordenes.slice(0, 15).map((orden) => ({
      id: orden.id,
      numero: orden.numero,
      placa: orden.placa,
      modelo: orden.modelo,
      estado: orden.estado,
    })),
  });
  useBuscar("taller", "Filtra órdenes por placa o modelo.", (texto) => ({ texto }));
  useArtifactAction(
    "taller",
    "pestana",
    "Cambia la pestaña: recibida, en_reparacion o lista.",
    z.object({ estado: z.enum(["recibida", "en_reparacion", "lista"]) }),
    async (args) => {
      dispatchArtifactIntent("taller", { tab: text(args.estado) });
      return { tab: text(args.estado) };
    },
  );
  return null;
}

export function SebastianBridge({ ordenes }: { ordenes: OrdenTallerRow[] }) {
  useArtifactState("sebastian", {
    pendientes: ordenes.length,
    ordenes: ordenes.slice(0, 12).map((orden) => ({
      id: orden.id,
      numero: orden.numero,
      placa: orden.placa,
      modelo: orden.modelo,
    })),
  });
  return null;
}

export function MecanicosBridge({
  mecanicos,
}: {
  mecanicos: Pick<MecanicoRow, "id" | "nombre" | "activo">[];
}) {
  useArtifactState("mecanicos", {
    total: mecanicos.length,
    mecanicos: mecanicos.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      activo: item.activo,
    })),
  });
  return null;
}

export function TarjetasBridge({ tarjetas }: { tarjetas: TarjetaPropiedadRow[] }) {
  useArtifactState("tarjetas", {
    total: tarjetas.length,
    tarjetas: tarjetas.slice(0, 15).map((item) => ({
      id: item.id,
      placa: item.placa,
      marca: item.marca,
      linea: item.linea,
    })),
  });
  return null;
}

export function ResumenBridge({
  id,
  state,
}: {
  id: ModuleId;
  state: unknown;
}) {
  useArtifactState(id, state);
  return null;
}
