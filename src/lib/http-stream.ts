/**
 * A response body sent in chunks as it's produced. Hosts cap a function's buffered response
 * (Vercel at 4.5 MB); a stream isn't buffered, so a company's full history can still download.
 */
export function streamChunks(parts: Iterable<string>, batchChars = 64_000): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = parts[Symbol.iterator]();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      let batch = "";
      for (let next = iterator.next(); !next.done; next = iterator.next()) {
        batch += next.value;
        if (batch.length >= batchChars) {
          controller.enqueue(encoder.encode(batch));
          return;
        }
      }
      if (batch) controller.enqueue(encoder.encode(batch));
      controller.close();
    },
  });
}

/** JSON for `head` with `array` streamed in place of its `key`, one element at a time (compact). */
export function* jsonWithStreamedArray(head: Record<string, unknown>, key: string, array: Iterable<unknown>): Generator<string> {
  // Unguessable, so no value elsewhere in `head` can contain it.
  const placeholder = `__stream_${key}_${crypto.randomUUID()}__`;
  const [before, after] = JSON.stringify({ ...head, [key]: placeholder }).split(JSON.stringify(placeholder)) as [string, string];
  yield `${before}[`;
  let first = true;
  for (const item of array) {
    yield `${first ? "" : ","}${JSON.stringify(item)}`;
    first = false;
  }
  yield `]${after}`;
}
