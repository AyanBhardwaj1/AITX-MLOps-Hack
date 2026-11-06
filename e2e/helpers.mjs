// Shared bits for the browser suites: where things run, signing in through the fake Auth server,
// and a tiny step reporter. Every suite starts from an empty set of companies (run.sh resets them).
import { chromium } from "playwright";

export const APP = process.env.E2E_APP ?? "http://localhost:3100";
export const AUTH = process.env.E2E_AUTH ?? "http://localhost:9999";
export const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

/** Asks for a magic link in the browser, then follows it. False when no link was issued. */
export async function signIn(page, email) {
  await page.goto(`${APP}/login`);
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/a link is on its way/).waitFor();
  const res = await fetch(`${AUTH}/__last_link?email=${encodeURIComponent(email)}`);
  if (!res.ok) return false;
  await page.goto((await res.json()).link);
  return true;
}

/** Uploads the sample export from the upload page (for a company that has nothing yet). */
export async function uploadSample(page) {
  await page.goto(`${APP}/app/upload`);
  await page.getByRole("button", { name: "Fill in a sample export" }).click();
  await page.getByRole("button", { name: "Upload and analyse" }).click();
  await page.getByText(/Saved [\d,]+ new transactions/).waitFor({ timeout: 30_000 });
}

/** Runs named steps in order, stops at the first failure, prints PASS/FAIL lines, sets the exit code. */
export async function suite(name, body) {
  const browser = await chromium.launch();
  // Each browser context is a different visitor with its own address, as real users are; otherwise
  // every suite shares one IP and trips the per-IP sign-in limit (5 a minute) meant for abuse.
  const newContext = browser.newContext.bind(browser);
  let visitor = 0;
  browser.newContext = (opts = {}) => {
    visitor += 1;
    const ip = `198.51.100.${(process.pid + visitor) % 250 + 1}`;
    return newContext({ ...opts, extraHTTPHeaders: { ...(opts.extraHTTPHeaders ?? {}), "x-forwarded-for": ip } });
  };
  const results = [];
  const step = async (title, fn) => {
    try {
      await fn();
      results.push(`  PASS  ${title}`);
    } catch (err) {
      results.push(`  FAIL  ${title}: ${String(err?.message ?? err).split("\n")[0]}`);
      // Where every open page was, to tell a product bug from a test problem.
      for (const ctx of browser.contexts())
        for (const page of ctx.pages()) {
          const text = await page.locator("body").innerText().catch(() => "");
          results.push(`        at ${page.url()} :: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
        }
      throw err;
    }
  };
  try {
    await body({ browser, step });
  } catch {
    process.exitCode = 1;
  } finally {
    console.log(`${name}\n${results.join("\n")}`);
    await browser.close();
  }
}
