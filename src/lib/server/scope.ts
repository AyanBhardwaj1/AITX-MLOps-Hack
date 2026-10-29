import "server-only";
import type { DataMode } from "./data";
import { env } from "./env";

/** Which stored "organization" a request belongs to: the demo company, the Rho sandbox, or a real Rho account. */
export function scopeFor(mode: DataMode): string {
  if (mode === "demo") return "demo";
  return env().RHO_BASE_URL.includes("sandbox") ? "rho_sandbox" : "rho";
}
