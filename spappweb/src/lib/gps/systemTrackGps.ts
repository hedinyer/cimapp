import "server-only";

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extraerPlacasDeTexto,
  normalizarPlaca,
  variantesPlaca,
} from "@/lib/gps/placaGps";
import type {
  AccionMotorGps,
  UbicacionGpsMoto,
} from "@/lib/gps/ubicacionGps";

export type { AccionMotorGps, UbicacionGpsMoto };
export { etiquetaEstadoGps } from "@/lib/gps/ubicacionGps";

const SYSTEMTRACK_BASE_URL = "https://plataforma.sistemagps.online";
const SYSTEMTRACK_EMAIL = "marisolpinilla@hotmail.com";
const SYSTEMTRACK_PASSWORD = "098765";
/** Hash estable de la cuenta; evita esperar login en el primer poll. */
const SYSTEMTRACK_USER_API_HASH_FALLBACK =
  "$2y$10$WI01IqH.ZfscywOjwOcb3.hWsLw0WbYrctIsJ2Fca8Qb5uTaJbCM6";

/** Fresco: no dispara red. */
const CACHE_FRESH_MS = 3_000;
/** Stale usable: responde YA y refresca en background (latest ~1s). */
const CACHE_STALE_MAX_MS = 30 * 60_000;
/** Catálogo completo (get_devices ~10s) como máximo cada N ms. */
const FULL_REFRESH_MIN_MS = 10 * 60_000;
const AUTH_TTL_MS = 25 * 60_000;

const DISK_CACHE_PATH = join(tmpdir(), "cimapp-systemtrack-gps.json");

export function systemTrackConfigurado(): boolean {
  return Boolean(
    SYSTEMTRACK_EMAIL.trim() &&
      (SYSTEMTRACK_PASSWORD.trim() || SYSTEMTRACK_USER_API_HASH_FALLBACK.trim()),
  );
}

type GpsSensor = {
  tag_name?: string;
  name?: string;
  val?: boolean;
  value?: string;
};

type GpsDeviceItem = {
  id?: number;
  lat?: number;
  lng?: number;
  speed?: number;
  course?: number;
  time?: string;
  online?: string;
  name?: string;
  sensors?: GpsSensor[];
  device_data?: { plate_number?: string };
};

type GpsDeviceGroup = {
  items?: GpsDeviceItem[];
};

type LoginResponse = {
  status?: number;
  user_api_hash?: string;
};

type SendCommandResponse = {
  status?: number;
  message?: string;
  error?: string;
};

type IndiceGps = {
  fetchedAt: number;
  fullFetchedAt: number;
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
};

type DiskCache = {
  fetchedAt: number;
  fullFetchedAt: number;
  byId: Record<string, UbicacionGpsMoto>;
  plates: Record<string, number>;
};

let cacheDispositivos: IndiceGps | null = null;
let cacheAuth: { hash: string; fetchedAt: number } | null =
  SYSTEMTRACK_USER_API_HASH_FALLBACK
    ? { hash: SYSTEMTRACK_USER_API_HASH_FALLBACK, fetchedAt: Date.now() }
    : null;
let diskHydrated = false;
let latestEnCurso: Promise<void> | null = null;
let fullEnCurso: Promise<void> | null = null;

function clavesPlacaDispositivo(item: GpsDeviceItem): string[] {
  const claves = new Set<string>();
  for (const placa of extraerPlacasDeTexto(
    String(item.device_data?.plate_number ?? ""),
  )) {
    claves.add(placa);
  }
  for (const placa of extraerPlacasDeTexto(String(item.name ?? ""))) {
    claves.add(placa);
  }
  return [...claves];
}

function leerBloqueo(item: GpsDeviceItem): boolean {
  const sensor = item.sensors?.find(
    (s) => s.tag_name === "blocked" || s.name === "Bloqueo",
  );
  if (!sensor) return false;
  if (typeof sensor.val === "boolean") return sensor.val;
  return String(sensor.value ?? "").trim().toLowerCase() === "on";
}

function prioridadConexion(online: string): number {
  switch (online.toLowerCase()) {
    case "online":
      return 3;
    case "ack":
      return 2;
    case "offline":
      return 1;
    default:
      return 0;
  }
}

function preferirDispositivo(
  actual: UbicacionGpsMoto,
  candidato: UbicacionGpsMoto,
): UbicacionGpsMoto {
  const diff =
    prioridadConexion(candidato.online) - prioridadConexion(actual.online);
  if (diff !== 0) return diff > 0 ? candidato : actual;
  return candidato.time >= actual.time ? candidato : actual;
}

function mapearDispositivo(item: GpsDeviceItem): UbicacionGpsMoto | null {
  const deviceId = Number(item.id);
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(deviceId) || deviceId <= 0) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  return {
    proveedor: "system_track",
    deviceId,
    imei: "",
    lat,
    lng,
    speed: Number(item.speed) || 0,
    course: Number(item.course) || 0,
    time: String(item.time ?? "").trim() || "—",
    online: String(item.online ?? "").trim() || "offline",
    coords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    bloqueado: leerBloqueo(item),
    nombreDispositivo: String(item.name ?? "").trim() || "—",
  };
}

function invalidarCachesDispositivos(): void {
  cacheDispositivos = null;
}

function hydrateFromDisk(): void {
  if (diskHydrated) return;
  diskHydrated = true;
  if (cacheDispositivos) return;
  try {
    const raw = readFileSync(DISK_CACHE_PATH, "utf8");
    const data = JSON.parse(raw) as DiskCache;
    if (!data?.byId || !data?.plates) return;

    const porDeviceId = new Map<number, UbicacionGpsMoto>();
    const porPlaca = new Map<string, UbicacionGpsMoto>();
    for (const [id, gps] of Object.entries(data.byId)) {
      const deviceId = Number(id);
      if (!Number.isFinite(deviceId) || !gps) continue;
      porDeviceId.set(deviceId, { ...gps, proveedor: "system_track" });
    }
    for (const [placa, id] of Object.entries(data.plates)) {
      const gps = porDeviceId.get(Number(id));
      if (gps) porPlaca.set(placa, gps);
    }
    if (porDeviceId.size === 0) return;
    cacheDispositivos = {
      fetchedAt: Number(data.fetchedAt) || 0,
      fullFetchedAt: Number(data.fullFetchedAt) || Number(data.fetchedAt) || 0,
      porPlaca,
      porDeviceId,
    };
  } catch {
    /* sin caché en disco */
  }
}

function persistToDisk(): void {
  if (!cacheDispositivos) return;
  const byId: Record<string, UbicacionGpsMoto> = {};
  const plates: Record<string, number> = {};
  for (const [id, gps] of cacheDispositivos.porDeviceId) {
    byId[String(id)] = gps;
  }
  for (const [placa, gps] of cacheDispositivos.porPlaca) {
    plates[placa] = gps.deviceId;
  }
  const payload: DiskCache = {
    fetchedAt: cacheDispositivos.fetchedAt,
    fullFetchedAt: cacheDispositivos.fullFetchedAt,
    byId,
    plates,
  };
  try {
    writeFileSync(DISK_CACHE_PATH, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function asegurarIndiceVacio(): IndiceGps {
  if (!cacheDispositivos) {
    cacheDispositivos = {
      fetchedAt: 0,
      fullFetchedAt: 0,
      porPlaca: new Map(),
      porDeviceId: new Map(),
    };
  }
  return cacheDispositivos;
}

function fusionarGrupos(data: GpsDeviceGroup[], esFull: boolean): void {
  const indice = asegurarIndiceVacio();
  const ahora = Date.now();

  for (const grupo of data) {
    for (const item of grupo.items ?? []) {
      const dispositivo = mapearDispositivo(item);
      if (!dispositivo) continue;

      const prevId = indice.porDeviceId.get(dispositivo.deviceId);
      indice.porDeviceId.set(
        dispositivo.deviceId,
        prevId ? preferirDispositivo(prevId, dispositivo) : dispositivo,
      );

      for (const clave of clavesPlacaDispositivo(item)) {
        const existente = indice.porPlaca.get(clave);
        const elegido = existente
          ? preferirDispositivo(existente, dispositivo)
          : dispositivo;
        indice.porPlaca.set(clave, elegido);
      }
    }
  }

  indice.fetchedAt = ahora;
  if (esFull) indice.fullFetchedAt = ahora;
  persistToDisk();
}

async function obtenerUserApiHash(force = false): Promise<string> {
  const ahora = Date.now();
  if (!force && cacheAuth && ahora - cacheAuth.fetchedAt < AUTH_TTL_MS) {
    return cacheAuth.hash;
  }

  try {
    const res = await fetch(`${SYSTEMTRACK_BASE_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: SYSTEMTRACK_EMAIL,
        password: SYSTEMTRACK_PASSWORD,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = (await res.json()) as LoginResponse;
      const hash = String(data.user_api_hash ?? "").trim();
      if (data.status === 1 && hash) {
        cacheAuth = { hash, fetchedAt: ahora };
        return hash;
      }
    }
  } catch (e) {
    console.warn(
      "[systemTrackGps] login:",
      e instanceof Error ? e.message : e,
    );
  }

  return SYSTEMTRACK_USER_API_HASH_FALLBACK;
}

async function fetchDispositivos(apiHash: string): Promise<GpsDeviceGroup[]> {
  const url = new URL(`${SYSTEMTRACK_BASE_URL}/api/get_devices`);
  url.searchParams.set("lang", "en");
  url.searchParams.set("user_api_hash", apiHash);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`System Track respondió ${res.status}`);
  }

  const data = (await res.json()) as GpsDeviceGroup[];
  if (!Array.isArray(data)) {
    throw new Error("Respuesta inválida de System Track");
  }
  return data;
}

/** Posiciones recientes: ~1s / 250KB vs get_devices ~10s / 7MB. */
async function fetchDispositivosLatest(
  apiHash: string,
): Promise<GpsDeviceGroup[] | null> {
  const url = new URL(`${SYSTEMTRACK_BASE_URL}/api/get_devices_latest`);
  url.searchParams.set("user_api_hash", apiHash);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as GpsDeviceGroup[];
  if (!Array.isArray(data)) return null;
  const total = data.reduce((n, g) => n + (g.items?.length ?? 0), 0);
  return total > 0 ? data : null;
}

async function refrescarLatest(): Promise<void> {
  if (latestEnCurso) return latestEnCurso;
  latestEnCurso = (async () => {
    const apiHash = await obtenerUserApiHash();
    const data = await fetchDispositivosLatest(apiHash);
    if (data) fusionarGrupos(data, false);
  })()
    .catch((e) => {
      console.warn(
        "[systemTrackGps] latest:",
        e instanceof Error ? e.message : e,
      );
    })
    .finally(() => {
      latestEnCurso = null;
    });
  return latestEnCurso;
}

async function refrescarFull(force = false): Promise<void> {
  hydrateFromDisk();
  const ahora = Date.now();
  if (
    !force &&
    cacheDispositivos &&
    ahora - cacheDispositivos.fullFetchedAt < FULL_REFRESH_MIN_MS
  ) {
    return;
  }
  if (fullEnCurso) return fullEnCurso;
  fullEnCurso = (async () => {
    let apiHash = await obtenerUserApiHash();
    let data = await fetchDispositivos(apiHash);
    const total = data.reduce((n, g) => n + (g.items?.length ?? 0), 0);
    if (total <= 10) {
      apiHash = await obtenerUserApiHash(true);
      data = await fetchDispositivos(apiHash);
    }
    fusionarGrupos(data, true);
  })()
    .catch((e) => {
      console.warn(
        "[systemTrackGps] full:",
        e instanceof Error ? e.message : e,
      );
    })
    .finally(() => {
      fullEnCurso = null;
    });
  return fullEnCurso;
}

function peekPorPlaca(placa: string): UbicacionGpsMoto | null {
  const exacta = normalizarPlaca(placa);
  if (!exacta || !cacheDispositivos) return null;
  const hit = cacheDispositivos.porPlaca.get(exacta);
  if (hit) return hit;
  for (const clave of variantesPlaca(placa)) {
    if (clave === exacta) continue;
    const dispositivo = cacheDispositivos.porPlaca.get(clave);
    if (dispositivo) return dispositivo;
  }
  return null;
}

function peekPorId(deviceId: number): UbicacionGpsMoto | null {
  if (!Number.isFinite(deviceId) || deviceId <= 0 || !cacheDispositivos) {
    return null;
  }
  return cacheDispositivos.porDeviceId.get(deviceId) ?? null;
}

function edadCacheMs(): number {
  if (!cacheDispositivos?.fetchedAt) return Number.POSITIVE_INFINITY;
  return Date.now() - cacheDispositivos.fetchedAt;
}

/**
 * Arranca la caché en caliente (disco + latest) sin bloquear la UI.
 * Llamar al boot del server y al entrar al endpoint GPS.
 */
export function precalentarSystemTrack(): void {
  if (!systemTrackConfigurado()) return;
  hydrateFromDisk();
  void refrescarLatest();
  if (!cacheDispositivos || cacheDispositivos.porDeviceId.size < 50) {
    void refrescarFull(true);
  }
}

export type ResultadoBusquedaGps =
  | { ok: true; gps: UbicacionGpsMoto }
  | { ok: false; motivo: "sin_dispositivo" | "error_proveedor" };

export async function mapaDispositivosPorPlaca(): Promise<
  Map<string, UbicacionGpsMoto>
> {
  hydrateFromDisk();
  if (!cacheDispositivos || edadCacheMs() > CACHE_STALE_MAX_MS) {
    await refrescarLatest();
    if (!cacheDispositivos || cacheDispositivos.porPlaca.size < 20) {
      await refrescarFull(true);
    }
  } else if (edadCacheMs() > CACHE_FRESH_MS) {
    void refrescarLatest();
  }
  return cacheDispositivos?.porPlaca ?? new Map();
}

async function buscarConCache(
  placa: string,
  deviceId?: number,
): Promise<ResultadoBusquedaGps> {
  hydrateFromDisk();

  const hitInicial =
    (deviceId ? peekPorId(deviceId) : null) ?? peekPorPlaca(placa);
  const age = edadCacheMs();

  if (hitInicial && age <= CACHE_STALE_MAX_MS) {
    if (age > CACHE_FRESH_MS) void refrescarLatest();
    return { ok: true, gps: hitInicial };
  }

  // Sin hit usable: latest (~1s) antes que el catálogo completo (~10s).
  await refrescarLatest();
  const hitLatest =
    (deviceId ? peekPorId(deviceId) : null) ?? peekPorPlaca(placa);
  if (hitLatest) return { ok: true, gps: hitLatest };

  await refrescarFull(true);
  const hitFull =
    (deviceId ? peekPorId(deviceId) : null) ?? peekPorPlaca(placa);
  if (hitFull) return { ok: true, gps: hitFull };

  return { ok: false, motivo: "sin_dispositivo" };
}

export async function buscarUbicacionGps(
  placa: string,
): Promise<ResultadoBusquedaGps> {
  if (!systemTrackConfigurado()) return { ok: false, motivo: "sin_dispositivo" };
  try {
    return await buscarConCache(placa);
  } catch (e) {
    console.warn("[systemTrackGps]", e instanceof Error ? e.message : e);
    invalidarCachesDispositivos();
    cacheAuth = null;
    return { ok: false, motivo: "error_proveedor" };
  }
}

/** Actualización frecuente para mapa en vivo. */
export async function buscarUbicacionGpsEnVivo(
  placa: string,
  deviceId?: number,
): Promise<ResultadoBusquedaGps> {
  if (!systemTrackConfigurado()) return { ok: false, motivo: "sin_dispositivo" };
  try {
    return await buscarConCache(placa, deviceId);
  } catch (e) {
    console.warn(
      "[systemTrackGps] en vivo:",
      e instanceof Error ? e.message : e,
    );
    return { ok: false, motivo: "error_proveedor" };
  }
}

export type ResultadoComandoMotor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

export async function enviarComandoMotor(
  placa: string,
  accion: AccionMotorGps,
): Promise<ResultadoComandoMotor> {
  try {
    const resultado = await buscarConCache(placa);
    if (!resultado.ok) {
      return {
        ok: false,
        error: "No se encontró el dispositivo GPS de esa placa.",
      };
    }

    const type = accion === "bloquear" ? "engineStop" : "engineResume";
    const apiHash = await obtenerUserApiHash();

    const res = await fetch(`${SYSTEMTRACK_BASE_URL}/api/send_gprs_command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        user_api_hash: apiHash,
        device_id: resultado.gps.deviceId,
        type,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await res.json()) as SendCommandResponse;
    if (data.status === 1) {
      void refrescarLatest();
      return {
        ok: true,
        mensaje:
          data.message?.trim() ||
          (accion === "bloquear"
            ? "Comando de apagado enviado al GPS."
            : "Comando de encendido enviado al GPS."),
      };
    }

    return {
      ok: false,
      error:
        data.error?.trim() ||
        data.message?.trim() ||
        "System Track no pudo enviar el comando.",
    };
  } catch (e) {
    console.warn(
      "[systemTrackGps] comando:",
      e instanceof Error ? e.message : e,
    );
    return {
      ok: false,
      error: "No se pudo contactar System Track. Intenta de nuevo.",
    };
  }
}

export function mensajeGpsNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
): string {
  const placaNorm = normalizarPlaca(placa);
  if (motivo === "error_proveedor") {
    return "No se pudo consultar System Track en este momento. Intenta de nuevo en unos segundos.";
  }
  return `La placa ${placaNorm} no aparece en System Track con esta cuenta GPS.`;
}

export function enlaceMapaEmbebido(gps: UbicacionGpsMoto): string {
  const delta = 0.012;
  const bbox = [
    gps.lng - delta,
    gps.lat - delta,
    gps.lng + delta,
    gps.lat + delta,
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${gps.lat}%2C${gps.lng}`;
}

// Precalienta al cargar el módulo del server (dev/prod node).
if (systemTrackConfigurado()) {
  precalentarSystemTrack();
}
