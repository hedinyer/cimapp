import { gunzipSync } from "node:zlib";

// ponytail: stdlib gzip on the chat POST. Brotli when a client actually sends it.
export function decodeChatBody(
  bytes: Uint8Array,
  encoding: string | null,
): unknown {
  const raw = encoding === "gzip" ? gunzipSync(bytes) : Buffer.from(bytes);
  return JSON.parse(raw.toString("utf8"));
}
