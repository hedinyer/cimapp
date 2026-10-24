export type UsoTipo = "vista" | "clic" | "mensaje" | "accion";

export type UsoEvento = {
  tipo: UsoTipo;
  nombre: string;
  ruta: string;
  ok?: boolean;
  detalle?: Record<string, unknown>;
};

function slug(value: string): string {
  const clean = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return clean || "sin-nombre";
}

export function describirUso(username: string, evento: UsoEvento): {
  nodo: string;
  nodoTipo: string;
  nodoNombre: string;
  tipo: UsoTipo;
  ok: boolean | null;
  texto: string;
  detalle: Record<string, unknown>;
} {
  const ruta = evento.ruta.slice(0, 200) || "/";
  const nombre = evento.nombre.replace(/\s+/g, " ").trim().slice(0, 400);
  const quien = username || "alguien";
  if (evento.tipo === "vista") {
    return {
      nodo: `pantalla:${ruta}`,
      nodoTipo: "pantalla",
      nodoNombre: ruta,
      tipo: "vista",
      ok: null,
      texto: `${quien} abrió ${ruta}`,
      detalle: {},
    };
  }
  if (evento.tipo === "clic") {
    return {
      nodo: `clic:${slug(nombre)}`,
      nodoTipo: "clic",
      nodoNombre: nombre || "clic",
      tipo: "clic",
      ok: null,
      texto: `${quien} en ${ruta} pulsó «${nombre || "un control"}»`,
      detalle: {},
    };
  }
  if (evento.tipo === "mensaje") {
    return {
      nodo: `mensaje:${ruta}`,
      nodoTipo: "mensaje",
      nodoNombre: "mensaje",
      tipo: "mensaje",
      ok: null,
      texto: `${quien} escribió en ${ruta}: ${nombre}`,
      detalle: evento.detalle ?? {},
    };
  }
  const ok = evento.ok !== false;
  return {
    nodo: `accion:${slug(nombre)}`,
    nodoTipo: "accion",
    nodoNombre: nombre || "accion",
    tipo: "accion",
    ok,
    texto: ok
      ? `${quien} guardó ${nombre}`
      : `${quien} falló al guardar ${nombre}`,
    detalle: evento.detalle ?? {},
  };
}
