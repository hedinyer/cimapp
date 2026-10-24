import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type Unit = {
  referencia: string;
  modelo: string;
  color: string;
  chasis: string;
  motor: string;
};

const COLORS: Record<string, string> = {
  NEGRO: "Negro",
  BLANCO: "Blanco",
  AZUL: "Azul",
  GRIS: "Gris",
  ROSADO: "Rosado",
  AMARILLO: "Amarillo",
};

function modeloName(raw: string): string {
  return raw
    .replace(/^MOTO\s+/i, "")
    .replace(/\s+CC\b/gi, "")
    .replace(/\s+20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function colorName(raw: string): string {
  const key = raw.trim().toUpperCase();
  return COLORS[key] ?? raw.trim().replace(/\s+/g, " ");
}

/** Saca unidades de una factura de motos (referencia, color, chasis y motor). */
export function parseMotoFactura(text: string): Unit[] {
  const flat = text.replace(/\s+/g, " ");
  const blocks = flat.matchAll(
    /\[([A-Z0-9]+)\]\s+([^[(]{3,80}?)\s+\(([^)]+)\)\s+(.*?)(?=\[[A-Z0-9]{4,}\]|TOTAL NRO|OBSERVACIONES|$)/gi,
  );
  const units: Unit[] = [];
  for (const block of blocks) {
    const referencia = block[1]?.toUpperCase() ?? "";
    const modelo = modeloName(block[2] ?? "");
    const color = colorName(block[3] ?? "");
    const body = block[4] ?? "";
    if (!referencia || !modelo || !color) continue;
    const pairs = body.matchAll(
      /([A-HJ-NPR-Z0-9]{11,20})\s*\/\s*([A-Z0-9]+(?:\s+\d{5,})?)/gi,
    );
    for (const pair of pairs) {
      const chasis = (pair[1] ?? "").toUpperCase();
      const motor = (pair[2] ?? "").replace(/\s+/g, " ").trim().toUpperCase();
      if (chasis.length < 11 || motor.length < 6) continue;
      units.push({ referencia, modelo, color, chasis, motor });
    }
  }
  return units;
}

export function shouldImportMotoFactura(
  userText: string,
  fileText: string,
): boolean {
  if (parseMotoFactura(fileText).length === 0) return false;
  return /cat[aá]logo|garaje|referencia|vend|registr|carg|agreg|moto/i.test(
    userText,
  );
}

function miles(raw: string, mil: boolean): number {
  const n = Number(raw.replace(/\./g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return mil ? n * 1000 : n;
}

/** Cuotas dichas en el mensaje. Si no vienen, 800.000 inicial y 41.000 diaria. */
export function cuotasFromMessage(text: string): {
  inicial: number;
  diaria: number;
} {
  const inicialMatch = text.match(
    /inicial(?:\s+para\s+todas)?[^0-9]{0,30}(\d[\d.]*)\s*(mil)?/i,
  );
  const diariaMatch = text.match(
    /(?:cuota\s+)?diaria[^0-9]{0,30}(\d[\d.]*)\s*(mil)?/i,
  );
  const inicial = inicialMatch
    ? miles(inicialMatch[1] ?? "", Boolean(inicialMatch[2]))
    : 800_000;
  const diaria = diariaMatch
    ? miles(diariaMatch[1] ?? "", Boolean(diariaMatch[2]))
    : 41_000;
  return {
    inicial: inicial || 800_000,
    diaria: diaria || 41_000,
  };
}

export async function importMotoFactura(
  fileText: string,
  userText: string,
): Promise<string> {
  const units = parseMotoFactura(fileText);
  if (units.length === 0) {
    throw new Error("La factura no trae chasis de motos.");
  }
  const { inicial, diaria } = cuotasFromMessage(userText);
  const supabase = createAdminClient();

  const { data: parqueadero, error: parqueaderoError } = await supabase
    .from("garaje_parqueaderos")
    .select("id")
    .eq("slug", "parqueadero")
    .maybeSingle();
  if (parqueaderoError) throw new Error(parqueaderoError.message);

  const groups = new Map<string, { modelo: string; color: string; n: number }>();
  for (const unit of units) {
    const key = `${unit.modelo}|${unit.color}`;
    const current = groups.get(key);
    if (current) current.n += 1;
    else groups.set(key, { modelo: unit.modelo, color: unit.color, n: 1 });
  }

  for (const group of groups.values()) {
    const { data: existing, error: findError } = await supabase
      .from("bike_table")
      .select("id")
      .eq("modelo", group.modelo)
      .eq("color", group.color)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing?.id) {
      const { error } = await supabase
        .from("bike_table")
        .update({ cuota_inicial: inicial, cuota_diaria: diaria, activo: true })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("bike_table").insert({
        modelo: group.modelo,
        color: group.color,
        stock: group.n,
        cuota_inicial: inicial,
        cuota_diaria: diaria,
        monto_visita: 35000,
        activo: true,
        descripcion: `Carga de factura de motos. ${group.n} unidades.`,
      });
      if (error) throw new Error(error.message);
    }
  }

  const { data: already, error: alreadyError } = await supabase
    .from("garaje_motos")
    .select("notas")
    .ilike("notas", "%Chasis%");
  if (alreadyError) throw new Error(alreadyError.message);
  const known = (already ?? []).map((row) => String(row.notas ?? ""));
  const present = new Set(
    units
      .filter((unit) => known.some((notas) => notas.includes(unit.chasis)))
      .map((unit) => unit.chasis),
  );

  const fresh = units.filter((unit) => !present.has(unit.chasis));
  if (fresh.length > 0) {
    const { error } = await supabase.from("garaje_motos").insert(
      fresh.map((unit) => ({
        parqueadero_id: parqueadero?.id ?? null,
        referencia: unit.referencia,
        modelo: unit.modelo,
        color: unit.color,
        origen: "manual",
        condicion: "nueva",
        estado: "disponible",
        cuota_inicial: inicial,
        cuota_diaria: diaria,
        monto_visita: 35000,
        notas: `Factura. Chasis ${unit.chasis}. Motor ${unit.motor}.`,
      })),
    );
    if (error) throw new Error(error.message);
  }

  const lines = [...groups.values()]
    .map((group) => `${group.modelo} ${group.color}: ${group.n}`)
    .join("; ");
  return [
    "Datos del sitio: la factura ya quedó en Supabase.",
    `${units.length} motos físicas, ${fresh.length} nuevas en garaje, el resto ya estaba.`,
    `${groups.size} referencias de catálogo. Cuota inicial ${inicial} y cuota diaria ${diaria}.`,
    lines,
    "Resume esto en una o dos frases. No vuelvas a insertar estas filas ni pidas clave.",
  ].join(" ");
}
