import { z } from "zod";
import type { Store } from "../store/types";
import { correctionInput } from "./corrections";

/** Enough for any real company; stops a public demo from being filled with junk. */
export const MAX_CORRECTIONS = 100;

const mode = z.enum(["demo", "sandbox"]);
const request = z.discriminatedUnion("action", [
  correctionInput.extend({ mode, action: z.literal("set") }),
  z.object({ mode, action: z.literal("clear"), vendorKey: correctionInput.shape.vendorKey }),
]);

export type CorrectionResult = { status: 200; body: { ok: true } } | { status: 400 | 409; body: { error: string } };

/** Validates and applies one correction change. `storeFor` picks the data source's store. */
export async function handleCorrection(raw: unknown, storeFor: (mode: "demo" | "sandbox") => Store): Promise<CorrectionResult> {
  const parsed = request.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "Invalid correction" } };
  const store = storeFor(parsed.data.mode);
  if (parsed.data.action === "clear") {
    await store.clearCorrection(parsed.data.vendorKey);
    return { status: 200, body: { ok: true } };
  }
  const { vendorKey, category, job } = parsed.data;
  const existing = await store.listCorrections();
  if (existing.length >= MAX_CORRECTIONS && !existing.some((c) => c.vendorKey === vendorKey)) {
    return { status: 409, body: { error: `You can correct up to ${MAX_CORRECTIONS} vendors. Clear one to add another.` } };
  }
  await store.setCorrection({ vendorKey, category, job });
  return { status: 200, body: { ok: true } };
}
