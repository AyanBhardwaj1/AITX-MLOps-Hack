/** A signed-in user's company: their organization and the store scope its data lives under. */
export interface Company {
  orgId: string;
  /** Store scope (organizations.slug), "org_<uuid>". Server-generated, never from a request. */
  scope: string;
  name: string;
}

export interface AccountsStore {
  kind: "memory" | "postgres";
  companyFor(userId: string): Promise<Company | null>;
  /** The user's company, created with an owner membership on first use; atomic and idempotent. */
  ensureCompanyFor(user: { id: string; email: string | null }): Promise<Company>;
  renameCompany(userId: string, name: string): Promise<void>;
}

const PERSONAL_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com"]);
export const DEFAULT_COMPANY_NAME = "My company";

/** "maya@acme-robotics.com" → "Acme Robotics"; personal addresses get a neutral default. */
export function companyNameFromEmail(email: string | null): string {
  const domain = email?.split("@")[1]?.toLowerCase();
  if (!domain || PERSONAL_DOMAINS.has(domain)) return DEFAULT_COMPANY_NAME;
  const label = domain.split(".")[0] ?? "";
  const words = label.split(/[-_]+/).filter(Boolean);
  return words.length ? words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ").slice(0, 80) : DEFAULT_COMPANY_NAME;
}
