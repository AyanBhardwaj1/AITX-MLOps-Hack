import { describe, expect, it } from "vitest";
import { jsonWithStreamedArray, streamChunks } from "@/lib/http-stream";

const read = async (s: ReadableStream<Uint8Array>) => {
  const chunks: string[] = [];
  const reader = s.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(new TextDecoder().decode(r.value));
  return chunks;
};

describe("streamed downloads", () => {
  it("sends a long body in several chunks that add up to the whole", async () => {
    const lines = Array.from({ length: 5_000 }, (_, i) => `row ${i}\\r\\n`);
    const chunks = await read(streamChunks(lines, 1_000));
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.join("")).toBe(lines.join(""));
  });

  it("writes valid JSON with the big array streamed in place, wherever it sits", async () => {
    const out = [...jsonWithStreamedArray({ a: 1, rows: null, z: "__stream_rows__ is just text" }, "rows", [{ n: 1 }, { n: 2 }])].join("");
    expect(JSON.parse(out)).toEqual({ a: 1, rows: [{ n: 1 }, { n: 2 }], z: "__stream_rows__ is just text" });
    expect(JSON.parse([...jsonWithStreamedArray({ rows: null }, "rows", [])].join(""))).toEqual({ rows: [] });
  });
});
