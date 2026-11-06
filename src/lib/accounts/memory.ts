import { companyNameFromEmail, type AccountsStore, type Company } from "./types";

/** In-process accounts for local development and tests. */
export function createMemoryAccounts(): AccountsStore {
  const byUser = new Map<string, Company>();
  return {
    kind: "memory",
    async companyFor(userId) {
      const c = byUser.get(userId);
      return c ? { ...c } : null;
    },
    async ensureCompanyFor({ id, email }) {
      let c = byUser.get(id);
      if (!c) {
        const orgId = crypto.randomUUID();
        c = { orgId, scope: `org_${crypto.randomUUID()}`, name: companyNameFromEmail(email) };
        byUser.set(id, c);
      }
      return { ...c };
    },
    async renameCompany(userId, name) {
      const c = byUser.get(userId);
      if (c) c.name = name;
    },
  };
}
