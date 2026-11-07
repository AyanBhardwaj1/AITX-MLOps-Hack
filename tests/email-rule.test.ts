import { describe, expect, it } from "vitest";
import { waitlistInput } from "@/lib/waitlist/types";

describe("email addresses: the browser's own rule", () => {
  it("accepts what an email field accepts, as the waitlist's form already did in the browser", () => {
    for (const email of ["a=b@acme.com", "o'brien@acme.com", "x@xn--bcher-kva.example", "First.Last+tag@Acme.COM"]) expect(waitlistInput.safeParse({ email }).success, email).toBe(true);
  });
  it("still refuses what isn't an address", () => {
    for (const email of ["not-an-email", "a@", "@acme.com", "a b@acme.com", "a@acme..com"]) expect(waitlistInput.safeParse({ email }).success, email).toBe(false);
  });
});
