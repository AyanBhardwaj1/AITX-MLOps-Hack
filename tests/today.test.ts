import { describe, expect, it } from "vitest";
import { latestDateOnEarth, localIsoDate } from "@/lib/dates";

describe("what counts as today", () => {
  it("on the server, is the latest date anywhere (UTC+14), so a founder east of UTC keeps today's rows", () => {
    // 22:00 UTC on Nov 6 is already Nov 7 in Tokyo (UTC+9) and Kiritimati (UTC+14).
    expect(latestDateOnEarth(new Date("2026-11-06T22:00:00Z"))).toBe("2026-11-07");
    // 09:00 UTC is 23:00 Nov 6 at UTC+14: nobody is on Nov 7 yet.
    expect(latestDateOnEarth(new Date("2026-11-06T09:00:00Z"))).toBe("2026-11-06");
    expect(latestDateOnEarth(new Date("2026-11-06T10:00:00Z"))).toBe("2026-11-07");
  });

  it("in the browser, is the visitor's own calendar date", () => {
    const d = new Date(2026, 10, 6, 23, 30); // local time
    expect(localIsoDate(d)).toBe("2026-11-06");
    expect(localIsoDate(new Date(2027, 0, 1, 0, 5))).toBe("2027-01-01");
  });
});
