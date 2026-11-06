import { NextResponse } from "next/server";
import { parseBudgetInput } from "@/lib/finance/budgets";
import { categoryName, formatMoney } from "@/lib/format";
import { readBodyCapped } from "@/lib/http-body";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { logActivity } from "@/lib/server/company";
import { accessErrorResponse } from "@/lib/server/errors";
import { scopeFor } from "@/lib/server/scope";
import { getStore, persistentStorageReady } from "@/lib/server/store";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000;
const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Anyone on the team sets or removes a category's monthly budget (planning, not a destructive change). */
export async function POST(request: Request) {
  if (!allow(clientIp(request))) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  if (!persistentStorageReady()) return NextResponse.json({ error: "Budgets need DATABASE_URL on this deployment." }, { status: 503 });
  let scope: string;
  try {
    // Who's asking comes first: a signed-out request learns nothing about validation.
    scope = await scopeFor("company");
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    throw err;
  }
  const text = await readBodyCapped(request, MAX_BODY_BYTES).catch(() => null);
  let raw: unknown = null;
  try {
    raw = text === null ? null : JSON.parse(text);
  } catch {
    // Falls through to validation.
  }
  const input = parseBudgetInput(raw);
  if (!input) return NextResponse.json({ error: "Choose a spending category and a monthly amount in dollars." }, { status: 400 });
  try {
    const previous = await getStore(scope).setBudget(input.category, input.monthlyCents);
    const name = categoryName(input.category);
    const detail =
      input.monthlyCents === null
        ? previous === null
          ? null
          : `Removed the ${name} budget`
        : previous === null
          ? `Set the ${name} budget to ${formatMoney(input.monthlyCents)}/mo`
          : previous === input.monthlyCents
            ? null
            : `Changed the ${name} budget from ${formatMoney(previous)} to ${formatMoney(input.monthlyCents)}/mo`;
    if (detail) await logActivity(scope, "budget", detail);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const known = accessErrorResponse(err);
    if (known) return known;
    console.error("[budgets] save failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn’t save that budget. Try again." }, { status: 500 });
  }
}
