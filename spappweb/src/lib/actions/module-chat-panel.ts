"use server";

import { requireAdminSession } from "@/lib/auth/session";
import { getAdminClientReferralScope } from "@/lib/auth/admin-client-scope";
import { getCajaSesionHoy } from "@/lib/actions/caja-actions";
import { getVentasContado } from "@/lib/actions/venta-moto-actions";
import { countStockSegundaMano } from "@/lib/garaje/stock-segunda";
import type { ModuleId } from "@/lib/hermes/chat-events";
import {
  getAllBikes,
  getAllCategorias,
  getAllGarajeMotos,
  getAllGarajeParqueaderos,
  getAllProductos,
  getAllSolicitudesTaller,
  getAllTarjetasPropiedad,
  getAllVendidasMotos,
  getAllVisitadores,
  getAvailableBikes,
  getEquipoVisitasDetalle,
  getGarajeMantenimientoItemsByMotoIds,
  getGarajeMotosVendidas,
  getInboxListItems,
  getInboxQueues,
  getReferralLeaderboard,
  getReferralLinkLeaderboard,
  listClientesMotoCredito,
} from "@/lib/pipeline/queries";
import { currentCommissionPeriod } from "@/lib/referrals";
import {
  getMecanicos,
  getMecanicosConStats,
  getPendientesSebastian,
  getTableroTaller,
} from "@/lib/taller/queries";

export async function loadModuleChat(id: ModuleId) {
  await requireAdminSession();

  switch (id) {
    case "creditos":
      return {
        id,
        items: await getInboxListItems("creditos"),
      };
    case "hoy": {
      const [queues, bikes] = await Promise.all([
        getInboxQueues(),
        getAllBikes(),
      ]);
      return { id, queues, bikes };
    }
    case "clientes":
      return { id, creditClients: await listClientesMotoCredito() };
    case "historial-pagos":
    case "historial-ventas":
      return { id };
    case "inventario": {
      const [categorias, productos] = await Promise.all([
        getAllCategorias(),
        getAllProductos(),
      ]);
      return { id, categorias, productos };
    }
    case "catalogo": {
      const [bikes, motosGaraje] = await Promise.all([
        getAllBikes(),
        getAllGarajeMotos(),
      ]);
      return { id, bikes, stockSegunda: countStockSegundaMano(motosGaraje) };
    }
    case "garaje": {
      const [parqueaderos, motos, productos, bikes] = await Promise.all([
        getAllGarajeParqueaderos(),
        getAllGarajeMotos(),
        getAllProductos(),
        getAllBikes(),
      ]);
      const stockNuevo = bikes.filter((bike) => bike.activo && bike.stock > 0);
      const mantenimientoByMoto = await getGarajeMantenimientoItemsByMotoIds(
        motos
          .filter(
            (moto) =>
              moto.estado === "en_mantenimiento" ||
              moto.estado === "disponible" ||
              moto.estado === "retenida",
          )
          .map((moto) => moto.id),
      );
      return { id, parqueaderos, motos, stockNuevo, productos, mantenimientoByMoto };
    }
    case "contado": {
      const [ventas, bikes] = await Promise.all([
        getVentasContado(),
        getAvailableBikes(),
      ]);
      return { id, ventas, bikes };
    }
    case "historial-patio":
      return { id, motos: await getGarajeMotosVendidas() };
    case "credito-calle":
      return { id, motos: await getAllVendidasMotos() };
    case "tarjetas":
      return { id, tarjetas: await getAllTarjetasPropiedad() };
    case "vender":
      return { id, sesion: await getCajaSesionHoy().catch(() => null) };
    case "caja":
      return { id, sesion: await getCajaSesionHoy().catch(() => null) };
    case "taller": {
      const [ordenes, mecanicos] = await Promise.all([
        getTableroTaller(),
        getMecanicos(true),
      ]);
      return { id, ordenes, mecanicos };
    }
    case "sebastian":
      return { id, ordenes: await getPendientesSebastian() };
    case "mecanicos":
      return { id, mecanicos: await getMecanicosConStats() };
    case "solicitudes-taller":
      return { id, solicitudes: await getAllSolicitudesTaller() };
    case "equipo": {
      if (await getAdminClientReferralScope()) {
        return { id, blocked: true as const };
      }
      const period = currentCommissionPeriod();
      const range = {
        startIso: period.startIso,
        endExclusiveIso: period.endExclusiveIso,
      };
      const [visitadores, leaderboard, linkLeaderboard, visitasDetalle] =
        await Promise.all([
          getAllVisitadores(),
          getReferralLeaderboard(range),
          getReferralLinkLeaderboard(range),
          getEquipoVisitasDetalle(range),
        ]);
      return {
        id,
        blocked: false as const,
        visitadores,
        leaderboard,
        linkLeaderboard,
        visitasDetalle,
        period,
      };
    }
    default:
      return null;
  }
}
