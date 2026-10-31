import type { Cents, EnrichedTxn, TxnType } from "../types";
import { resolveVendor } from "../vendors/normalize";
import type { RhoAccount, RhoTransaction } from "./schema";

/** A card payoff counted as spend because the card's own rows were not imported (see csv/import.ts). */
export const UNITEMIZED_CARD_SPEND = "unitemized_card_spend";

/** Accounts whose balance is spendable cash. Credit is a liability; rewards are points. */
const CASH_ACCOUNT_TYPES = new Set<RhoAccount["account_type"]>(["checking", "savings", "investment"]);

/** Money moving between the company's own accounts (or paying off its own card) is not burn. */
const TRANSFER_TYPES = new Set([
  "credit_repayment",
  "credit_repayment_refund",
  "internal_transfer",
  "savings_deposit",
  "savings_withdrawal",
]);

function txnType(rhoType: string): TxnType {
  if (TRANSFER_TYPES.has(rhoType)) return "transfer";
  if (rhoType.endsWith("_fee")) return "fee";
  if (rhoType.startsWith("card_")) return "card";
  if (rhoType.startsWith("ach_")) return "ach";
  if (rhoType.includes("wire")) return "wire";
  return "other";
}

/** Rho row → Runway transaction. Returns null for rows that never move cash. */
export function mapTransaction(t: RhoTransaction): EnrichedTxn | null {
  if (t.status === "failed" || t.account_type === "rewards") return null;
  const settled = t.status === "settled";
  const date = (settled ? (t.posted_at ?? t.initiated_at) : t.initiated_at).slice(0, 10);
  const type = txnType(t.transaction_type);
  return {
    // Rho ids can repeat across the legs of one money movement; the account disambiguates.
    id: `${t.account_id}:${t.id}`,
    accountId: t.account_id,
    postedAt: date,
    amountCents: t.amount.amount,
    description: t.counterparty_name,
    type,
    status: settled ? "posted" : "pending",
    cardholder: t.card_id ? (t.user_full_name ?? undefined) : undefined,
    vendor:
      type === "transfer"
        ? { key: "internal_transfer", name: "Internal transfer", category: "transfer", job: null, source: "catalog" }
        : t.transaction_type === UNITEMIZED_CARD_SPEND
          ? { key: UNITEMIZED_CARD_SPEND, name: "Card spend (line items not uploaded)", category: "other", job: null, source: "catalog" }
          : resolveVendor(t.counterparty_name),
  };
}

export function cashBalanceCents(accounts: readonly RhoAccount[]): Cents {
  return accounts.filter((a) => CASH_ACCOUNT_TYPES.has(a.account_type)).reduce((s, a) => s + a.balance.amount, 0);
}
