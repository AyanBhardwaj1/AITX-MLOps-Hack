import { describe, expect, it } from "vitest";
import { parseFiles } from "@/lib/uploads/parse-files";

describe("parseFiles (the upload form's file reader)", () => {
  it("reads an export of 130,000 rows (more than fit in one call's arguments)", async () => {
    const lines = ["Date,Description,Amount"];
    for (let i = 0; i < 130_000; i++) lines.push(`2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")},VENDOR ${i % 500},-${1 + (i % 90)}.25`);
    const file = new File([lines.join("\n")], "big.csv", { type: "text/csv" });
    const { rows, notes } = await parseFiles([{ file, account: "checking", flip: false }]);
    expect(notes).toEqual([]);
    expect(rows).toHaveLength(130_000);
  }, 60_000);
});
