import { describe, expect, it } from "vitest";
import type { AccountsStore } from "@/lib/accounts/types";

/** One behavioural contract for every accounts store (memory and Postgres). */
export function runAccountsContract(name: string, makeStore: () => Promise<AccountsStore>) {
  const user = () => ({ id: crypto.randomUUID(), email: `founder+${crypto.randomUUID().slice(0, 8)}@acme.example` });

  describe(`${name} accounts store`, () => {
    it("gives a new user their own company on first sign-in, and the same one afterwards", async () => {
      const store = await makeStore();
      const u = user();
      expect(await store.companyFor(u.id)).toBeNull();
      const first = await store.ensureCompanyFor(u);
      expect(first.scope).toMatch(/^org_[0-9a-f-]{36}$/);
      expect(await store.ensureCompanyFor(u)).toEqual(first);
      expect(await store.companyFor(u.id)).toEqual(first);
    });

    it("never puts two users in the same company", async () => {
      const store = await makeStore();
      const a = await store.ensureCompanyFor(user());
      const b = await store.ensureCompanyFor(user());
      expect(a.orgId).not.toBe(b.orgId);
      expect(a.scope).not.toBe(b.scope);
    });

    it("creates exactly one company when first requests race", async () => {
      const store = await makeStore();
      const u = user();
      const all = await Promise.all(Array.from({ length: 6 }, () => store.ensureCompanyFor(u)));
      expect(new Set(all.map((c) => c.orgId)).size).toBe(1);
    });

    it("lets the owner rename their company, and only theirs", async () => {
      const store = await makeStore();
      const a = user();
      const b = user();
      await store.ensureCompanyFor(a);
      const before = await store.ensureCompanyFor(b);
      await store.renameCompany(a.id, "Acme Robotics");
      expect((await store.companyFor(a.id))!.name).toBe("Acme Robotics");
      expect((await store.companyFor(b.id))!.name).toBe(before.name);
    });
  });
}
