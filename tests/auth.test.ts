import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { handleLoginRequest } from "@/lib/auth/login";
import { createProxy } from "@/lib/auth/proxy";
import { EMAIL_HEADER, safeNextPath, stripInternalHeaders, USER_HEADER, verifiedEmail } from "@/lib/auth/session";

describe("stripInternalHeaders", () => {
  it("removes any identity header a client tries to send", () => {
    const h = new Headers({ [USER_HEADER]: "forged", [EMAIL_HEADER]: "x@y.z", "X-Runway-Anything": "1", accept: "text/html" });
    const out = stripInternalHeaders(h);
    expect(out.get(USER_HEADER)).toBeNull();
    expect(out.get(EMAIL_HEADER)).toBeNull();
    expect(out.get("x-runway-anything")).toBeNull();
    expect(out.get("accept")).toBe("text/html");
  });
});

describe("verifiedEmail", () => {
  it("passes an email on only once Supabase has confirmed it", () => {
    expect(verifiedEmail({ email: "Maya@Acme.example", email_confirmed_at: "2026-11-06T07:00:00Z" })).toBe("maya@acme.example");
    expect(verifiedEmail({ email: "cfo@victim.example", email_confirmed_at: null })).toBeNull();
    expect(verifiedEmail({ email: "cfo@victim.example" })).toBeNull();
    expect(verifiedEmail({ email_confirmed_at: "2026-11-06T07:00:00Z" })).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("only allows paths on this site after sign-in", () => {
    expect(safeNextPath("/app?mode=company")).toBe("/app?mode=company");
    expect(safeNextPath("/app/upload")).toBe("/app/upload");
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "app"]) {
      expect(safeNextPath(bad), String(bad)).toBe("/app?mode=company");
    }
  });
});

describe("handleLoginRequest", () => {
  it("sends a link for a valid email and answers the same whether or not it's known", async () => {
    const sendLink = vi.fn().mockResolvedValue(undefined);
    expect(await handleLoginRequest({ email: " Maya@Example.com " }, { sendLink })).toEqual({ status: 200, body: { ok: true } });
    expect(sendLink).toHaveBeenCalledWith("maya@example.com");
    const refused = vi.fn().mockRejectedValue(Object.assign(new Error("Signups not allowed"), { status: 422 }));
    expect(await handleLoginRequest({ email: "stranger@example.com" }, { sendLink: refused })).toEqual({ status: 200, body: { ok: true } });
  });

  it("rejects a malformed email without calling the auth service", async () => {
    const sendLink = vi.fn();
    for (const body of [null, {}, { email: "nope" }, { email: "a".repeat(260) + "@x.co" }]) {
      expect((await handleLoginRequest(body, { sendLink })).status).toBe(400);
    }
    expect(sendLink).not.toHaveBeenCalled();
  });
});

describe("proxy with accounts configured", () => {
  const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(new URL(path, "http://localhost:3000"), { headers });

  it("forwards the verified user to the app, never a client's copy of the header", async () => {
    const proxy = createProxy({ authConfigured: () => true, appPassword: () => undefined, getUser: async () => ({ user: { id: "user-1", email: "maya@example.com" }, setCookies: [{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }] }) });
    const res = await proxy(req("/app", { [USER_HEADER]: "forged" }));
    expect(res.headers.get(`x-middleware-request-${USER_HEADER}`)).toBe("user-1");
    expect(res.headers.get(`x-middleware-request-${EMAIL_HEADER}`)).toBe("maya@example.com");
    // A refreshed session is written back to the browser.
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  });

  it("drops a forged header when nobody is signed in", async () => {
    const proxy = createProxy({ authConfigured: () => true, appPassword: () => undefined, getUser: async () => ({ user: null, setCookies: [] }) });
    const res = await proxy(req("/api/findings", { [USER_HEADER]: "forged" }));
    expect(res.status).toBe(200);
    expect(res.headers.get(`x-middleware-request-${USER_HEADER}`)).toBeNull();
    // Next replaces the request headers with exactly the override list, so the client's copy is dropped.
    expect(res.headers.get("x-middleware-override-headers")).not.toBeNull();
    expect(res.headers.get("x-middleware-override-headers")!.split(",")).not.toContain(USER_HEADER);
  });

  it("still refuses cross-site writes", async () => {
    const proxy = createProxy({ authConfigured: () => true, appPassword: () => undefined, getUser: async () => ({ user: null, setCookies: [] }) });
    const res = await proxy(new NextRequest("http://localhost:3000/api/findings", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    expect(res.status).toBe(403);
  });

  it("sends a signed-out visitor to sign in before rendering a company page, and leaves the demo open", async () => {
    const proxy = createProxy({ authConfigured: () => true, appPassword: () => undefined, getUser: async () => ({ user: null, setCookies: [] }) });
    for (const path of ["/app?mode=company", "/app/upload", "/app/upload/", "/app/settings", "/app/transactions?mode=company&q=zoom"]) {
      const res = await proxy(req(path));
      expect(res.status, path).toBe(307);
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("next")).toBe(path);
    }
    for (const path of ["/app", "/app?mode=demo", "/app/transactions", "/app/transactions?mode=demo", "/", "/grader", "/s/abc", "/login"]) expect((await proxy(req(path))).status, path).toBe(200);
  });

  it("lets a signed-in founder through to their company pages", async () => {
    const proxy = createProxy({ authConfigured: () => true, appPassword: () => undefined, getUser: async () => ({ user: { id: "user-1", email: null }, setCookies: [] }) });
    expect((await proxy(req("/app?mode=company"))).status).toBe(200);
    expect((await proxy(req("/app/upload"))).status).toBe(200);
  });

  it("doesn't ask for the old shared password once accounts are on", async () => {
    const proxy = createProxy({ authConfigured: () => true, appPassword: () => "hunter22hunter", getUser: async () => ({ user: null, setCookies: [] }) });
    expect((await proxy(req("/app"))).status).toBe(200);
  });
});

describe("proxy without accounts", () => {
  it("keeps the shared password gate, and never trusts an identity header", async () => {
    const getUser = vi.fn();
    const proxy = createProxy({ authConfigured: () => false, appPassword: () => "hunter22hunter", getUser });
    const res = await proxy(new NextRequest("http://localhost:3000/app", { headers: { [USER_HEADER]: "forged" } }));
    expect(res.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
    const open = createProxy({ authConfigured: () => false, appPassword: () => undefined, getUser });
    const ok = await open(new NextRequest("http://localhost:3000/app", { headers: { [USER_HEADER]: "forged" } }));
    expect(ok.headers.get(`x-middleware-request-${USER_HEADER}`)).toBeNull();
    expect(ok.headers.get("x-middleware-override-headers")!.split(",")).not.toContain(USER_HEADER);
  });
});
