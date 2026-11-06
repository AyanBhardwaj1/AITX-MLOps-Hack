import { companyNameFromEmail, MAX_TEAM_SIZE, normalizeEmail, type AccountsStore, type Company, type CompanyRole } from "./types";

interface Org {
  orgId: string;
  scope: string;
  name: string;
}
interface Membership {
  orgId: string;
  userId: string;
  role: CompanyRole;
  email: string | null;
}
interface Invite {
  orgId: string;
  email: string;
  createdAt: string;
}

/** In-process accounts for local development and tests. Same rules as the Postgres store. */
export function createMemoryAccounts(): AccountsStore {
  const orgs = new Map<string, Org>();
  let memberships: Membership[] = [];
  let invites: Invite[] = [];

  /** Owner first, then the oldest membership, as in Postgres. */
  const membershipOf = (userId: string) => memberships.filter((m) => m.userId === userId).sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"))[0];
  const toCompany = (m: Membership): Company => ({ ...orgs.get(m.orgId)!, role: m.role });
  const ownedOrg = (userId: string) => {
    const m = membershipOf(userId);
    return m?.role === "owner" ? m.orgId : null;
  };

  return {
    kind: "memory",
    async companyFor(userId) {
      const m = membershipOf(userId);
      return m ? toCompany(m) : null;
    },
    async ensureCompanyFor({ id, email }) {
      const existing = membershipOf(id);
      if (existing) return toCompany(existing);
      const normalized = email ? normalizeEmail(email) : null;
      const invite = normalized ? invites.find((i) => i.email === normalized) : undefined;
      if (invite) {
        invites = invites.filter((i) => i !== invite);
        const m: Membership = { orgId: invite.orgId, userId: id, role: "member", email: normalized };
        memberships.push(m);
        return toCompany(m);
      }
      const orgId = crypto.randomUUID();
      orgs.set(orgId, { orgId, scope: `org_${crypto.randomUUID()}`, name: companyNameFromEmail(email) });
      const m: Membership = { orgId, userId: id, role: "owner", email: normalized };
      memberships.push(m);
      return toCompany(m);
    },
    async renameCompany(userId, name) {
      const orgId = ownedOrg(userId);
      if (orgId) orgs.get(orgId)!.name = name;
    },
    async nameForScope(scope) {
      for (const o of orgs.values()) if (o.scope === scope) return o.name;
      return null;
    },
    async deleteCompany(userId) {
      const orgId = ownedOrg(userId);
      if (!orgId) return false;
      orgs.delete(orgId);
      memberships = memberships.filter((m) => m.orgId !== orgId);
      invites = invites.filter((i) => i.orgId !== orgId);
      return true;
    },
    async invite(ownerId, email) {
      const orgId = ownedOrg(ownerId);
      if (!orgId) return "not_owner";
      const normalized = normalizeEmail(email);
      const team = memberships.filter((m) => m.orgId === orgId);
      const pending = invites.filter((i) => i.orgId === orgId);
      if (team.some((m) => m.email === normalized)) return "member";
      if (pending.some((i) => i.email === normalized)) return "exists";
      if (team.length + pending.length >= MAX_TEAM_SIZE) return "limit";
      invites.push({ orgId, email: normalized, createdAt: new Date().toISOString() });
      return "invited";
    },
    async team(userId) {
      const m = membershipOf(userId);
      if (!m) return null;
      const members = memberships
        .filter((x) => x.orgId === m.orgId)
        .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || (a.email ?? "").localeCompare(b.email ?? ""))
        .map((x) => ({ userId: x.userId, email: x.email, role: x.role }));
      return { members, invites: invites.filter((i) => i.orgId === m.orgId).map(({ email, createdAt }) => ({ email, createdAt })) };
    },
    async revokeInvite(ownerId, email) {
      const orgId = ownedOrg(ownerId);
      const normalized = normalizeEmail(email);
      const before = invites.length;
      invites = invites.filter((i) => !(i.orgId === orgId && i.email === normalized));
      return invites.length < before;
    },
    async removeMember(ownerId, memberUserId) {
      const orgId = ownedOrg(ownerId);
      if (!orgId) return false;
      const before = memberships.length;
      memberships = memberships.filter((m) => !(m.orgId === orgId && m.userId === memberUserId && m.role !== "owner"));
      return memberships.length < before;
    },
    async hasCompanyInvite(email) {
      const normalized = normalizeEmail(email);
      return invites.some((i) => i.email === normalized);
    },
  };
}
