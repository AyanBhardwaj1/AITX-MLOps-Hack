/** Money is always integer cents. Negative = money leaving the account. */
export type Cents = number;

/** ISO calendar date, YYYY-MM-DD. */
export type IsoDate = string;

export type TxnType = "card" | "ach" | "wire" | "transfer" | "fee" | "other";

export interface Account {
  id: string;
  name: string;
  balanceCents: Cents;
  currency: string;
}

export interface Txn {
  id: string;
  accountId: string;
  postedAt: IsoDate;
  amountCents: Cents;
  description: string;
  type: TxnType;
  status: "posted" | "pending";
  /** Present for card transactions when the provider exposes it. */
  cardholder?: string;
}

export const CATEGORIES = [
  "payroll",
  "rent",
  "software",
  "cloud",
  "ai_api",
  "marketing",
  "travel",
  "meals",
  "contractors",
  "legal_accounting",
  "insurance",
  "hardware",
  "fees",
  "revenue",
  "transfer",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface VendorInfo {
  key: string;
  name: string;
  category: Category;
  /** Job-to-be-done for software, e.g. "video_meetings". Used to spot overlapping tools. */
  job: string | null;
  /** "user": a person corrected it, which overrides every other source. */
  source: "catalog" | "llm" | "fallback" | "user";
  /** A known (catalog) vendor a person has recategorised: the catalog's own category for it. */
  catalogCategory?: Category;
}

/** The catalog's category for a known vendor, whatever category a person gave it; undefined if not a known company. */
const catalogCategoryOf = (v: Pick<VendorInfo, "source" | "category" | "catalogCategory">) => (v.source === "catalog" ? v.category : v.catalogCategory);

/**
 * A known company in the role the catalog gives it: true for a catalog vendor, or one a person's fix
 * left in its catalog category. A fix to another category is the person's call (a wrong match).
 */
export const isKnownCompany = (v: Pick<VendorInfo, "source" | "category" | "catalogCategory">) => {
  const own = catalogCategoryOf(v);
  return own !== undefined && own === v.category;
};

/** A payment processor's payouts (Stripe): a known company the catalog itself calls revenue. */
export const isPaymentProcessor = (v: Pick<VendorInfo, "source" | "category" | "catalogCategory">) => v.category === "revenue" && catalogCategoryOf(v) === "revenue";

export interface EnrichedTxn extends Txn {
  vendor: VendorInfo;
}

export type Cadence = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "annual";

export interface RecurringStream {
  vendorKey: string;
  vendorName: string;
  category: Category;
  job: string | null;
  cadence: Cadence;
  occurrences: number;
  /** Typical charge size (median), positive cents. */
  typicalAmountCents: Cents;
  /** Coefficient of variation of charge amounts. Low = fixed price. */
  amountCv: number;
  monthlyCostCents: Cents;
  firstDate: IsoDate;
  lastDate: IsoDate;
  nextExpected: IsoDate;
  active: boolean;
  txnIds: string[];
  /** The card this stream bills (null for ACH/wire). */
  cardholder: string | null;
  cardholders: string[];
  /** A second workspace of the same vendor on the same card (its own stream, its own ids): "#2". */
  workspace?: "#2";
}

export type FindingKind = "zombie" | "duplicate_tools" | "price_creep" | "duplicate_charge";

export interface Finding {
  id: string;
  kind: FindingKind;
  title: string;
  detail: string;
  vendorKeys: string[];
  monthlySavingsCents: Cents;
  /** One-time money to recover (e.g. a refund for a double charge). */
  oneTimeCents: Cents;
  confidence: number;
  evidenceTxnIds: string[];
}
