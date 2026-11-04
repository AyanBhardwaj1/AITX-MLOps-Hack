import { describe, expect, it, vi } from "vitest";
import { submitSignup } from "@/lib/waitlist/client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("submitSignup", () => {
  it("posts only the signup fields as JSON to the waitlist endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ok: true }));
    const res = await submitSignup({ email: "maya@example.com", role: "founder", source: "grader" }, fetchImpl);
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/waitlist");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "maya@example.com", role: "founder", source: "grader" });
  });

  it("drops empty optional fields instead of sending blanks the server would reject", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { ok: true }));
    await submitSignup({ email: "a@example.com", bank: "", website: "", source: "landing" }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({ email: "a@example.com", source: "landing" });
  });

  it("passes the server's own message through on a refusal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(503, { error: "Signups are paused for a moment. Please try again later." }));
    expect(await submitSignup({ email: "a@example.com", source: "grader" }, fetchImpl)).toEqual({ ok: false, error: "Signups are paused for a moment. Please try again later." });
  });

  it("falls back to a plain message when the reply isn't readable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await submitSignup({ email: "a@example.com", source: "grader" }, fetchImpl)).toEqual({ ok: false, error: "That didn’t go through. Try again." });
  });

  it("says when the browser is offline", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await submitSignup({ email: "a@example.com", source: "grader" }, fetchImpl)).toEqual({ ok: false, error: "You seem to be offline. Try again when you’re connected." });
  });
});
