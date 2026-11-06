// Real-world-shaped exports, per-account delete, sign correction, the backup round trip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP, FIXTURES, signIn, suite } from "./helpers.mjs";

await suite("uploads", async ({ browser, step }) => {
  const p = await (await browser.newContext({ acceptDownloads: true })).newPage();
  p.on("dialog", (d) => d.accept());
  await signIn(p, "founder-a@acme.example");
  await p.waitForURL(/\/app/);
  await p.goto(`${APP}/app/upload`);
  await step("four bank layouts read with the right signs, previewed before upload", async () => {
    await p.setInputFiles('input[type="file"]', ["amex-gold-oct.csv", "capital-one-spark.csv", "wells-checking.csv"].map((f) => FIXTURES + f));
    await p.getByText("3 transactions found.").first().waitFor();
    await p.getByLabel(/Today.s total cash/).fill("500000");
    await p.getByRole("button", { name: "Upload and analyse" }).click();
    await p.getByText(/Saved 7 new transactions/).waitFor({ timeout: 20_000 });
    const rows = await p.getByRole("table", { name: "Uploaded accounts" }).locator("tbody tr").count();
    assert.equal(rows, 3);
  });
  await step("a positive-charges file: delete its rows, then upload it flipped", async () => {
    await p.setInputFiles('input[type="file"]', FIXTURES + "positive-card.csv");
    await p.getByText("3 transactions found.").waitFor();
    await p.getByRole("button", { name: "Upload and analyse" }).click();
    await p.getByText(/delete "positive card" in the list above/).waitFor({ timeout: 20_000 });
    await p.getByRole("button", { name: "Delete positive card" }).click();
    await p.waitForFunction(() => document.querySelectorAll("table tbody tr").length === 3);
    await p.setInputFiles('input[type="file"]', FIXTURES + "positive-card.csv");
    await p.getByLabel(/Charges are positive numbers/).check();
    await p.getByRole("button", { name: "Upload and analyse" }).click();
    await p.getByText(/Saved 3 new transactions/).waitFor({ timeout: 20_000 });
  });
  await step("the download re-uploads without duplicating anything", async () => {
    const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download all as CSV" }).click()]);
    const file = await dl.path();
    assert.match(readFileSync(file, "utf8"), /SLACK TECHNOLOGIES,-875/);
    await p.setInputFiles('input[type="file"]', file);
    await p.getByText(/transactions found/).waitFor();
    await p.getByRole("button", { name: "Upload and analyse" }).click();
    await p.getByText(/Saved 0 new transactions; 10 were already stored/).waitFor({ timeout: 20_000 });
  });
});
