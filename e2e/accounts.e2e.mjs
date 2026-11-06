// Sign in, upload, see your own dashboard, sign out; another founder sees none of it.
import assert from "node:assert/strict";
import { APP, signIn, suite, uploadSample } from "./helpers.mjs";

await suite("accounts", async ({ browser, step }) => {
  const a = await (await browser.newContext()).newPage();
  await step("the demo works without signing in, and the public pages stay public", async () => {
    await a.goto(`${APP}/app?mode=demo`);
    await a.getByText("Taco Robotics, Inc. · synthetic demo data").waitFor();
    // 1099s: the demo's law firm and landlord, paid by bank; the CSV lists them.
    const prep = a.getByRole("region", { name: /^1099s for \d{4}$/ });
    await prep.getByRole("link", { name: "Wilson Sonsini (legal)" }).waitFor();
    const csv = await (await a.request.get(`${APP}/api/export?mode=demo&kind=1099`)).text();
    assert.match(csv, /Brazos Properties \(rent\),1099-MISC,\d{4},/);
    for (const path of ["/", "/grader", "/privacy", "/security"]) assert.equal((await a.goto(APP + path)).status(), 200, path);
    // Installable: the page links the manifest, which opens on the app.
    const href = await a.locator('link[rel="manifest"]').getAttribute("href");
    const manifest = await (await fetch(new URL(href, APP))).json();
    assert.equal(manifest.start_url, "/app");
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
