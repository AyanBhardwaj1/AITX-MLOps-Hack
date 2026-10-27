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
  source: "catalog" | "llm" | "fallback";
}

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
