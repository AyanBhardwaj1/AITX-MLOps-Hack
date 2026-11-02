import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/landing/legal-page";
import { REPO_URL } from "@/components/landing/site-chrome";
import { env } from "@/lib/server/env";
import "../landing.css";

export const metadata: Metadata = {
  title: "Security",
  description: "How Runway handles bank data: read-only access, drafts that need approval, numbers without AI, and what is still being built.",
};

export default function SecurityPage() {
  const email = env().CONTACT_EMAIL;
  return (
    <LegalPage
      title="Security"
      intro="Runway is built so the worst case is a wrong number on a screen, never money moving. This page says how, and what isn't finished yet."
      updated="November 2, 2026"
      sections={[
        {
          heading: "It can't move money",
          body: (
            <>
              <p>
                Runway only calls your bank&apos;s read endpoints: accounts and transactions. There is no code path that pays, transfers or cancels anything.
              </p>
              <p>
                The agents (Copilot and Autopilot) can only create drafts. A database rule rejects any action an agent tries to create in any state other than
                draft, and nothing is sent until a person approves it.
              </p>
            </>
          ),
        },
        {
          heading: "Numbers without AI",
          body: (
            <p>
              Burn, runway, forecasts and savings are computed by deterministic code, in whole cents, from your transactions. Language models only label
              unfamiliar vendor names, answer questions using those computed numbers, and write drafts. Every finding links to the transactions behind it.
            </p>
          ),
        },
        {
          heading: "In transit and at rest",
          body: (
            <ul className="bullet-list space-y-2">
              <li>HTTPS only, with HSTS. The database connection uses TLS with certificate verification.</li>
              <li>Data lives in Postgres with row-level security on every table; the early-access list can&apos;t be read by any public or signed-in role.</li>
              <li>A strict content security policy: the app loads nothing from other sites and can&apos;t be framed.</li>
              <li>Writes from other websites are refused, and public endpoints are rate-limited.</li>
            </ul>
          ),
        },
        {
          heading: "The free grader",
          body: (
            <p>
              The <Link href="/grader" className="text-link font-medium text-brand">grader</Link> runs entirely in your browser. An automated test checks that its
              code uses no network APIs, and a browser test confirmed zero requests after the page loads.
            </p>
          ),
        },
        {
          heading: "Not finished yet",
          body: (
            <p>
              Runway is in early access. Today each deployment serves one company behind a password; per-user sign-in and team permissions come before general
              availability. Rho connections use a company API token until partner sign-in with Rho is available.
            </p>
          ),
        },
        {
          heading: "Report a vulnerability",
          body: (
            <p>
              Please report security problems privately through{" "}
              <a href={`${REPO_URL}/security/advisories/new`} className="text-link font-medium text-brand">
                GitHub&apos;s private vulnerability reporting
              </a>
              , not a public issue. <ContactLine email={email} />
            </p>
          ),
        },
      ]}
    />
  );
}
