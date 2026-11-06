import type { VendorInfo } from "../types";
import { VENDOR_CATALOG, type CatalogEntry } from "./catalog";

/** What a bank puts in front of the merchant ("PURCHASE AUTHORIZED ON 10/02 …", "CHECKCARD 0302 …"). */
const BANK_BOILERPLATE = /^(?:(?:purchase|recurring payment|recurring purchase) authorized on \d{1,2}\/\d{1,2}(?:\/\d{2,4})?|checkcard \d{4}|pos (?:debit|purchase)|debit card purchase|card purchase)\s+/;
const PROCESSOR_PREFIX = /^(sq|tst|paypal|pp|sp|py|pos|checkcard)\s*\*\s*/;
/** Amazon order descriptors carry an order reference (and more), which must not become the vendor. */
const AMAZON_MARKETPLACE = /^(?:amzn mktp(?: us)?|amazon\.com|amzn\.com)\s*\*(?!.*\b(?:prime|music|kindle)\b).*$/;
/** A descriptor that is just the brand (and maybe a state): "APPLE", "APPLE.COM … CA", "AMAZON". */
const BARE_BRAND = /^(apple|amazon)(?: [a-z]{2})?$/;
const DOMAIN_SUFFIX = /\.(com|net|io|us|co|ai|app)\b/g;
const PHONE = /\d{3}[-. ]\d{3}[-. ]\d{4}/g;
const STORE_NUMBER = /#\s*\d+/g;
/** Long numeric runs are IDs; short ones carry meaning ("365", "1password"). */
const LONG_NUMBER = /\b\d{4,}\b/g;
const FALLBACK_KEY_WORDS = 2;

/** Lower-cases a bank descriptor and strips processor prefixes, domains, IDs and punctuation. */
export function cleanDescriptor(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(BANK_BOILERPLATE, "")
    .replace(AMAZON_MARKETPLACE, "amazon")
    .replace(PROCESSOR_PREFIX, "")
    .replace(PHONE, " ")
    .replace(STORE_NUMBER, " ")
    .replace(DOMAIN_SUFFIX, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LONG_NUMBER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CompiledAlias {
  alias: string;
  entry: CatalogEntry;
}

const COMPILED_ALIASES: readonly CompiledAlias[] = VENDOR_CATALOG.flatMap((entry) =>
  entry.aliases.map((a) => ({ alias: cleanDescriptor(a), entry })),
)
  .filter((c) => c.alias.length > 0)
  // Longest alias first so "atlassian confluence" beats "confluence" and specific beats generic.
  .sort((a, b) => b.alias.length - a.alias.length);

function matchCatalog(cleaned: string): CatalogEntry | null {
  const padded = ` ${cleaned} `;
  const hit = COMPILED_ALIASES.find((c) => padded.includes(` ${c.alias} `));
  return hit?.entry ?? null;
}

/** Maps a raw bank descriptor to a vendor. Catalog hits are free; unknowns get a stable fallback key. */
export function resolveVendor(rawDescriptor: string): VendorInfo {
  const cleaned = cleanDescriptor(rawDescriptor);
  const bare = BARE_BRAND.exec(cleaned)?.[1];
  const entry = matchCatalog(cleaned) ?? (bare ? (VENDOR_CATALOG.find((e) => e.key === bare) ?? null) : null);
  if (entry) {
    return { key: entry.key, name: entry.name, category: entry.category, job: entry.job, source: "catalog" };
  }
  const words = cleaned.split(" ").filter(Boolean).slice(0, FALLBACK_KEY_WORDS);
  if (words.length === 0) {
    return { key: "unknown", name: "Unknown", category: "other", job: null, source: "fallback" };
  }
  const name = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  return { key: words.join("_"), name, category: "other", job: null, source: "fallback" };
}
