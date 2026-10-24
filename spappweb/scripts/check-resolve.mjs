import { register } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.CHECK_RESOLVE) {
  process.env.CHECK_RESOLVE = "1";
  register(pathToFileURL(path.join(root, "scripts/check-resolve.mjs")).href, {
    parentURL: pathToFileURL(path.join(root, "scripts/check-all.mjs")).href,
  });
}

function fileFor(specifier) {
  let abs = null;
  if (specifier.startsWith("@/")) {
    abs = path.join(root, "src", specifier.slice(2));
  }
  if (!abs) return null;
  if (!path.extname(abs)) {
    if (existsSync(`${abs}.ts`)) abs = `${abs}.ts`;
    else if (existsSync(path.join(abs, "index.ts"))) abs = path.join(abs, "index.ts");
  }
  return pathToFileURL(abs).href;
}

export async function resolve(specifier, context, nextResolve) {
  const mapped = fileFor(specifier);
  if (mapped) return nextResolve(mapped, context);
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
