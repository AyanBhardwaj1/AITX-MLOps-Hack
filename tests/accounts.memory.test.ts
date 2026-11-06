import { describe, expect, it } from "vitest";
import { createMemoryAccounts } from "@/lib/accounts/memory";
import { companyNameFromEmail } from "@/lib/accounts/types";
import { runAccountsContract } from "./accounts-contract";

runAccountsContract("memory", async () => createMemoryAccounts());

describe("companyNameFromEmail", () => {
  it("guesses a name from a work domain and falls back for personal email", () => {
    expect(companyNameFromEmail("maya@acme-robotics.com")).toBe("Acme Robotics");
    expect(companyNameFromEmail("maya@gmail.com")).toBe("My company");
    expect(companyNameFromEmail(null)).toBe("My company");
  });
});
