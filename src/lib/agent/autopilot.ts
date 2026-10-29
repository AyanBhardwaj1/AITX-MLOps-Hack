import { upcomingRenewals } from "../finance/renewals";
import { formatCents, formatDollars } from "../money";
import { analyze, type Analysis } from "../pipeline";
import type { RhoAccount, RhoTransaction } from "../rho/schema";
import type { VendorInfo } from "../types";
import { draftAction, simulatePlan, type ActionDraft } from "./tools";

/**
 * Autopilot is a fixed plan-then-execute pipeline, not a free-roaming agent: the step
 * sequence is decided before any untrusted bank text is read, so a hostile descriptor
 * can at worst change wording, never which actions run. The LLM only drafts the memo,
 * and the memo is rejected if it contains any number the deterministic analysis didn't produce.
 */

export type StepName = "sync" | "analyze" | "plan" | "memo" | "file_tasks";

export interface StepRecord {
  seq: number;
  name: StepName;
  status: "succeeded" | "failed";
  durationMs: number;
  detail: Record<string, unknown>;
}

export interface MemoFacts {
  company: string;
  asOf: string;
  cashText: string;
  netBurnText: string;
  runwayMonthsText: string;
  zeroCashDate: string | null;
  monthlySavingsText: string;
  oneTimeText: string;
  newRunwayText: string;
  addedMonthsText: string;
  findings: { title: string; savingsText: string }[];
  /** Annual or large renewals due soon: decide before they hit. */
  renewals: { vendorName: string; dueDate: string; amountText: string; cadence: string }[];
  allowedMoney: string[];
  allowedMonths: string[];
}

export interface AutopilotDeps {
  loadData: () => Promise<{
    accounts: RhoAccount[];
    transactions: RhoTransaction[];
    asOf?: string;
    label: string;
    vendorLabels?: ReadonlyMap<string, VendorInfo>;
  }>;
  /** Optional LLM memo writer. Without it, the template memo is used. */
  writeMemo?: (facts: MemoFacts) => Promise<{ text: string; model: string; inputTokens?: number; outputTokens?: number }>;
  /** Optional Jira (or other tracker) filing. Without it, tickets stay as drafts. */
  fileTicket?: (draft: ActionDraft) => Promise<{ externalRef: string }>;
}

export interface Ticket {
  fingerprint: string;
  findingId: string;
  title: string;
  body: string;
  status: "draft" | "filed" | "failed";
  externalRef?: string;
  /** Server-side only: why filing failed. Redacted before responses leave the server. */
  error?: string;
}

export interface AutopilotRun {
  status: "succeeded" | "failed";
  label: string;
  asOf: string | null;
  steps: StepRecord[];
  findingsCount: number;
  memo: { text: string; source: "llm" | "template"; model?: string };
  memoFacts: MemoFacts;
  tickets: Ticket[];
  error?: string;
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const oneDecimal = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : "unlimited");
const normalizeNumber = (token: string) => String(Number(token.replaceAll(",", "")));

/**
 * Every number in `text` (amounts, months, percentages, dates, counts; with or without "$")
 * must appear somewhere in the facts. Anything else is treated as invented.
 */
export function checkMemoNumbers(text: string, facts: object) {
  const allowed = new Set([...JSON.stringify(facts).matchAll(NUMBER_RE)].map((m) => normalizeNumber(m[0])));
  const unsupported = [...text.matchAll(NUMBER_RE)].map((m) => m[0]).filter((tok) => !allowed.has(normalizeNumber(tok)));
  return { ok: unsupported.length === 0, unsupported };
}

export function buildMemoFacts(a: Analysis, company: string): MemoFacts {
  const plan = simulatePlan(a, { findingIds: a.findings.map((f) => f.id), extraMonthlyCutsCents: 0 });
  const s = a.snapshot;
  const cents = [
    s.cashCents, s.grossBurnCents, s.netBurnCents, plan.monthlySavingsCents, plan.oneTimeRecoveryCents,
    ...a.findings.flatMap((f) => [f.monthlySavingsCents, f.oneTimeCents]),
  ];
  return {
    company,
    asOf: a.asOf,
    cashText: formatDollars(s.cashCents),
    netBurnText: formatDollars(s.netBurnCents),
    runwayMonthsText: `${oneDecimal(s.runwayMonths)} months`,
    zeroCashDate: s.zeroCashDate,
    monthlySavingsText: formatDollars(plan.monthlySavingsCents),
    oneTimeText: formatCents(plan.oneTimeRecoveryCents),
    newRunwayText: `${oneDecimal(plan.newRunwayMonths ?? Number.POSITIVE_INFINITY)} months`,
    addedMonthsText: `${oneDecimal(plan.addedMonths ?? 0)} months`,
    findings: a.findings.map((f) => ({
      title: f.title,
      savingsText: f.monthlySavingsCents > 0 ? `${formatCents(f.monthlySavingsCents)}/month` : `${formatCents(f.oneTimeCents)} one-time`,
    })),
    renewals: upcomingRenewals(a.streams, a.asOf)
      .filter((r) => r.decide)
      .map((r) => ({ vendorName: r.vendorName, dueDate: r.dueDate, amountText: formatCents(r.amountCents), cadence: r.cadence })),
    allowedMoney: [...new Set(cents.flatMap((c) => [formatCents(c), formatDollars(c)]))],
    allowedMonths: [...new Set([s.runwayMonths, plan.newRunwayMonths ?? 0, plan.addedMonths ?? 0].map(oneDecimal))],
  };
}

export function templateMemo(f: MemoFacts): string {
  return [
    `# Runway Review: ${f.company}`,
    `As of ${f.asOf}.`,
    "",
    `**Cash** ${f.cashText} · **Net burn** ${f.netBurnText}/month · **Runway** ${f.runwayMonthsText}${f.zeroCashDate ? ` (cash runs out around ${f.zeroCashDate})` : ""}`,
    "",
    "## What Autopilot found",
    ...(f.findings.length ? f.findings.map((x) => `- ${x.title}: ${x.savingsText}`) : ["- Nothing new this run."]),
    "",
    "## If you act on all of it",
    f.newRunwayText === "unlimited months"
      ? `Monthly savings of ${f.monthlySavingsText} would make the company cash-flow positive. One-time refunds to claim: ${f.oneTimeText}.`
      : `Monthly savings of ${f.monthlySavingsText} take runway to ${f.newRunwayText} (+${f.addedMonthsText}). One-time refunds to claim: ${f.oneTimeText}.`,
    ...(f.renewals.length
      ? ["", "## Decide before it renews", ...f.renewals.map((r) => `- ${r.vendorName} (${r.cadence}): ${r.amountText} on ${r.dueDate}`)]
      : []),
    "",
    "Each finding has a ticket below. Nothing is cancelled or paid until a person approves it.",
  ].join("\n");
}

export async function runAutopilot(deps: AutopilotDeps): Promise<AutopilotRun> {
  const steps: StepRecord[] = [];
  async function step<T>(name: StepName, fn: () => Promise<{ value: T; detail: Record<string, unknown> }>): Promise<T> {
    const start = performance.now();
    try {
      const { value, detail } = await fn();
      steps.push({ seq: steps.length + 1, name, status: "succeeded", durationMs: Math.round(performance.now() - start), detail });
      return value;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps.push({ seq: steps.length + 1, name, status: "failed", durationMs: Math.round(performance.now() - start), detail: { error: message } });
      throw err;
    }
  }

  const emptyFacts: MemoFacts = {
    company: "", asOf: "", cashText: "", netBurnText: "", runwayMonthsText: "", zeroCashDate: null, monthlySavingsText: "",
    oneTimeText: "", newRunwayText: "", addedMonthsText: "", findings: [], renewals: [], allowedMoney: [], allowedMonths: [],
  };
  let label = "unknown";

  try {
    const data = await step("sync", async () => {
      const d = await deps.loadData();
      label = d.label;
      return { value: d, detail: { source: d.label, accounts: d.accounts.length, transactions: d.transactions.length } };
    });

    const a = await step("analyze", async () => {
      const result = analyze({ accounts: data.accounts, transactions: data.transactions, asOf: data.asOf, vendorLabels: data.vendorLabels });
      return {
        value: result,
        detail: { asOf: result.asOf, streams: result.streams.length, findings: result.findings.length, timingsMs: result.timingsMs },
      };
    });

    const facts = await step("plan", async () => {
      const f = buildMemoFacts(a, label === "demo" ? "Taco Robotics, Inc. (demo data)" : "Your company");
      return { value: f, detail: { monthlySavings: f.monthlySavingsText, newRunway: f.newRunwayText, added: f.addedMonthsText } };
    });

    const memo = await step<AutopilotRun["memo"]>("memo", async () => {
      if (!deps.writeMemo) return { value: { text: templateMemo(facts), source: "template" as const }, detail: { source: "template" } };
      let llm: Awaited<ReturnType<NonNullable<AutopilotDeps["writeMemo"]>>>;
      try {
        llm = await deps.writeMemo(facts);
      } catch (err) {
        // The memo is a nice-to-have; an LLM outage must not fail the whole review.
        const message = err instanceof Error ? err.message : String(err);
        return { value: { text: templateMemo(facts), source: "template" as const }, detail: { source: "template", llmFailed: true, error: message } };
      }
      const check = checkMemoNumbers(llm.text, facts);
      if (!check.ok) {
        return {
          value: { text: templateMemo(facts), source: "template" as const },
          detail: { source: "template", llmRejected: true, unsupported: check.unsupported, model: llm.model },
        };
      }
      return {
        value: { text: llm.text, source: "llm" as const, model: llm.model },
        detail: { source: "llm", model: llm.model, inputTokens: llm.inputTokens ?? 0, outputTokens: llm.outputTokens ?? 0 },
      };
    });

    const tickets = await step("file_tasks", async () => {
      const drafts = a.findings
        .map((f) => draftAction(a, { findingId: f.id, kind: "jira_ticket" }))
        .filter((d): d is ActionDraft => !("error" in d));
      if (!deps.fileTicket) {
        return {
          value: drafts.map((d): Ticket => ({ fingerprint: d.fingerprint, findingId: d.findingId, title: d.title, body: d.body, status: "draft" })),
          detail: { drafted: drafts.length, jira: "not configured" },
        };
      }
      const fileTicket = deps.fileTicket;
      // One failed ticket shouldn't sink the run; filing checks for an existing issue first, so a retry won't duplicate it.
      const results = await Promise.all(
        drafts.map(async (d): Promise<Ticket> => {
          const base = { fingerprint: d.fingerprint, findingId: d.findingId, title: d.title, body: d.body };
          try {
            const { externalRef } = await fileTicket(d);
            return { ...base, status: "filed", externalRef };
          } catch (err) {
            return { ...base, status: "failed", error: err instanceof Error ? err.message : String(err) };
          }
        }),
      );
      const failed = results.filter((r) => r.status === "failed").length;
      return { value: results, detail: { filed: results.length - failed, failed, jira: "configured" } };
    });

    return { status: "succeeded", label, asOf: a.asOf, steps, findingsCount: a.findings.length, memo, memoFacts: facts, tickets };
  } catch (err) {
    return {
      status: "failed",
      label,
      asOf: null,
      steps,
      findingsCount: 0,
      memo: { text: "", source: "template" },
      memoFacts: emptyFacts,
      tickets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
