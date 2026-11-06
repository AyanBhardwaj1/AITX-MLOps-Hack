// Invite a teammate; they see the company; members can't manage it; removal ends access;
// someone with an empty company of their own can accept an invite instead.
import assert from "node:assert/strict";
import { APP, signIn, suite, uploadSample } from "./helpers.mjs";

await suite("teams", async ({ browser, step }) => {
  const owner = await (await browser.newContext()).newPage();
  const mate = await (await browser.newContext()).newPage();
  const cof = await (await browser.newContext()).newPage();
  await step("the owner invites a teammate who isn't on the waitlist", async () => {
    await signIn(owner, "founder-a@acme.example");
    await owner.waitForURL(/\/app/);
    await uploadSample(owner);
    await owner.goto(`${APP}/app/settings`);
    await owner.getByLabel("Invite by email").fill("teammate@elsewhere.example");
    await owner.getByRole("button", { name: "Invite", exact: true }).click();
    await owner.getByText("Invited teammate@elsewhere.example.").waitFor();
  });
  await step("the teammate signs in and sees the owner's company", async () => {
    assert.equal(await signIn(mate, "teammate@elsewhere.example"), true);
    await mate.waitForURL(`${APP}/app?mode=company`);
    await mate.getByText(/^Acme · your uploaded exports/).waitFor();
  });
  await step("a member can't invite, remove or delete", async () => {
    await mate.goto(`${APP}/app/settings`);
    await mate.getByText(", a member of this company.").waitFor();
    assert.equal(await mate.getByLabel("Invite by email").count(), 0);
    assert.equal(await mate.getByRole("button", { name: "Delete company" }).count(), 0);
    assert.equal((await mate.request.post(`${APP}/api/company/team`, { data: { email: "x@y.example" }, headers: { Origin: APP } })).status(), 403);
    await mate.goto(`${APP}/app/upload`);
    await mate.getByRole("heading", { name: "Stored for your company", exact: true }).waitFor();
    assert.equal(await mate.getByRole("button", { name: "Delete all uploaded data" }).count(), 0);
    assert.equal((await mate.request.post(`${APP}/api/uploads/clear`, { headers: { Origin: APP } })).status(), 403);
  });
  await step("a removed teammate loses access", async () => {
    await owner.goto(`${APP}/app/settings`);
    await owner.getByRole("button", { name: "Remove" }).click();
    await owner.getByText("Removed teammate@elsewhere.example.").waitFor();
    await mate.goto(`${APP}/app?mode=company`);
    await mate.waitForURL(/\/login\?error=invite/, { timeout: 10_000 });
    assert.equal((await mate.request.get(`${APP}/api/export?mode=company&kind=recurring`)).status(), 403);
  });
  await step("someone with an empty company of their own accepts an invite instead", async () => {
    await signIn(cof, "founder-b@globex.example");
    await cof.waitForURL(/\/app\/upload$/);
    await owner.goto(`${APP}/app/settings`);
    await owner.getByLabel("Invite by email").fill("founder-b@globex.example");
    await owner.getByRole("button", { name: "Invite", exact: true }).click();
    await owner.getByText("Invited founder-b@globex.example.").waitFor();
    await cof.goto(`${APP}/app/upload`);
    await cof.getByText(/invited you to its team/).waitFor();
    await cof.goto(`${APP}/app/settings`);
    await cof.getByRole("button", { name: /^Join / }).click();
    await cof.waitForURL(`${APP}/app?mode=company`);
    await cof.getByText(/^Acme · your uploaded exports/).waitFor();
  });
  await step("a member can leave; with their own waitlist invite they start a company of their own", async () => {
    cof.on("dialog", (d) => d.accept());
    await cof.goto(`${APP}/app/settings`);
    await cof.getByRole("button", { name: "Leave this company" }).click();
    await cof.waitForURL(`${APP}/`);
    await cof.goto(`${APP}/app?mode=company`);
    await cof.waitForURL(/\/app\/upload$/, { timeout: 10_000 });
    await cof.getByRole("heading", { name: /^Set up / }).waitFor();
  });
});
