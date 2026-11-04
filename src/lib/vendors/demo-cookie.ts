import { correctionInput, type VendorCorrection } from "./corrections";

/**
 * On the public demo, each visitor's category fixes live in their own browser (a cookie), so one
 * visitor can't change the numbers everyone else sees. The cookie is untrusted input: every entry is
 * validated again when read.
 */

export const DEMO_CORRECTIONS_COOKIE = "runway_demo_fixes";
export const MAX_DEMO_CORRECTIONS = 30;

type Packed = [vendorKey: string, category: string, job: string | null];

export function encodeDemoCorrections(list: readonly VendorCorrection[]): string {
  const packed: Packed[] = list.slice(0, MAX_DEMO_CORRECTIONS).map((c) => [c.vendorKey, c.category, c.job]);
  return Buffer.from(JSON.stringify(packed)).toString("base64url");
}

export function decodeDemoCorrections(raw: string | undefined): VendorCorrection[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: VendorCorrection[] = [];
  for (const item of data.slice(0, MAX_DEMO_CORRECTIONS)) {
    if (!Array.isArray(item)) continue;
    const parsed = correctionInput.safeParse({ vendorKey: item[0], category: item[1], job: item[2] ?? null });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
