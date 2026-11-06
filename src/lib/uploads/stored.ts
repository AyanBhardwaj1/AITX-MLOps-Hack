import { createHash } from "node:crypto";
import type { RhoTransaction } from "../rho/schema";
import type { UploadRow } from "./rows";

/**
 * Server side: upload rows → Rho-shaped transactions with an id derived from their content, so the
 * same row in an overlapping export gets the same id (and is stored once).
 */
export function storedRowsFrom(rows: readonly UploadRow[]): RhoTransaction[] {
  return rows.map((r) => {
    const id = `u_${createHash("sha256").update(JSON.stringify([r.date, r.description, r.amountCents, r.account, r.n])).digest("hex").slice(0, 32)}`;
    const first = r.cardholder?.split(" ")[0];
    return {
      id,
      money_movement_id: null,
      account_id: r.account,
      account_name: r.account,
      account_type: r.accountType,
      amount: { amount: r.amountCents, currency: "USD" },
      status: "settled",
      transaction_type: r.type,
      counterparty_name: r.description,
      initiated_at: `${r.date}T12:00:00Z`,
      posted_at: `${r.date}T12:00:00Z`,
      card_id: first ? `card_${first.toLowerCase()}` : null,
      card_name: first ? `${first}'s card` : null,
      user_full_name: r.cardholder,
    };
  });
}
