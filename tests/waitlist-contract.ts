import { describe, expect, it } from "vitest";
import type { WaitlistStore } from "@/lib/waitlist/types";

/** One behavioural contract for every waitlist store (memory and Postgres). */
export function runWaitlistContract(name: string, makeStore: () => Promise<WaitlistStore>) {
  describe(`${name} waitlist store`, () => {
    it("adds a new email once and reports a repeat as already there", async () => {
      const store = await makeStore();
      const email = `founder+${crypto.randomUUID()}@example.com`;
      expect(await store.add({ email, role: "founder", bank: "rho", source: "hero" })).toBe("added");
      expect(await store.add({ email, role: "investor", bank: null, source: "footer" })).toBe("exists");
      expect(await store.has(email)).toBe(true);
    });

    it("keeps different emails apart", async () => {
      const store = await makeStore();
      const a = `a+${crypto.randomUUID()}@example.com`;
      const b = `b+${crypto.randomUUID()}@example.com`;
      await store.add({ email: a, role: null, bank: null, source: null });
      expect(await store.has(b)).toBe(false);
      expect(await store.add({ email: b, role: null, bank: null, source: null })).toBe("added");
    });

    it("marks an email as invited, and only that one", async () => {
      const store = await makeStore();
      const email = `invitee+${crypto.randomUUID()}@example.com`;
      await store.add({ email, role: "founder", bank: null, source: null });
      expect(await store.isInvited(email)).toBe(false);
      expect(await store.invite(email)).toBe(true);
      expect(await store.isInvited(email)).toBe(true);
      expect(await store.isInvited(`other+${crypto.randomUUID()}@example.com`)).toBe(false);
      expect(await store.invite(`never-signed-up+${crypto.randomUUID()}@example.com`)).toBe(false);
    });

    it("lists who is waiting, newest first, with who is already invited", async () => {
      const store = await makeStore();
      const tag = crypto.randomUUID();
      const first = `first+${tag}@example.com`;
      const second = `second+${tag}@example.com`;
      await store.add({ email: first, role: "founder", bank: "rho", source: "hero" });
      await new Promise((r) => setTimeout(r, 15));
      await store.add({ email: second, role: null, bank: null, source: null });
      await store.invite(first);
      const listed = (await store.list(500)).filter((e) => e.email.includes(tag));
      expect(listed.map((e) => [e.email, e.role, e.invited])).toEqual([
        [second, null, false],
        [first, "founder", true],
      ]);
      expect(Date.parse(listed[0]!.createdAt)).toBeGreaterThanOrEqual(Date.parse(listed[1]!.createdAt));
      expect(await store.list(1)).toHaveLength(1);
    });
  });
}
