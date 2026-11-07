// Sign-in returns you to the page you asked for; rename; a copy of the data; delete the company.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP, AUTH, suite, uploadSample } from "./helpers.mjs";

await suite("settings", async ({ browser, step }) => {
  const p = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await step("a signed-out visit to settings asks for sign-in and comes back to settings", async () => {
    await p.goto(`${APP}/app/settings`);
    assert.match(p.url(), /\/login\?next=%2Fapp%2Fsettings$/);
    // Ask for the link from the page we were sent to, so it remembers where we were going.
    await p.getByLabel("Work email").fill("founder-a@acme.example");
    await p.getByRole("button", { name: "Email me a sign-in link" }).click();
    await p.getByText(/a link is on its way/).waitFor();
    await p.goto((await (await fetch(`${AUTH}/__last_link?email=founder-a%40acme.example`)).json()).link);
    await p.waitForURL(`${APP}/app/settings`);
  });
  await step("renaming the company shows on the dashboard", async () => {
    // The company's name comes first on the page, before the team; deleting it comes last.
    const order = await p.evaluate(() => {
      const at = (el) => [...document.querySelectorAll("input, h2")].indexOf(el);
      const h2 = (text) => [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === text);
      return [at(document.querySelector('input[autocomplete="organization"]')), at(h2("Team")), at(h2("Delete this company"))];
    });
    assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `order ${order}`);
    // A blank name: the error is tied to the field, which takes focus.
    const nameField = p.getByLabel("Company name");
    await nameField.fill("   ");
    await p.getByRole("button", { name: "Save name" }).click();
    await p.getByText("Enter a name of 1 to 80 characters.").waitFor();
    assert.equal(await nameField.getAttribute("aria-invalid"), "true");
    assert.equal(await nameField.evaluate((el) => el === document.activeElement), true);
    await nameField.fill("Acme Robotics");
    assert.equal(await nameField.getAttribute("aria-invalid"), null);
    await p.getByRole("button", { name: "Save name" }).click();
    await p.getByText("Saved.").waitFor();
    // Focus stays on the button (it isn't disabled out from under the keyboard).
    assert.equal(await p.evaluate(() => document.activeElement?.textContent), "Save name");
    // Editing again clears the old "Saved."
    await nameField.fill("Acme Robotics Inc");
    assert.equal(await p.getByText("Saved.").count(), 0);
    await nameField.fill("Acme Robotics");
    await uploadSample(p);
    await p.goto(`${APP}/app?mode=company`);
    await p.getByText("Acme Robotics · your uploaded exports").waitFor();
    // Why burn moved: last whole month against the one before, adding up to the change.
    await p.getByRole("heading", { name: "Why burn moved" }).waitFor();
    await p.getByRole("rowheader", { name: "Change in net burn" }).waitFor();
    await p.getByRole("heading", { name: "Already scheduled: 30 days ahead" }).waitFor();
    // Spend by person: the sample's cardholders, each linked to their transactions.
    await p.getByRole("heading", { name: "Spend by person" }).waitFor();
    await p.getByRole("region", { name: "Spend by person table" }).getByRole("link").first().waitFor();
    // On the company's own uploads: who pays, the 1099 list and the monthly P&L.
    await p.getByRole("region", { name: "Who pays you" }).getByText("Stripe payouts").waitFor();
    await p.getByRole("region", { name: /^1099s for \d{4}$/ }).getByRole("link", { name: "Wilson Sonsini (legal)" }).waitFor();
    const pnl = (await (await p.request.get(`${APP}/api/export?mode=company&kind=pnl`)).text()).replace(/^\uFEFF/, "").trim().split("\r\n");
    assert.equal(pnl[0].split(",").length, 14);
    assert.match(pnl.at(-1), /^Net cash flow,/);
    // A suggested budget fills the amount from the last 3 full months, rounded up to $100.
    const budgets = p.getByRole("region", { name: "Budgets" });
    await budgets.getByLabel("Category").selectOption("software");
    await budgets.getByRole("button", { name: /^Use \$[\d,]+ as the Software budget$/ }).click();
    assert.match(await budgets.getByLabel("Per month ($)").inputValue(), /^\d+00$/);
    // While one Inbox draft saves, every Approve/Reject is unavailable, not just that draft's.
    await p.getByRole("tab", { name: "Autopilot" }).click();
    await p.getByRole("button", { name: "Run now" }).click();
    await p.getByRole("button", { name: "Open Inbox →" }).click();
    const approves = p.locator("#panel-inbox").getByRole("button", { name: /^Approve/ });
    await approves.first().waitFor();
    assert.ok((await approves.count()) >= 2);
    let release;
    const held = new Promise((r) => (release = r));
    await p.route("**/api/actions", async (route) => (route.request().method() === "POST" ? (await held, route.continue()) : route.continue()));
    await approves.first().click();
    assert.equal(await approves.nth(1).getAttribute("aria-disabled"), "true");
    assert.equal(await p.locator("#panel-inbox").getByRole("button", { name: "Reject" }).nth(1).getAttribute("aria-disabled"), "true");
    release();
    await p.waitForFunction(() => !document.querySelector('#panel-inbox [aria-disabled="true"]'));
    await p.unroute("**/api/actions");
    await p.goto(`${APP}/app/settings`);
    const activity = p.getByRole("region", { name: "Recent activity" });
    await activity.getByText(/Uploaded [\d,]+ transactions · founder-a@acme\.example/).waitFor();
    await activity.getByText("Renamed the company to Acme Robotics · founder-a@acme.example").waitFor();
  });
  await step("an investor link: made, kept on Cancel, revoked on OK, then gone for the investor", async () => {
    await p.goto(`${APP}/app?mode=company`);
    assert.equal(await p.title(), "Dashboard · Runway", "tab title");
    // Each finding's buttons say which finding; dismissing one keeps focus in the section, and Home/End
    // move between the agent tabs.
    const waste = p.locator("#waste-found");
    // The last finding: the first one's draft was approved in the Inbox above.
    const dismiss = waste.getByRole("button", { name: /^Dismiss: / }).last();
    await dismiss.waitFor();
    await dismiss.click();
    assert.equal(await p.evaluate(() => document.activeElement?.textContent), "Waste found");
    await waste.getByRole("button", { name: /^Show 1 dismissed$/ }).click();
    await waste.getByRole("button", { name: /^Restore: / }).click();
    assert.equal(await p.evaluate(() => document.activeElement?.textContent), "Waste found");
    await waste.getByRole("button", { name: /dismissed$/ }).waitFor({ state: "detached" });
    await p.getByRole("tab", { name: "Copilot" }).focus();
    await p.keyboard.press("End");
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("role")), "tab");
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("aria-selected")), "true");
    assert.notEqual(await p.evaluate(() => document.activeElement?.textContent), "Copilot");
    await p.keyboard.press("Home");
    assert.equal(await p.evaluate(() => document.activeElement?.textContent), "Copilot");
    const share = p.getByRole("region", { name: "Share with investors" });
    await share.getByRole("button", { name: "Create link" }).click();
    const url = await share.getByLabel("New share link").inputValue();
    assert.equal((await p.request.get(url)).status(), 200, "new link opens");
    const revoke = share.getByRole("button", { name: /^Revoke / });
    p.once("dialog", (d) => d.dismiss());
    await revoke.click();
    assert.equal((await p.request.get(url)).status(), 200, "kept on cancel");
    p.once("dialog", (d) => d.accept());
    await revoke.click();
    await share.getByText("Link revoked. It no longer opens.").waitFor();
    // The dead link isn't left on screen to copy.
    assert.equal(await share.getByLabel("New share link").count(), 0, "copy box gone");
    const investor = await (await browser.newContext()).newPage();
    assert.equal((await investor.goto(url)).status(), 404, "revoked link status");
    await investor.getByText("This link has expired or been turned off").waitFor();
    await investor.context().close();
    await p.goto(`${APP}/app/settings`);
  });
  await step("the team downloads a copy of everything the company holds", async () => {
    const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Download everything (JSON)" }).click()]);
    const data = JSON.parse(readFileSync(await dl.path(), "utf8"));
    assert.equal(data.company.name, "Acme Robotics");
    assert.ok(data.transactions.length > 100);
    assert.ok(data.activity.some((e) => e.detail === "Renamed the company to Acme Robotics"));
  });
  await step("deleting the company needs its name, then starts fresh", async () => {
    await p.goto(`${APP}/app/settings`);
    const del = p.getByRole("button", { name: "Delete company" });
    assert.equal(await del.isDisabled(), true);
    await p.getByLabel(/to confirm/).fill("Acme Robotics");
    await del.click();
    await p.waitForURL(/\/app\/upload$/);
    assert.equal(await p.getByRole("heading", { name: "Stored for your company", exact: true }).count(), 0);
  });
});
