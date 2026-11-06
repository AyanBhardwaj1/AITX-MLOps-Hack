import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("web app manifest", () => {
  it("installs Runway to a home screen, opening on the app", () => {
    const m = manifest();
    expect(m.name).toBe("Runway");
    expect(m.short_name).toBe("Runway");
    expect(m.start_url).toBe("/app");
    expect(m.display).toBe("standalone");
    expect(m.icons?.some((i) => i.src === "/icon.svg" && i.sizes === "any")).toBe(true);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
