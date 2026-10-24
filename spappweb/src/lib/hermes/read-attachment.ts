import "server-only";

import { extractText } from "unpdf";
import * as XLSX from "xlsx";

export type ChatAttachmentInput = {
  name: string;
  mime?: string;
  data: string;
};

export type PreparedAttachments = {
  context: string;
  images: { url: string }[];
};

const MAX_FILES = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CHARS = 40_000;

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function safeName(name: string): string {
  return (name.split(/[/\\]/).pop() ?? "archivo")
    .replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, 120);
}

function clip(text: string): string {
  const clean = text.replace(/\u0000/g, "").trim();
  if (clean.length <= MAX_CHARS) return clean;
  return `${clean.slice(0, MAX_CHARS)}\n…(recorte)`;
}

function decode(data: string, name: string): Buffer {
  const cleaned = data.replace(/\s/g, "");
  if (!cleaned || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error(`${name} no se pudo leer.`);
  }
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length === 0) throw new Error(`${name} está vacío.`);
  if (bytes.length > MAX_BYTES) {
    throw new Error(`${name} supera los 8 MB.`);
  }
  return bytes;
}

function readSheet(name: string, bytes: Buffer): string {
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(bytes, { type: "buffer" });
  } catch {
    throw new Error(`${name} no es un Excel válido.`);
  }
  const parts = book.SheetNames.slice(0, 5).map((sheetName) => {
    const sheet = book.Sheets[sheetName];
    if (!sheet) return "";
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      sheet,
      { header: 1, raw: false, defval: "", blankrows: false },
    );
    const lines = rows.slice(0, 200).map((row) =>
      (Array.isArray(row) ? row : [])
        .slice(0, 30)
        .map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim())
        .join("\t"),
    );
    return `Hoja: ${sheetName}\n${lines.join("\n")}`.trim();
  });
  const body = parts.filter(Boolean).join("\n\n");
  return `Archivo adjunto: ${name} (Excel)\n${body || "La hoja no tiene celdas."}`;
}

async function readPdf(name: string, bytes: Buffer): Promise<string> {
  try {
    const { text, totalPages } = await extractText(new Uint8Array(bytes), {
      mergePages: true,
    });
    const body = text.trim();
    return `Archivo adjunto: ${name} (PDF, ${totalPages} páginas)\n${
      body || "El PDF no tiene texto que se pueda extraer."
    }`;
  } catch {
    throw new Error(`${name} no es un PDF válido.`);
  }
}

export async function prepareAttachments(
  files: ChatAttachmentInput[],
): Promise<PreparedAttachments> {
  if (files.length > MAX_FILES) {
    throw new Error("Puedes adjuntar hasta 4 archivos.");
  }

  const blocks: string[] = [];
  const images: { url: string }[] = [];

  for (const file of files) {
    const name = safeName(file.name);
    const ext = extensionOf(name);
    const bytes = decode(file.data, name);

    const imageMime = IMAGE_MIME[ext];
    if (imageMime) {
      images.push({
        url: `data:${imageMime};base64,${bytes.toString("base64")}`,
      });
      blocks.push(`Archivo adjunto: ${name} (imagen)`);
      continue;
    }
    if (ext === "pdf") {
      blocks.push(await readPdf(name, bytes));
      continue;
    }
    if (ext === "xls" || ext === "xlsx") {
      blocks.push(readSheet(name, bytes));
      continue;
    }
    if (ext === "csv" || ext === "txt" || ext === "md" || ext === "json") {
      blocks.push(
        `Archivo adjunto: ${name}\n${bytes.toString("utf8").replace(/\u0000/g, "")}`,
      );
      continue;
    }
    throw new Error(
      `${name} no es un tipo permitido. Usa PDF, Excel, CSV, texto o imagen.`,
    );
  }

  return { context: clip(blocks.join("\n\n")), images };
}
