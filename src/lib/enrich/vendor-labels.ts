import { z } from "zod";
import { CATEGORIES, type EnrichedTxn, type VendorInfo } from "../types";
import { VENDOR_CATALOG } from "../vendors/catalog";
import { cleanDescriptor } from "../vendors/normalize";

/**
 * LLM fallback for vendors the catalog doesn't know. Rules run first; only unique unknown
 * vendors (as cleaned names, never raw rows) go to the model, and its answer is forced into
 * the same closed category/job lists the rules use, so a hostile descriptor can at worst
 * mislabel one vendor.
 */

export const LABEL_PROMPT_VERSION = "v1";
export const MIN_LABEL_CONFIDENCE = 0.6;
const MAX_DESCRIPTOR_CHARS = 60;

const KNOWN_JOBS = [...new Set(VENDOR_CATALOG.map((e) => e.job).filter((j): j is string => j !== null))] as [string, ...string[]];

export const llmLabelSchema = z.object({
  vendorKey: z.string(),
  name: z.string().min(1).max(60),
  category: z.enum(CATEGORIES),
  job: z.enum(KNOWN_JOBS).nullable(),
  confidence: z.number().min(0).max(1),
});
export type LlmLabel = z.infer<typeof llmLabelSchema>;

export interface UnknownMerchant {
  vendorKey: string;
  descriptor: string;
}

/** Unique vendors the rules couldn't resolve, in first-seen order. */
export function unknownMerchants(txns: readonly EnrichedTxn[]): UnknownMerchant[] {
  const seen = new Map<string, UnknownMerchant>();
  for (const t of txns) {
    if (t.vendor.source !== "fallback" || t.vendor.key === "unknown" || seen.has(t.vendor.key)) continue;
    seen.set(t.vendor.key, { vendorKey: t.vendor.key, descriptor: cleanDescriptor(t.description).slice(0, MAX_DESCRIPTOR_CHARS) });
  }
  return [...seen.values()];
}

/** A usable label, or null when the model wasn't confident enough to trust. */
export function toVendorInfo(label: LlmLabel): VendorInfo | null {
  if (label.confidence < MIN_LABEL_CONFIDENCE) return null;
  return { key: label.vendorKey, name: label.name, category: label.category, job: label.job, source: "llm" };
}

/** Replaces fallback vendors with LLM labels. Catalog matches always win. Returns new objects. */
export function applyVendorLabels(txns: readonly EnrichedTxn[], labels: ReadonlyMap<string, VendorInfo>): EnrichedTxn[] {
  return txns.map((t) => {
    const label = t.vendor.source === "fallback" ? labels.get(t.vendor.key) : undefined;
    return label ? { ...t, vendor: label } : t;
  });
}

const looseResponse = z.object({ labels: z.array(z.unknown()) });

/** Validates a model response: only well-formed, confident labels for vendors we asked about survive. */
export function collectLabels(asked: readonly UnknownMerchant[], response: unknown): Map<string, VendorInfo> {
  const wanted = new Set(asked.map((m) => m.vendorKey));
  const out = new Map<string, VendorInfo>();
  const parsed = looseResponse.safeParse(response);
  if (!parsed.success) return out;
  for (const raw of parsed.data.labels) {
    const label = llmLabelSchema.safeParse(raw);
    if (!label.success || !wanted.has(label.data.vendorKey) || out.has(label.data.vendorKey)) continue;
    const info = toVendorInfo(label.data);
    if (info) out.set(info.key, info);
  }
  return out;
}
