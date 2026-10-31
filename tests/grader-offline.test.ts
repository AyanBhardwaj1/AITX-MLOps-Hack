import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * C3 (sleep-research): the grader runs in the browser and must never send bank data anywhere.
 * Walks every module the grader imports and checks none can make a network call or reach server code.
 */
const ROOT = resolve(__dirname, "..");
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource|navigator\.sendBeacon/;
const ALLOWED_PACKAGES = new Set(["zod"]);

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? resolve(ROOT, "src", spec.slice(2)) : resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) if (existsSync(candidate)) return candidate;
  return null;
}

function walk(entry: string, seen = new Set<string>(), packages = new Set<string>()) {
  if (seen.has(entry)) return { seen, packages };
  seen.add(entry);
  const src = readFileSync(entry, "utf8");
  for (const m of src.matchAll(/^import\s+(?:type\s+)?[^"']*["']([^"']+)["']/gm)) {
    const spec = m[1]!;
    if (/^import\s+type\b/.test(m[0])) continue;
    if (spec.startsWith(".") || spec.startsWith("@/")) {
      const file = resolveImport(entry, spec);
      if (file) walk(file, seen, packages);
    } else packages.add(spec);
  }
  return { seen, packages };
}

describe("grader stays offline", () => {
  const { seen, packages } = walk(resolve(ROOT, "src/lib/grader.ts"));

  it("imports no module that can make a network call", () => {
    const offenders = [...seen].filter((f) => NETWORK.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    expect(seen.size).toBeGreaterThan(10);
  });

  it("pulls in no server code and no packages beyond zod", () => {
    expect([...seen].filter((f) => f.includes("/lib/server/"))).toEqual([]);
    expect([...packages].filter((p) => !ALLOWED_PACKAGES.has(p))).toEqual([]);
  });
});
