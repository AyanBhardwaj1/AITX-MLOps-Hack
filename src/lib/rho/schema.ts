import { z } from "zod";

/**
 * Rho v1 wire format. Field names follow the sandbox's OpenAPI document as seen in
 * earlier hackathon clients (see docs/prior-art.md); re-check once docs.rho.co is reachable.
 */
const money = z.object({ amount: z.number().int(), currency: z.string() });

export const accountTypeSchema = z.enum(["checking", "credit", "savings", "investment", "rewards"]);

export const rhoAccountSchema = z.object({
  id: z.string(),
  account_type: accountTypeSchema,
  account_name: z.string().nullish(),
  balance: money,
  available_balance: money.nullish(),
});

export const rhoTransactionSchema = z.object({
  id: z.string(),
  money_movement_id: z.string().nullish(),
  account_id: z.string(),
  account_name: z.string().nullish(),
  account_type: accountTypeSchema,
  amount: money,
  status: z.enum(["pending", "settled", "failed", "awaiting_approval"]),
  transaction_type: z.string(),
  counterparty_name: z.string(),
  initiated_at: z.string(),
  posted_at: z.string().nullish(),
  memo: z.string().nullish(),
  card_id: z.string().nullish(),
  card_name: z.string().nullish(),
  user_full_name: z.string().nullish(),
});

const page = z.object({ next_page_token: z.string().nullish() });

export const accountsPageSchema = z.object({ accounts: z.array(rhoAccountSchema), page });
export const transactionsPageSchema = z.object({ transactions: z.array(rhoTransactionSchema), page });

export type RhoAccount = z.infer<typeof rhoAccountSchema>;
export type RhoTransaction = z.infer<typeof rhoTransactionSchema>;
