import "server-only";
import { assertSafeToServe } from "../access";
import type { DataMode } from "./data";
import { env } from "./env";

/**
 * Stored changes to a connected data source (category fixes, share links) need APP_PASSWORD, even
 * on the Rho sandbox: without it every visitor shares the same saved state and could read or undo
 * each other's changes. The public demo keeps each visitor's changes to themselves instead.
 */
export function canWriteRealData(mode: DataMode): boolean {
  if (mode === "demo") return true;
  const e = env();
  if (!e.APP_PASSWORD) return false;
  try {
    assertSafeToServe({ rhoBaseUrl: e.RHO_BASE_URL, appPassword: e.APP_PASSWORD });
    return true;
  } catch {
    return false;
  }
}
