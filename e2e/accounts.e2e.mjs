// Sign in, upload, see your own dashboard, sign out; another founder sees none of it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { APP, signIn, suite, uploadSample } from "./helpers.mjs";

await suite("accounts", async ({ browser, step }) => {
  const a = await (await browser.newContext()).newPage();
  await step("the demo works without signing in, and the public pages stay public", async () => {
    await a.goto(`${APP}/app?mode=demo`);
    await a.getByText("Taco Robotics, Inc. · synthetic demo data").waitFor();
    // Nothing hidden inside a scroll box (a screen-reader label) stretches the page past its footer.
    const below = await a.evaluate(() => document.documentElement.scrollHeight - (document.querySelector("footer").getBoundingClientRect().bottom + scrollY));
    assert.ok(below < 40, `page runs ${below}px past the footer`);
    // A shared grader link previews as the grader, with the card image.
    const graderHtml = await (await fetch(`${APP}/grader`)).text();
    assert.match(graderHtml, /<meta property="og:title" content="Runway Grader"\/>/);
    assert.match(graderHtml, /<meta property="og:image" content="[^"]+opengraph-image/);
    // No serious or critical accessibility violations on the public pages and the demo (axe-core).
    const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
    // Reduced motion, so a fade-in caught halfway isn't read as low contrast.
    await a.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/", "/grader", "/privacy", "/app?mode=demo"]) {
      await a.goto(`${APP}${path}`);
      await a.waitForLoadState("networkidle");
      await a.addScriptTag({ content: axe });
      const bad = await a.evaluate(async () =>
        (await window.axe.run(document, { resultTypes: ["violations"] })).violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      );
      assert.deepEqual(bad, [], `${path} has accessibility violations`);
    }
    await a.emulateMedia({ reducedMotion: "no-preference" });
    await a.goto(`${APP}/app?mode=demo`);
    await a.getByText("Taco Robotics, Inc. · synthetic demo data").waitFor();
    // Picking Transfer for a vendor says what it does to burn before anything is saved.
    await a.getByRole("button", { name: "Fix the category for Gusto Payroll" }).click();
    const fix = a.getByRole("form", { name: "Category for Gusto Payroll" });
    await fix.locator("select").first().selectOption("transfer");
    await fix.getByText(/charges will leave burn and runway/).waitFor();
    await fix.getByRole("button", { name: "Cancel" }).click();
    // Jump links: each goes to its section, and the row fits a phone without the page scrolling sideways.
    const nav = a.getByRole("navigation", { name: "Dashboard sections" });
    for (const href of await nav.getByRole("link").evaluateAll((ls) => ls.map((l) => l.getAttribute("href")))) assert.equal(await a.locator(href).count(), 1, `${href} found`);
    await nav.getByRole("link", { name: "Waste found" }).click();
    assert.match(a.url(), /#waste-found$/);
    await a.setViewportSize({ width: 390, height: 844 });
    // Charts re-measure after a resize; give them a moment to settle.
    await a.waitForFunction(() => document.documentElement.scrollWidth === document.documentElement.clientWidth, null, { timeout: 5000 }).catch(() => {});
    const wide = await a.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.equal(wide[0], wide[1], `page ${wide[0]}px wide at ${wide[1]}px`);
    await a.setViewportSize({ width: 1280, height: 720 });
    // Each recurring charge says how many days of runway it costs.
    const recurring = a.getByRole("region", { name: "Recurring charges" });
    await recurring.getByRole("columnheader", { name: "Runway it costs" }).waitFor();
    await recurring.getByText(/^\d+ days?$/).first().waitFor();
    // Who pays you: the demo's money comes through Stripe, which is many customers, not one.
    const payers = a.getByRole("region", { name: "Who pays you" });
    await payers.getByText("many customers", { exact: true }).waitFor();
    assert.equal(await payers.getByText(/If it stopped paying/).count(), 0);
    // 1099s: the demo's law firm and landlord, paid by bank; the CSV lists them.
    const prep = a.getByRole("region", { name: /^1099s for \d{4}$/ });
    await prep.getByRole("link", { name: "Wilson Sonsini (legal)" }).waitFor();
    const csv = await (await a.request.get(`${APP}/api/export?mode=demo&kind=1099`)).text();
    assert.match(csv, /Brazos Properties \(rent\),1099-MISC,\d{4},/);
    // The monthly cash P&L: a year of whole months, revenue first, a net row last.
    const pnl = (await (await a.request.get(`${APP}/api/export?mode=demo&kind=pnl`)).text()).trim().split("\r\n");
    assert.equal(pnl[0].split(",").length, 14);
    assert.match(pnl[1], /^Revenue,/);
    assert.match(pnl.at(-1), /^Net cash flow,/);
    await a.getByRole("link", { name: "Monthly cash P&L (CSV)" }).waitFor();
    for (const path of ["/", "/grader", "/privacy", "/security"]) assert.equal((await a.goto(APP + path)).status(), 200, path);
    // Installable: the page links the manifest, which opens on the app.
    const href = await a.locator('link[rel="manifest"]').getAttribute("href");
    const manifest = await (await fetch(new URL(href, APP))).json();
    assert.equal(manifest.start_url, "/app");
  });
  await step("on the demo, an Inbox decision shows for the visitor but isn't saved for the next one", async () => {
    await a.goto(`${APP}/app?mode=demo`);
    await a.getByRole("tab", { name: "Autopilot" }).click();
    await a.getByRole("button", { name: "Run now" }).click();
    await a.getByRole("button", { name: "Open Inbox →" }).click({ timeout: 60_000 });
    const inbox = a.getByRole("tabpanel", { name: "Inbox" });
    await inbox.getByText("On the demo, your decisions show here but aren't saved for the next visitor.").waitFor();
    await inbox.getByRole("button", { name: "Reject" }).first().click();
    await inbox.getByText("rejected", { exact: true }).first().waitFor();
    const { actions } = await (await a.request.get(`${APP}/api/actions?mode=demo`)).json();
    assert.ok(actions.length > 0);
    assert.ok(actions.every((x) => x.status === "draft"));
  });
  await step("the grader's monthly P&L downloads from the browser, with nothing uploaded", async () => {
    await a.goto(`${APP}/grader`);
    const rows = ["2026-08", "2026-09", "2026-10"].flatMap((m) => [`${m}-01,GUSTO PAYROLL,-5000.00`, `${m}-05,STRIPE TRANSFER,3000.00`, `${m}-09,FIGMA,-45.00`]);
    const sent = [];
    a.on("request", (r) => r.postData()?.includes("GUSTO PAYROLL") && sent.push(r.url()));
    await a.setInputFiles('input[type="file"]', { name: "checking.csv", mimeType: "text/csv", buffer: Buffer.from(["Date,Description,Amount", ...rows, "2026-10-31,FIGMA,-1.00"].join("\n")) });
    await a.getByLabel(/Today's total cash/).fill("100000");
    await a.getByRole("button", { name: "Grade my runway" }).click();
    const [dl] = await Promise.all([a.waitForEvent("download"), a.getByRole("button", { name: "Download monthly P&L (CSV)" }).click()]);
    const lines = readFileSync(await dl.path(), "utf8").replace(/^\uFEFF/, "").trim().split("\r\n");
    assert.equal(lines[0], "Category,Aug 2026,Sep 2026,Oct 2026,Total");
    assert.equal(lines.at(-1), "Net cash flow,-2045,-2045,-2046,-6136");
    assert.deepEqual(sent, []);
  });
  await step("company pages send a signed-out visitor to sign in; the APIs answer 401", async () => {
    await a.goto(`${APP}/app?mode=company`);
    assert.match(a.url(), /\/login\?next=/);
    assert.equal((await a.request.post(`${APP}/api/uploads`, { data: { cashCents: 1, rows: [] } })).status(), 401);
  });
  await step("someone who isn't invited gets no link", async () => {
    assert.equal(await signIn(a, "waiting@initech.example"), false);
  });
  await step("an invited founder signs in by magic link and lands on onboarding; the link works once", async () => {
    await signIn(a, "founder-a@acme.example");
    await a.waitForURL(/\/app\/upload$/);
    const res = await fetch(`${process.env.E2E_AUTH ?? "http://localhost:9999"}/__last_link?email=founder-a%40acme.example`);
    const again = await (await browser.newContext()).newPage();
    await again.goto((await res.json()).link);
    assert.match(again.url(), /\/login\?error=link/);
  });
  await step("they upload exports and see their own dashboard", async () => {
    await uploadSample(a);
    await a.goto(`${APP}/app?mode=company`);
    await a.getByText(/· your uploaded exports/).waitFor();
    assert.equal((await a.request.get(`${APP}/api/export?mode=company&kind=recurring`)).status(), 200);
  });
  const b = await (await browser.newContext()).newPage();
  await step("a second founder sees an empty company, not the first one's", async () => {
    await signIn(b, "founder-b@globex.example");
    await b.waitForURL(/\/app\/upload$/);
    assert.equal(await b.getByRole("heading", { name: "Stored for your company", exact: true }).count(), 0);
    assert.notEqual((await b.request.get(`${APP}/api/export?mode=company&kind=recurring`)).status(), 200);
    const forged = await b.request.get(`${APP}/api/export?mode=company&kind=recurring`, { headers: { "x-runway-user-id": "00000000-0000-0000-0000-000000000000" } });
    assert.notEqual(forged.status(), 200);
  });
  await step("signing out ends the session, even for a copy of the old cookies", async () => {
    const cookies = await a.context().cookies();
    await a.goto(`${APP}/app?mode=company`);
    await a.getByRole("button", { name: "Sign out" }).click();
    await a.waitForURL(`${APP}/`);
    const replay = await browser.newContext();
    await replay.addCookies(cookies);
    assert.equal((await replay.request.get(`${APP}/api/export?mode=company&kind=recurring`)).status(), 401);
  });
});
