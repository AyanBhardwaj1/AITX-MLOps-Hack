/**
 * Reads a request body as text, giving up (null) once it passes `maxBytes`. Counts bytes as they
 * arrive, so a chunked body with no Content-Length can't make the server buffer without limit.
 */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Small JSON request bodies (settings, decisions, sign-in) never need more than this. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

/** A JSON request body read with a byte cap: null when it's too big, empty or not JSON. */
export async function readJsonCapped(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const text = await readBodyCapped(request, maxBytes).catch(() => null);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
