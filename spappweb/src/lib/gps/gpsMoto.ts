import "server-only";

import {
  buscarUbicacionGpsEnVivo as buscarStEnVivo,
  buscarUbicacionGps as buscarSt,
  enviarComandoMotor as comandoSt,
  enlaceMapaEmbebido,
  mensajeGpsNoDisponible as mensajeSt,
  systemTrackConfigurado,
} from "@/lib/gps/systemTrackGps";
import {
  buscarUbicacionGpsDs,
  buscarUbicacionGpsDsEnVivo,
  dsTrackConfigurado,
  enviarComandoMotorDs,
  mensajeGpsDsNoDisponible,
} from "@/lib/gps/dsTrackGps";
import {
  buscarUbicacionGpsIop,
  buscarUbicacionGpsIopEnVivo,
  enviarComandoMotorIop,
  iopGpsConfigurado,
  mensajeGpsIopNoDisponible,
} from "@/lib/gps/iopGps";
import {
  etiquetaEstadoGps,
  etiquetaProveedorGps,
  gpsMotoDesdeProveedor,
  preferirDispositivoGps,
  resolverProveedorGps,
  type AccionMotorGps,
  type ProveedorGps,
  type UbicacionGpsMoto,
} from "@/lib/gps/ubicacionGps";

export type { AccionMotorGps, ProveedorGps, UbicacionGpsMoto };
export {
  etiquetaEstadoGps,
  enlaceMapaEmbebido,
  etiquetaProveedorGps,
  gpsMotoDesdeProveedor,
  resolverProveedorGps,
};

export type ResultadoBusquedaGps =
  | { ok: true; gps: UbicacionGpsMoto }
  | { ok: false; motivo: "sin_dispositivo" | "error_proveedor" };

export type ResultadoComandoMotor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

/** System Track primero: es el proveedor activo hoy. */
const PROVEEDORES: ProveedorGps[] = ["system_track", "iopgps", "dstrack"];

function gpsMotoExplicito(gpsMoto?: string | null): boolean {
  return String(gpsMoto ?? "").trim().length > 0;
}

function proveedorConfigurado(proveedor: ProveedorGps): boolean {
  if (proveedor === "system_track") return systemTrackConfigurado();
  if (proveedor === "iopgps") return iopGpsConfigurado();
  return dsTrackConfigurado();
}

function proveedoresActivos(gpsMoto?: string | null): ProveedorGps[] {
  if (gpsMotoExplicito(gpsMoto)) {
    const p = resolverProveedorGps(gpsMoto);
    return proveedorConfigurado(p) ? [p] : [];
  }
  return PROVEEDORES.filter(proveedorConfigurado);
}

function elegirMejorBusqueda(
  resultados: ResultadoBusquedaGps[],
): ResultadoBusquedaGps {
  let mejor: UbicacionGpsMoto | null = null;
  let huboErrorProveedor = false;

  for (const r of resultados) {
    if (!r.ok) {
      if (r.motivo === "error_proveedor") huboErrorProveedor = true;
      continue;
    }
    mejor = mejor ? preferirDispositivoGps(mejor, r.gps) : r.gps;
  }

  if (mejor) return { ok: true, gps: mejor };
  if (huboErrorProveedor) return { ok: false, motivo: "error_proveedor" };
  return { ok: false, motivo: "sin_dispositivo" };
}

function buscarEnProveedor(
  proveedor: ProveedorGps,
  placa: string,
  opciones?: { enVivo?: boolean; deviceId?: number; imei?: string },
): Promise<ResultadoBusquedaGps> {
  if (proveedor === "iopgps") {
    return opciones?.enVivo
      ? buscarUbicacionGpsIopEnVivo(placa, opciones.deviceId, opciones.imei)
      : buscarUbicacionGpsIop(placa);
  }
  if (proveedor === "dstrack") {
    return opciones?.enVivo
      ? buscarUbicacionGpsDsEnVivo(placa, opciones.deviceId, opciones.imei)
      : buscarUbicacionGpsDs(placa);
  }
  return opciones?.enVivo
    ? buscarStEnVivo(placa, opciones.deviceId)
    : buscarSt(placa);
}

/**
 * Devuelve el primer hit OK sin esperar al resto.
 * Si nadie encuentra, espera a todos y elige el mejor motivo de fallo.
 */
async function buscarRapido(
  proveedores: ProveedorGps[],
  placa: string,
  opciones?: { enVivo?: boolean; deviceId?: number; imei?: string },
): Promise<ResultadoBusquedaGps> {
  if (proveedores.length === 0) {
    return { ok: false, motivo: "sin_dispositivo" };
  }
  if (proveedores.length === 1) {
    return buscarEnProveedor(proveedores[0], placa, opciones);
  }

  return new Promise((resolve) => {
    let pendientes = proveedores.length;
    const fallos: ResultadoBusquedaGps[] = [];
    let cerrado = false;

    for (const proveedor of proveedores) {
      void buscarEnProveedor(proveedor, placa, opciones).then((resultado) => {
        if (cerrado) return;
        if (resultado.ok) {
          cerrado = true;
          resolve(resultado);
          return;
        }
        fallos.push(resultado);
        pendientes -= 1;
        if (pendientes === 0) resolve(elegirMejorBusqueda(fallos));
      });
    }
  });
}

function comandoEnProveedor(
  proveedor: ProveedorGps,
  placa: string,
  accion: AccionMotorGps,
): Promise<ResultadoComandoMotor> {
  if (proveedor === "iopgps") return enviarComandoMotorIop(placa, accion);
  if (proveedor === "dstrack") return enviarComandoMotorDs(placa, accion);
  return comandoSt(placa, accion);
}

export async function buscarUbicacionGps(
  placa: string,
  gpsMoto?: string | null,
): Promise<ResultadoBusquedaGps> {
  return buscarRapido(proveedoresActivos(gpsMoto), placa);
}

export async function buscarUbicacionGpsEnVivo(
  placa: string,
  opciones?: {
    gpsMoto?: string | null;
    deviceId?: number;
    imei?: string;
  },
): Promise<ResultadoBusquedaGps> {
  const live = {
    enVivo: true as const,
    deviceId: opciones?.deviceId,
    imei: opciones?.imei,
  };
  return buscarRapido(proveedoresActivos(opciones?.gpsMoto), placa, live);
}

export async function enviarComandoMotor(
  placa: string,
  accion: AccionMotorGps,
  gpsMoto?: string | null,
): Promise<ResultadoComandoMotor> {
  if (gpsMotoExplicito(gpsMoto)) {
    return comandoEnProveedor(resolverProveedorGps(gpsMoto), placa, accion);
  }

  const ubicacion = await buscarUbicacionGps(placa, gpsMoto);
  if (!ubicacion.ok) {
    return {
      ok: false,
      error: mensajeGpsNoDisponible(placa, ubicacion.motivo, gpsMoto),
    };
  }

  return comandoEnProveedor(ubicacion.gps.proveedor, placa, accion);
}

export function mensajeGpsNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
  gpsMoto?: string | null,
): string {
  if (!gpsMotoExplicito(gpsMoto)) {
    if (motivo === "error_proveedor") {
      return "No se pudo consultar IOP GPS, DS Track ni System Track. Intenta de nuevo.";
    }
    return `La placa ${placa.trim().toUpperCase()} no aparece en IOP GPS, DS Track ni System Track.`;
  }

  const proveedor = resolverProveedorGps(gpsMoto);
  if (proveedor === "iopgps") return mensajeGpsIopNoDisponible(placa, motivo);
  if (proveedor === "dstrack") return mensajeGpsDsNoDisponible(placa, motivo);
  return mensajeSt(placa, motivo);
}
