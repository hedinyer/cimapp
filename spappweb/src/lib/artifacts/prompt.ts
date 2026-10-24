import type { ArtifactMeta } from "@/lib/artifacts/catalog";

export type ArtifactPromptView = {
  id: string;
  title: string;
  version: number;
  state: unknown;
  snapshot?: string;
  actions: {
    name: string;
    description: string;
    destructive?: boolean;
    parameters?: Record<string, unknown>;
  }[];
};

function clip(value: unknown, max: number): string {
  const raw = JSON.stringify(value) ?? "";
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

export function buildArtifactPrompt(
  catalog: ArtifactMeta[],
  open: ArtifactPromptView[],
): string {
  const screens = catalog
    .map((item) => `- ${item.id} (${item.group} / ${item.title}): ${item.description}`)
    .join("\n");
  const live = open.length
    ? open
        .map((item) => {
          const actions = item.actions
            .map((action) =>
              action.destructive ? `${action.name} (destructiva)` : action.name,
            )
            .join(", ");
          return [
            `## ${item.id} v${item.version}`,
            `Acciones: ${actions || "ninguna todavía"}`,
            `Estado: ${clip(item.state, 8000)}`,
            item.snapshot ? `Pantalla:\n${item.snapshot.slice(0, 3000)}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n")
    : "No hay pantallas abiertas.";

  return [
    "Estado de las pantallas abiertas. Es la verdad de este turno. Úsalo antes de decir que no sabes.",
    live,
    "Puedes operar esas pantallas solo con el chat.",
    "Cuando actúes, termina el mensaje con un único JSON y nada después.",
    'Ejemplo: {"ui":"act","op":"open_artifact","args":{"id":"inventario"}}',
    "ops: open_artifact, close_artifact, ui_action, ui_click, ui_fill, ui_select, ui_scroll.",
    'ui_action: {"ui":"act","op":"ui_action","args":{"artifact":"caja","action":"abrir","args":{"montoApertura":200000}}}',
    'ui_fill: {"ui":"act","op":"ui_fill","args":{"artifact":"garaje","ref":"3","value":"ABC12"}}',
    "Varios pasos van en steps: {\"ui\":\"act\",\"steps\":[{\"op\":\"open_artifact\",\"args\":{\"id\":\"caja\"}}]}.",
    "Si la persona quiere ver otra pestaña y la pantalla tiene filtro, manda ese act una sola vez. Aprobado es aceptada.",
    "Responde en una frase. No escribas un plan ni lo repitas.",
    '{"ui":"act","op":"ui_action","args":{"artifact":"creditos","action":"filtro","args":{"estado":"aceptada"}}}',
    "Si la pregunta trae un nombre, una cédula, una placa o un producto y la pantalla tiene buscar, manda ese act una sola vez.",
    '{"ui":"act","op":"ui_action","args":{"artifact":"creditos","action":"buscar","args":{"texto":"ana"}}}',
    "No repitas un act ya hecho. Cuando la pantalla quedó como pidió, responde en texto y no mandes otro JSON.",
    "Cuando respondas, una lista corta con el nombre y el dato pedido. No pegues el JSON de Estado ni el árbol de botones.",
    "Si te falta un id o un precio, abre la pantalla y espera el resultado. No inventes ids.",
    "Una acción destructiva no corre hasta que la persona escriba sí.",
    "El ref sale del árbol de la pantalla abierta. No actúes fuera de ese árbol.",
    "Pantallas:",
    screens,
  ].join("\n");
}
