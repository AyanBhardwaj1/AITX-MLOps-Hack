import { describe, expect, it, vi } from "vitest";
import { createMemoryWaitlist } from "@/lib/waitlist/memory";
import { handleSignup } from "@/lib/waitlist/signup";
import type { WaitlistStore } from "@/lib/waitlist/types";

describe("handleSignup", () => {
  it("stores a valid signup with the email trimmed and lowercased", async () => {
    const store = createMemoryWaitlist();
    const res = await handleSignup({ email: "  Maya@Example.COM ", role: "founder", bank: "mercury", source: "hero" }, store);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await store.has("maya@example.com")).toBe(true);
  });

  it("answers a repeat signup exactly like a new one, so the form can't be used to check who signed up", async () => {
    const store = createMemoryWaitlist();
    const first = await handleSignup({ email: "maya@example.com" }, store);
    const again = await handleSignup({ email: "maya@example.com" }, store);
    expect(again).toEqual(first);
  });

  it("rejects a missing or malformed email with a message a person can act on", async () => {
    const store = createMemoryWaitlist();
    for (const body of [null, {}, { email: "" }, { email: "not-an-email" }, { email: `${"a".repeat(250)}@example.com` }, "maya@example.com"]) {
      const res = await handleSignup(body, store);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Enter a valid work email." });
    }
  });

  it("rejects values outside the allowed lists instead of storing them", async () => {
    const store = createMemoryWaitlist();
    expect((await handleSignup({ email: "a@example.com", role: "ceo<script>" }, store)).status).toBe(400);
    expect((await handleSignup({ email: "a@example.com", bank: "x".repeat(50) }, store)).status).toBe(400);
    expect((await handleSignup({ email: "a@example.com", source: "Hero Section!" }, store)).status).toBe(400);
    expect(await store.has("a@example.com")).toBe(false);
  });

  it("pretends to accept a bot that fills the hidden field, and stores nothing", async () => {
    const store: WaitlistStore = { kind: "memory", add: vi.fn(), has: vi.fn() };
    const res = await handleSignup({ email: "bot@example.com", website: "https://spam.example" }, store);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(store.add).not.toHaveBeenCalled();
  });

  it("lets a storage failure surface instead of claiming success", async () => {
    const store: WaitlistStore = { kind: "postgres", add: vi.fn().mockRejectedValue(new Error("db down")), has: vi.fn() };
    await expect(handleSignup({ email: "a@example.com" }, store)).rejects.toThrow("db down");
  });
});
