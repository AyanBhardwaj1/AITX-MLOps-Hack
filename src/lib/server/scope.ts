import "server-only";
import type { DataMode } from "../modes";
import { currentCompany } from "./company";
import { accountsEnabled, env } from "./env";
import { ModeUnavailable, SignInRequired } from "./errors";

/**
 * Which stored organization a request belongs to: the demo company, the env-configured Rho feed
 * (single-company deployments only), or the signed-in user's own company, found from the verified
 * session and never from the request.
 */
export async function scopeFor(mode: DataMode): Promise<string> {
  if (mode === "demo") return "demo";
  if (mode === "company") {
    const company = await currentCompany();
    if (!company) throw new SignInRequired();
    return company.scope;
  }
  if (accountsEnabled()) throw new ModeUnavailable("With accounts on, companies connect by uploading bank exports.");
  return env().RHO_BASE_URL.includes("sandbox") ? "rho_sandbox" : "rho";
}
