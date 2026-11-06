import type { combineBalances } from "@/lib/csv/ofx";
import { formatDate, formatMoney } from "@/lib/format";
import { parseDollarsToCents } from "@/lib/money";

/**
 * Under a cash field: the bank balances in the chosen OFX/QFX/QBO downloads, with a button to use
 * their total. Hidden when there's none, it's negative, or the field already says it.
 */
export function CashFromFiles({ balances, cash, onUse }: { balances: ReturnType<typeof combineBalances>; cash: string; onUse: (dollars: string) => void }) {
  if (!balances || balances.cents < 0 || parseDollarsToCents(cash) === balances.cents) return null;
  const amount = formatMoney(balances.cents);
  return (
    <p className="mt-1.5 text-xs text-muted">
      {balances.accounts === 1 ? "Your bank download shows" : `Your bank downloads show ${balances.accounts} accounts holding`} {amount}
      {balances.asOf ? ` on ${formatDate(balances.asOf)}` : ""}.{" "}
      <button type="button" onClick={() => onUse(String(balances.cents / 100))} className="font-medium text-brand underline underline-offset-2">
        Use {amount}
      </button>
    </p>
  );
}
