import { z } from "zod";

/**
 * Where the numbers come from: the fictional demo company, the env-configured Rho feed of a
 * single-company deployment, or the signed-in user's own company. Browser-safe.
 */
export const DATA_MODES = ["demo", "sandbox", "company"] as const;
export type DataMode = (typeof DATA_MODES)[number];

export const dataModeSchema = z.enum(DATA_MODES).default("demo");

export function parseMode(value: unknown): DataMode {
  return value === "sandbox" || value === "company" ? value : "demo";
}
