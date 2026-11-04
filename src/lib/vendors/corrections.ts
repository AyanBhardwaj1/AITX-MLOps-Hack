import { z } from "zod";
import { CATEGORIES, type Category, type EnrichedTxn } from "../types";
import { KNOWN_JOBS } from "./catalog";

/**
 * A person's fix for how a vendor is categorised ("that's a transfer to our savings, not rent";
 * "Loom is our video-meeting tool"). Corrections win over the catalog and the LLM, and every
 * calculation downstream (burn, streams, detectors) follows them.
 */
export interface VendorCorrection {
  vendorKey: string;
  category: Category;
  job: string | null;
}

export const correctionInput = z.object({
  vendorKey: z.string().regex(/^[a-z0-9_]{1,80}$/),
  category: z.enum(CATEGORIES),
  job: z.enum(KNOWN_JOBS).nullable(),
});

/** Returns new transactions with corrected vendors; the vendor's name and key are kept. */
export function applyCorrections(txns: readonly EnrichedTxn[], corrections: ReadonlyMap<string, VendorCorrection>): EnrichedTxn[] {
  return txns.map((t) => {
    const fix = corrections.get(t.vendor.key);
    return fix ? { ...t, vendor: { ...t.vendor, category: fix.category, job: fix.job, source: "user" as const } } : t;
  });
}
