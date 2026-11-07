import { importStatement } from "@/lib/csv/ofx";
import { fileAccountLabel, toUploadRows, type UploadRow } from "./rows";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** A chosen file, the account its rows belong to, and whether its charges are positive numbers. */
export interface PickedFile {
  file: File;
  account: string;
  flip: boolean;
}

export interface Parsed {
  rows: UploadRow[];
  notes: string[];
}

/** Reads every chosen file in the browser into upload rows, with a note for each problem. */
export async function parseFiles(files: readonly PickedFile[]): Promise<Parsed> {
  const rows: UploadRow[] = [];
  const notes: string[] = [];
  for (const { file: f, account, flip } of files) {
    if (f.size > MAX_FILE_BYTES) {
      notes.push(
        `${f.name} is over 20 MB, so it was skipped. Export a shorter date range.`,
      );
      continue;
    }
    try {
      const r = importStatement(await f.text(), {
        accountId: account.trim() || fileAccountLabel(f.name),
        resolvePayoffs: false,
        flipSigns: flip,
      });
      // One push per row: spreading 120k+ rows into one call overflows the stack.
      for (const row of toUploadRows(r.transactions)) rows.push(row);
      if (r.skipped.length > 0)
        notes.push(
          `${f.name}: ${r.skipped.length} row${r.skipped.length === 1 ? "" : "s"} couldn't be read and were left out.`,
        );
      if (r.mostlyPositive && !flip)
        notes.push(
          `${f.name}: most amounts are positive. If this export lists charges as positive numbers, delete "${account.trim() || fileAccountLabel(f.name)}" in the list above, then upload it again with "Charges are positive" ticked.`,
        );
    } catch (err) {
      notes.push(
        `${f.name}: ${err instanceof Error ? err.message : "couldn't read this file"}`,
      );
    }
  }
  return { rows, notes };
}
