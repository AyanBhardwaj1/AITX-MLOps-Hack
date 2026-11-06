// Real-world-shaped exports, per-account delete, sign correction, the backup round trip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP, FIXTURES, signIn, suite } from "./helpers.mjs";

await suite("uploads", async ({ browser, step }) => {
  const p = await (await browser.newContext({ acceptDownloads: true })).newPage();
  p.on("dialog", (d) => d.accept());
  // Its own founder: the sign-in link limit (3 per inbox per 10 minutes) is per address.
  await step("a founder signs in", async () => {
    await signIn(p, "uploader@umbrella.example");
    await p.waitForURL(/\/app/);
    await p.goto(`${APP}/app/upload`);
  });
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
  await step("a card's Quicken (QFX) download uploads, once", async () => {
    await p.setInputFiles('input[type="file"]', FIXTURES + "chase-ink-oct.qfx");
    await p.getByText("3 transactions found.").waitFor();
    await p.getByRole("button", { name: "Upload and analyse" }).click();
    await p.getByText(/Saved 3 new transactions/).waitFor({ timeout: 20_000 });
    await p.getByRole("button", { name: "Delete chase ink …9876 card" }).waitFor();
    await p.setInputFiles('input[type="file"]', FIXTURES + "chase-ink-oct.qfx");
    await p.getByText("3 transactions found.").waitFor();
    await p.getByRole("button", { name: "Upload and analyse" }).click();
    await p.getByText(/Saved 0 new transactions; 3 were already stored/).waitFor({ timeout: 20_000 });
  });
  await step("a bank's OFX download offers its balance as today's cash", async () => {
    await p.setInputFiles('input[type="file"]', FIXTURES + "first-bank-checking.ofx");
    await p.getByText("2 transactions found.").waitFor();
    await p.getByText(/Your bank download shows \$487,210\.55 on Oct 31, 2026\./).waitFor();
    await p.getByRole("button", { name: "Use $487,210.55" }).click();
    assert.equal(await p.getByLabel(/Today.s total cash/).inputValue(), "487210.55");
    await p.getByRole("button", { name: "Use $487,210.55" }).waitFor({ state: "detached" });
    await p.getByRole("button", { name: "Upload and analyse" }).click();
    await p.getByText(/Saved 2 new transactions/).waitFor({ timeout: 20_000 });
  });
  await step("today's cash updates without a file, and the activity log says who", async () => {
    await p.getByText("Update today's cash").click();
    await p.getByLabel(/Total cash across your bank accounts today/).fill("$612,345.50");
    await p.getByRole("button", { name: "Update cash" }).click();
    await p.getByText("Saved: $612,346. Your runway uses it now.").waitFor();
    await p.locator("dd", { hasText: "$612,346" }).waitFor();
    // The upload form beside it takes the new figure, so the next upload keeps it.
    assert.equal(await p.getByLabel(/Today.s total cash/).inputValue(), "612345.5");
    await p.goto(`${APP}/app/settings`);
    await p.getByText("Set today's cash to $612,346").waitFor();
  });
  await step("transactions narrow to one account", async () => {
    await p.goto(`${APP}/app/transactions?mode=company`);
    await p.locator('select[name="account"]').selectOption({ label: "chase ink …9876 card" });
    await p.getByRole("button", { name: "Filter" }).click();
    await p.waitForURL(/account=chase/);
    await p.getByRole("heading", { name: "3 transactions match" }).waitFor();
    const text = (await p.getByRole("region", { name: "Transactions" }).locator("tbody").innerText()).toUpperCase();
    for (const v of ["AMAZON WEB SERVICES", "FIGMA", "PAYMENT THANK YOU"]) assert.ok(text.includes(v), v);
  });
  await step("the company's own transactions are searchable; signed out, nothing shows", async () => {
    await p.goto(`${APP}/app?mode=company`);
    await p.getByRole("link", { name: "Transactions" }).click();
    await p.waitForURL(/\/app\/transactions\?mode=company/);
    await p.getByLabel("Search").fill("slack");
    await p.getByRole("button", { name: "Filter" }).click();
    await p.getByRole("heading", { name: /^\d+ transactions? match$/ }).waitFor();
    const rows = p.getByRole("region", { name: "Transactions" }).locator("tbody tr");
    assert.ok((await rows.count()) > 0);
    for (const text of await rows.allInnerTexts()) assert.match(text, /slack/i);
    const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: /^Download (this transaction|these \d+) as CSV$/ }).click()]);
    const csv = readFileSync(await dl.path(), "utf8").trim().split("\r\n");
    assert.equal(csv.length - 1, await rows.count());
    for (const line of csv.slice(1)) assert.match(line, /slack/i);
    // A vendor's own view: fix its category right there, then undo it.
    await rows.first().getByRole("link").first().click();
    await p.getByText(/^Vendor: /).waitFor();
    await p.getByRole("button", { name: /Change .*'s category/ }).click();
    await p.getByLabel(/^Category for /).selectOption("marketing");
    await p.getByRole("button", { name: "Save" }).click();
    await p.getByText("your fix", { exact: true }).waitFor();
    await p.getByText(/Category: marketing/).waitFor();
    // Back to what Runway had: that undoes the fix rather than saving a copy of it.
    await p.getByRole("button", { name: /Change .*'s category/ }).click();
    await p.getByLabel(/^Category for /).selectOption("software");
    await p.getByRole("button", { name: "Save" }).click();
    await p.getByText("your fix", { exact: true }).waitFor({ state: "detached" });
    await p.getByRole("button", { name: /Change .*'s category/ }).click();
    await p.getByLabel(/^Category for /).selectOption("marketing");
    await p.getByRole("button", { name: "Save" }).click();
    await p.getByText("your fix", { exact: true }).waitFor();
    await p.getByRole("button", { name: "Undo my fix" }).click();
    await p.getByText("your fix", { exact: true }).waitFor({ state: "detached" });
    // Signed out, the same address asks for sign-in instead of showing anything.
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto(`${APP}/app/transactions?mode=company&q=slack`);
    await stranger.waitForURL(/\/login\?next=/);
  });
  await step("the team sets, changes and removes a monthly budget", async () => {
    await p.goto(`${APP}/app?mode=company`);
    const card = p.getByRole("region", { name: "Budgets" });
    await card.getByText("No budgets yet.").waitFor();
    await card.getByLabel("Category").selectOption("software");
    await card.getByLabel("Per month ($)").fill("1");
    await card.getByRole("button", { name: "Add budget" }).click();
    await card.getByRole("link", { name: "Software" }).waitFor();
    // A second budget, leaving the picker on what it now shows: it adds that one, not software again.
    const shown = await card.getByLabel("Category").inputValue();
    assert.notEqual(shown, "software");
    await card.getByLabel("Per month ($)").fill("3,000");
    await card.getByRole("button", { name: "Add budget" }).click();
    await card.locator("li", { hasText: "of $3,000 so far" }).waitFor();
    await card.locator("li", { hasText: "of $1 so far" }).waitFor();
    await card.getByRole("button", { name: /Change the software budget/ }).click();
    // Focus moves into the box that opened, not back to the top of the page.
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("inputmode")), "decimal");
    await card.getByLabel(/Monthly software budget/).fill("2,500");
    await card.getByRole("button", { name: "Save" }).click();
    await card.getByText(/of \$2,500 so far/).waitFor();
    await card.getByRole("button", { name: /Change the software budget/ }).click();
    await card.getByRole("button", { name: "Remove" }).click();
    await card.getByRole("link", { name: "Software" }).waitFor({ state: "detached" });
    // The row is gone; focus went to the card's heading, not the top of the page.
    assert.equal(await p.evaluate(() => document.activeElement?.id), "budgets-title");
    await p.goto(`${APP}/app/settings`);
    await p.getByText("Changed the software budget from $1 to $2,500/mo").waitFor();
    await p.getByText("Removed the software budget").waitFor();
  });
});
