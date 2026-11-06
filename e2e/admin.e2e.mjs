// Its own people (ops@ runs the deployment, and isn't on the waitlist: operators need no invite).
// Sign-in links are limited per inbox, and other suites use theirs.
// The operator's early-access page: invite from the waitlist without SQL; invisible to everyone else.
import assert from "node:assert/strict";
import { APP, signIn, suite } from "./helpers.mjs";

await suite("admin", async ({ browser, step }) => {
  const operator = await (await browser.newContext()).newPage();
  await step("a founder who isn't an operator gets a page that doesn't exist", async () => {
    const p = await (await browser.newContext()).newPage();
    assert.ok(await signIn(p, "outsider@stark.example"));
    await p.waitForURL(/\/app/);
    const res = await p.goto(`${APP}/admin`);
    assert.equal(res.status(), 404);
    await p.getByText("Page not found").waitFor();
    assert.doesNotMatch(await p.title(), /Early access/);
    assert.equal(await p.getByText("Latest signups").count(), 0);
    const api = await p.request.post(`${APP}/api/admin/invite`, { data: { email: "sneaky@example.com" }, headers: { origin: APP } });
    assert.equal(api.status(), 404);
  });
  await step("the operator sees who is waiting and invites a new founder", async () => {
    assert.ok(await signIn(operator, "ops@runway.example"));
    await operator.waitForURL(/\/app/);
    await operator.goto(`${APP}/app/settings`);
    await operator.getByRole("link", { name: "Early access" }).click();
    await operator.waitForURL(/\/admin$/);
    const table = operator.getByRole("region", { name: "Signups table" });
    await table.getByRole("row", { name: /waiting@initech\.example/ }).getByRole("button", { name: /Invite/ }).waitFor();
    await operator.getByLabel("Invite any email").fill("newcomer@hooli.example");
    await operator.getByRole("button", { name: "Invite", exact: true }).click();
    await operator.getByText("Invited newcomer@hooli.example. They can sign in at /login now.").waitFor();
    await table.getByRole("row", { name: /newcomer@hooli\.example/ }).getByText("Invited").waitFor();
  });
  await step("the invited founder can now sign in and start a company", async () => {
    const p = await (await browser.newContext()).newPage();
    assert.ok(await signIn(p, "newcomer@hooli.example"));
    await p.waitForURL(/\/app\/upload/);
  });
});
