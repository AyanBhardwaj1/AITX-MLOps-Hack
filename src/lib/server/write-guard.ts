import "server-only";
import { assertSafeToServe } from "../access";
import type { DataMode } from "./data";
import { env } from "./env";

/** A real account's data may only be changed or shared where the app would show it (APP_PASSWORD set). */
export function canWriteRealData(mode: DataMode): boolean {
  if (mode === "demo") return true;
  try {
    const e = env();
    assertSafeToServe({ rhoBaseUrl: e.RHO_BASE_URL, appPassword: e.APP_PASSWORD });
    return true;
  } catch {
    return false;
  }
}
