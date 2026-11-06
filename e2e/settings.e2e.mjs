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
    await p.getByLabel("Company name").fill("Acme Robotics");
    await p.getByRole("button", { name: "Save name" }).click();
    await p.getByText("Saved.").waitFor();
    await uploadSample(p);
    await p.goto(`${APP}/app?mode=company`);
    await p.getByText("Acme Robotics · your uploaded exports").waitFor();
    await p.goto(`${APP}/app/settings`);
    const activity = p.getByRole("region", { name: "Recent activity" });
    await activity.getByText(/Uploaded [\d,]+ transactions · founder-a@acme\.example/).waitFor();
    await activity.getByText("Renamed the company to Acme Robotics · founder-a@acme.example").waitFor();
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
