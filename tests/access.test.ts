import { describe, expect, it } from "vitest";
import { assertSafeToServe, checkBasicAuth, checkBearer, isCrossSiteWrite, safeEqual } from "@/lib/access";

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

describe("safeEqual", () => {
  it("compares secrets without leaking length through an early exit", () => {
    expect(safeEqual("correct horse", "correct horse")).toBe(true);
    expect(safeEqual("correct horse", "correct hors")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("checkBasicAuth", () => {
  it("accepts the right password with any username", () => {
    expect(checkBasicAuth(basic("judge", "hackfair2026"), "hackfair2026")).toBe(true);
    expect(checkBasicAuth(basic("", "hackfair2026"), "hackfair2026")).toBe(true);
  });

  it("accepts passwords that contain colons", () => {
    expect(checkBasicAuth(basic("me", "a:b:c:d:e:f"), "a:b:c:d:e:f")).toBe(true);
  });

  it("rejects wrong, missing or malformed credentials", () => {
    expect(checkBasicAuth(basic("judge", "nope"), "hackfair2026")).toBe(false);
    expect(checkBasicAuth(null, "hackfair2026")).toBe(false);
    expect(checkBasicAuth("Bearer abc", "hackfair2026")).toBe(false);
    expect(checkBasicAuth("Basic !!!not-base64", "hackfair2026")).toBe(false);
  });
});

describe("checkBearer", () => {
  it("requires the exact secret", () => {
    const secret = "a-very-long-cron-secret";
    expect(checkBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(checkBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(checkBearer(null, secret)).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(checkBearer("Bearer anything", undefined)).toBe(false);
  });
});

describe("assertSafeToServe", () => {
  it("allows the sandbox and demo without a password", () => {
    expect(() => assertSafeToServe({ rhoBaseUrl: "https://rhoapi-sandbox.rho.co/api/v1", appPassword: undefined })).not.toThrow();
  });

  it("refuses a real Rho account unless the app is password-protected", () => {
    expect(() => assertSafeToServe({ rhoBaseUrl: "https://rhoapi.rho.co/api/v1", appPassword: undefined })).toThrow(/APP_PASSWORD/);
    expect(() => assertSafeToServe({ rhoBaseUrl: "https://rhoapi.rho.co/api/v1", appPassword: "long-enough-pass" })).not.toThrow();
  });
});

describe("isCrossSiteWrite", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("lets reads and same-origin writes through", () => {
    expect(isCrossSiteWrite("GET", h({ "sec-fetch-site": "cross-site" }), "app.example.com")).toBe(false);
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "same-origin", origin: "https://app.example.com" }), "app.example.com")).toBe(false);
  });

  it("allows non-browser clients that send neither header (curl, server-to-server)", () => {
    expect(isCrossSiteWrite("POST", h({}), "app.example.com")).toBe(false);
  });

  it("blocks writes another site triggers from a visitor's browser", () => {
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "cross-site" }), "app.example.com")).toBe(true);
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "same-site" }), "app.example.com")).toBe(true);
    expect(isCrossSiteWrite("DELETE", h({ origin: "https://evil.example" }), "app.example.com")).toBe(true);
    expect(isCrossSiteWrite("POST", h({ origin: "null" }), "app.example.com")).toBe(true);
  });
});
