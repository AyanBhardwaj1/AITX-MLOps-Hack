import { describe, expect, it } from "vitest";
import { cleanDescriptor, resolveVendor } from "@/lib/vendors/normalize";

describe("cleanDescriptor", () => {
  it("strips processor prefixes, store numbers and punctuation", () => {
    expect(cleanDescriptor("SQ *BLUE BOTTLE COFFEE #123")).toBe("blue bottle coffee");
    expect(cleanDescriptor("PAYPAL *NOTION LABS")).toBe("notion labs");
  });

  it("drops domain suffixes and phone numbers", () => {
    expect(cleanDescriptor("ZOOM.US 888-799-9666")).toBe("zoom");
  });

  it("returns an empty string for blank input", () => {
    expect(cleanDescriptor("   ")).toBe("");
  });
});

describe("resolveVendor", () => {
  it("maps the many spellings of one vendor to a single key", () => {
    for (const raw of ["GITHUB.COM", "GITHUB *COPILOT", "MICROSOFT *GITHUB"]) {
      expect(resolveVendor(raw).key).toBe("github");
    }
  });

  it("prefers the longest alias match", () => {
    expect(resolveVendor("ATLASSIAN *CONFLUENCE 4521").key).toBe("confluence");
    expect(resolveVendor("GOOGLE *GSUITE_tacorob").key).toBe("google_workspace");
  });

  it("keeps meaningful short numbers in vendor names", () => {
    expect(resolveVendor("MICROSOFT 365 BUSINESS").key).toBe("microsoft_365");
    expect(resolveVendor("1PASSWORD.COM").key).toBe("one_password");
  });

  it("does not let a vendor's parent company name hijack the match", () => {
    expect(resolveVendor("MICROSOFT *GITHUB").key).toBe("github");
  });

  it("matches aliases on word boundaries only", () => {
    // "uber" must not match inside "suberb"
    expect(resolveVendor("SUBERB DESIGN STUDIO").key).not.toBe("uber");
  });

  it("returns catalog metadata for known vendors", () => {
    const v = resolveVendor("ZOOM.US 888-799-9666");
    expect(v).toMatchObject({ key: "zoom", category: "software", job: "video_meetings", source: "catalog" });
  });

  it("falls back to a stable key from the first words for unknown vendors", () => {
    const v = resolveVendor("SQ *JOES COFFEE #12 AUSTIN TX");
    expect(v).toMatchObject({ key: "joes_coffee", category: "other", job: null, source: "fallback" });
  });

  it("uses 'unknown' when nothing is left after cleaning", () => {
    expect(resolveVendor("#123 ***").key).toBe("unknown");
  });
});

describe("jobLabel", () => {
  it("turns job keys into readable labels", async () => {
    const { jobLabel } = await import("@/lib/vendors/catalog");
    expect(jobLabel("crm")).toBe("CRM");
    expect(jobLabel("docs_wiki")).toBe("docs & wiki");
    expect(jobLabel("some_new_job")).toBe("some new job");
  });
});
