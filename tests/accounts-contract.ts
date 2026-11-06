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

    it("finds a company's name by its scope, for work done outside a request", async () => {
      const store = await makeStore();
      const c = await store.ensureCompanyFor(user());
      expect(await store.nameForScope(c.scope)).toBe(c.name);
      expect(await store.nameForScope(`org_${crypto.randomUUID()}`)).toBeNull();
    });

    it("creates no company when new ones aren't allowed, but still lets an invited teammate join", async () => {
      const store = await makeStore();
      const stranger = user();
      await expect(store.ensureCompanyFor(stranger, { allowNew: false })).rejects.toMatchObject({ name: "NotInvited" });
      expect(await store.companyFor(stranger.id)).toBeNull();
      const owner = user();
      const company = await store.ensureCompanyFor(owner);
      await store.invite(owner.id, stranger.email);
      expect((await store.ensureCompanyFor(stranger, { allowNew: false })).orgId).toBe(company.orgId);
    });

    it("says the first user of a company owns it", async () => {
      const store = await makeStore();
      const u = user();
      expect((await store.ensureCompanyFor(u)).role).toBe("owner");
    });

    it("deletes an owner's company, leaves others alone, and starts fresh on the next sign-in", async () => {
      const store = await makeStore();
      const a = user();
      const b = user();
      const first = await store.ensureCompanyFor(a);
      const other = await store.ensureCompanyFor(b);
      expect(await store.deleteCompany(a.id)).toBe(true);
      expect(await store.companyFor(a.id)).toBeNull();
      expect(await store.companyFor(b.id)).toEqual(other);
      const fresh = await store.ensureCompanyFor(a);
      expect(fresh.orgId).not.toBe(first.orgId);
      expect(fresh.scope).not.toBe(first.scope);
      expect(await store.deleteCompany(crypto.randomUUID())).toBe(false);
    });

    describe("teams", () => {
      it("lets the owner invite a teammate, who joins as a member when they first sign in", async () => {
        const store = await makeStore();
        const owner = user();
        const company = await store.ensureCompanyFor(owner);
        const mate = { id: crypto.randomUUID(), email: `Mate+${crypto.randomUUID().slice(0, 6)}@Acme.example` };
        expect(await store.hasCompanyInvite(mate.email)).toBe(false);
        expect(await store.invite(owner.id, mate.email)).toBe("invited");
        expect(await store.invite(owner.id, mate.email.toLowerCase())).toBe("exists");
        expect(await store.hasCompanyInvite(mate.email)).toBe(true);
        const joined = await store.ensureCompanyFor(mate);
        expect(joined).toEqual({ ...company, role: "member" });
        expect(await store.hasCompanyInvite(mate.email)).toBe(false);
        const team = await store.team(owner.id);
        expect(team!.invites).toEqual([]);
        expect(team!.members.map((m) => [m.email, m.role])).toEqual([
          [owner.email, "owner"],
          [mate.email.toLowerCase(), "member"],
        ]);
        expect(await store.invite(owner.id, mate.email)).toBe("member");
      });

      it("lets only the owner manage the team", async () => {
        const store = await makeStore();
        const owner = user();
        await store.ensureCompanyFor(owner);
        const mate = user();
        await store.invite(owner.id, mate.email);
        await store.ensureCompanyFor(mate);
        expect(await store.invite(mate.id, "someone@acme.example")).toBe("not_owner");
        expect(await store.removeMember(mate.id, owner.id)).toBe(false);
        expect(await store.deleteCompany(mate.id)).toBe(false);
        await store.renameCompany(mate.id, "Hijacked");
        expect((await store.companyFor(owner.id))!.name).not.toBe("Hijacked");
      });

      it("removes a member, revokes an invite, and never removes the owner", async () => {
        const store = await makeStore();
        const owner = user();
        await store.ensureCompanyFor(owner);
        const mate = user();
        await store.invite(owner.id, mate.email);
        await store.ensureCompanyFor(mate);
        expect(await store.removeMember(owner.id, owner.id)).toBe(false);
        expect(await store.removeMember(owner.id, mate.id)).toBe(true);
        expect(await store.companyFor(mate.id)).toBeNull();
        await store.invite(owner.id, "later@acme.example");
        expect(await store.revokeInvite(owner.id, "LATER@acme.example")).toBe(true);
        expect(await store.hasCompanyInvite("later@acme.example")).toBe(false);
      });

      it("caps a team at ten people, counting pending invites", async () => {
        const store = await makeStore();
        const owner = user();
        await store.ensureCompanyFor(owner);
        for (let i = 0; i < 9; i++) expect(await store.invite(owner.id, `p${i}@acme.example`)).toBe("invited");
        expect(await store.invite(owner.id, "tenth@acme.example")).toBe("limit");
      });

      it("keeps someone who already has a company in it; an invite doesn't move them", async () => {
        const store = await makeStore();
        const owner = user();
        const company = await store.ensureCompanyFor(owner);
        const other = user();
        const own = await store.ensureCompanyFor(other);
        await store.invite(owner.id, other.email);
        expect(await store.ensureCompanyFor(other)).toEqual(own);
        expect(own.orgId).not.toBe(company.orgId);
      });

      it("lets someone who already has an empty company of their own accept an invite instead", async () => {
        const store = await makeStore();
        const owner = user();
        const team = await store.ensureCompanyFor(owner);
        await store.renameCompany(owner.id, "Acme Robotics");
        const cofounder = user();
        const own = await store.ensureCompanyFor(cofounder);
        await store.invite(owner.id, cofounder.email);
        expect(await store.invitesFor(cofounder.email)).toEqual([{ orgId: team.orgId, companyName: "Acme Robotics" }]);
        expect(await store.acceptInvite(cofounder, team.orgId)).toBe("joined");
        expect(await store.companyFor(cofounder.id)).toEqual({ ...team, name: "Acme Robotics", role: "member" });
        expect(await store.nameForScope(own.scope)).toBeNull();
        expect(await store.invitesFor(cofounder.email)).toEqual([]);
        expect(await store.acceptInvite(cofounder, team.orgId)).toBe("no_invite");
      });

      it("won't let an owner with teammates walk away from their team by accepting an invite", async () => {
        const store = await makeStore();
        const a = user();
        const teamA = await store.ensureCompanyFor(a);
        const b = user();
        await store.ensureCompanyFor(b);
        const bMate = user();
        await store.invite(b.id, bMate.email);
        await store.ensureCompanyFor(bMate);
        await store.invite(a.id, b.email);
        expect(await store.acceptInvite(b, teamA.orgId)).toBe("has_team");
        expect((await store.companyFor(b.id))!.role).toBe("owner");
      });

      it("lets a member leave, but never the owner", async () => {
        const store = await makeStore();
        const owner = user();
        await store.ensureCompanyFor(owner);
        const mate = user();
        await store.invite(owner.id, mate.email);
        await store.ensureCompanyFor(mate);
        expect(await store.leaveCompany(owner.id)).toBe(false);
        expect(await store.leaveCompany(mate.id)).toBe(true);
        expect(await store.companyFor(mate.id)).toBeNull();
        expect((await store.team(owner.id))!.members).toHaveLength(1);
      });

      it("hands ownership to a member, who can then manage the company; the old owner becomes a member", async () => {
        const store = await makeStore();
        const owner = user();
        const company = await store.ensureCompanyFor(owner);
        const mate = user();
        await store.invite(owner.id, mate.email);
        await store.ensureCompanyFor(mate);
        const stranger = user();
        await store.ensureCompanyFor(stranger);
        expect(await store.transferOwnership(owner.id, stranger.id)).toBe(false);
        expect(await store.transferOwnership(mate.id, owner.id)).toBe(false);
        expect(await store.transferOwnership(owner.id, mate.id)).toBe(true);
        expect(await store.companyFor(mate.id)).toEqual({ ...company, role: "owner" });
        expect((await store.companyFor(owner.id))!.role).toBe("member");
        expect(await store.leaveCompany(owner.id)).toBe(true);
      });

      it("drops pending invites with the company", async () => {
        const store = await makeStore();
        const owner = user();
        await store.ensureCompanyFor(owner);
        const email = `gone+${crypto.randomUUID().slice(0, 6)}@acme.example`;
        await store.invite(owner.id, email);
        await store.deleteCompany(owner.id);
        expect(await store.hasCompanyInvite(email)).toBe(false);
      });
    });
  });
}
