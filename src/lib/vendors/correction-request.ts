import { z } from "zod";
import { DATA_MODES, type DataMode } from "../modes";
import type { Store } from "../store/types";
import { correctionFields, correctionInput } from "./corrections";

/** Enough for any real company; stops one scope from being filled with junk. */
export const MAX_CORRECTIONS = 100;

type Mode = DataMode;
const mode = z.enum(DATA_MODES);
const request = z.discriminatedUnion("action", [
  correctionFields.extend({ mode, action: z.literal("set") }),
  z.object({ mode, action: z.literal("clear"), vendorKey: correctionFields.shape.vendorKey }),
]);

/** Where fixes go; `maxCorrections` when it holds fewer than MAX_CORRECTIONS (the demo's cookie). */
export type CorrectionSink = Pick<Store, "setCorrection" | "clearCorrection"> & { maxCorrections?: number };

export interface CorrectionDeps {
  /** Where this data source's fixes are kept (the demo uses the visitor's own cookie). */
  sinkFor: (mode: Mode) => CorrectionSink | Promise<CorrectionSink>;
  /** Vendor keys present in this data source, so only real vendors can be corrected. */
  knownVendorKeys: (mode: Mode) => Promise<ReadonlySet<string>>;
  /** False where the app refuses to show the data (a real account with no password set). */
  canWrite: (mode: Mode) => boolean;
}

export type CorrectionResult = { status: 200; body: { ok: true } } | { status: 400 | 403 | 409; body: { error: string } };

export async function handleCorrection(raw: unknown, deps: CorrectionDeps): Promise<CorrectionResult> {
  const parsed = request.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "Invalid correction" } };
  const req = parsed.data;
  if (!deps.canWrite(req.mode)) return { status: 403, body: { error: "Set APP_PASSWORD before saving changes to a connected account." } };
  const sink = await deps.sinkFor(req.mode);
  if (req.action === "clear") {
    await sink.clearCorrection(req.vendorKey);
    return { status: 200, body: { ok: true } };
  }
  const fix = correctionInput.safeParse({ vendorKey: req.vendorKey, category: req.category, job: req.job });
  if (!fix.success) return { status: 400, body: { error: "Only software, cloud and AI tools can have a job." } };
  if (!(await deps.knownVendorKeys(req.mode)).has(req.vendorKey)) return { status: 400, body: { error: "That vendor isn't in this data." } };
  const outcome = await sink.setCorrection(fix.data, MAX_CORRECTIONS);
  const cap = Math.min(MAX_CORRECTIONS, sink.maxCorrections ?? MAX_CORRECTIONS);
  if (outcome === "limit") return { status: 409, body: { error: `You can correct up to ${cap} vendors. Undo one to add another.` } };
  return { status: 200, body: { ok: true } };
}
