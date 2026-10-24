import { isDestructiveLabel } from "@/lib/artifacts/protocol";

const INTERACTIVE = [
  "button",
  "a[href]",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[role='button']",
  "[role='tab']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='link']",
].join(",");

export type A11yNode = {
  ref: string;
  role: string;
  name: string;
  value?: string;
};

const MAX_NODES = 40;

function visible(element: HTMLElement): boolean {
  if (element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest("[hidden]")) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden";
}

function roleOf(element: HTMLElement): string {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  if (tag === "input") {
    const type = (element as HTMLInputElement).type;
    if (type === "checkbox") return "checkbox";
    if (type === "button" || type === "submit") return "button";
    return "textbox";
  }
  return "button";
}

function nameOf(element: HTMLElement): string {
  const labelled = element.getAttribute("aria-label")?.trim();
  if (labelled) return labelled;
  const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.placeholder || element.name || element.id;
  }
  return element.getAttribute("title")?.trim() || element.tagName.toLowerCase();
}

export function snapshotArtifact(root: HTMLElement): {
  text: string;
  nodes: A11yNode[];
} {
  const previous = root.querySelectorAll("[data-agent-ref]");
  previous.forEach((node) => node.removeAttribute("data-agent-ref"));
  const nodes: A11yNode[] = [];
  const elements = [...root.querySelectorAll<HTMLElement>(INTERACTIVE)];
  for (const element of elements) {
    if (!visible(element)) continue;
    if (nodes.length >= MAX_NODES) break;
    const ref = String(nodes.length + 1);
    element.setAttribute("data-agent-ref", ref);
    const node: A11yNode = {
      ref,
      role: roleOf(element),
      name: nameOf(element),
    };
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      node.value = element.value.slice(0, 80);
    }
    nodes.push(node);
  }
  const text = nodes
    .map((node) =>
      node.value
        ? `[${node.ref}] ${node.role} "${node.name}" = ${node.value}`
        : `[${node.ref}] ${node.role} "${node.name}"`,
    )
    .join("\n");
  return { text, nodes };
}

function byRef(root: HTMLElement, ref: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-agent-ref="${CSS.escape(ref)}"]`);
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function applyA11y(
  root: HTMLElement,
  op: "ui_click" | "ui_fill" | "ui_select" | "ui_scroll",
  args: Record<string, unknown>,
): { ok: true; detail: string } | { ok: false; error: string; needsConfirm?: boolean } {
  const ref = typeof args.ref === "string" ? args.ref : "";
  const element = ref ? byRef(root, ref) : null;
  if (!element) return { ok: false, error: `No existe el ref ${ref || "vacío"} en esta pantalla.` };
  const confirmed = args.confirmed === true;
  const label = nameOf(element);

  if (op === "ui_scroll") {
    element.scrollIntoView({ block: "nearest" });
    return { ok: true, detail: `Desplacé ${label}.` };
  }

  if (op === "ui_click") {
    if (isDestructiveLabel(label) && !confirmed) {
      return {
        ok: false,
        needsConfirm: true,
        error: `«${label}» borra o desactiva. Escribe sí para continuar.`,
      };
    }
    element.click();
    return { ok: true, detail: `Clic en ${label}.` };
  }

  const value = args.value == null ? "" : String(args.value);
  if (op === "ui_select") {
    if (!(element instanceof HTMLSelectElement)) {
      return { ok: false, error: `${label} no es una lista.` };
    }
    const option = [...element.options].find(
      (item) => item.value === value || item.label.toLowerCase() === value.toLowerCase(),
    );
    if (!option) return { ok: false, error: `${label} no tiene la opción ${value}.` };
    setNativeValue(element, option.value);
    return { ok: true, detail: `Elegí ${option.label}.` };
  }

  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    return { ok: false, error: `${label} no acepta texto.` };
  }
  setNativeValue(element, value);
  return { ok: true, detail: `Escribí en ${label}.` };
}
