import type { Metadata } from "next";
import { ContactLine, LegalPage } from "@/components/landing/legal-page";
import { env } from "@/lib/server/env";
import "../landing.css";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Runway during early access.",
};

export default function TermsPage() {
  const email = env().CONTACT_EMAIL;
  return (
    <LegalPage
      title="Terms"
      intro="Plain terms for early access. A fuller agreement comes with paid plans."
      updated="November 2, 2026"
      sections={[
        {
          heading: "Early access",
          body: (
            <p>
              Runway is in early access. Features change, things can break, and we may pause or end early access. Joining the list doesn&apos;t guarantee a
              place or a price.
            </p>
          ),
        },
        {
          heading: "Not financial advice",
          body: (
            <p>
              Runway shows estimates computed from your transactions. They are not accounting, tax, legal or investment advice. You decide what to cancel, cut or
              raise, and you are responsible for those decisions.
            </p>
          ),
        },
        {
          heading: "Your data and your account",
          body: (
            <p>
              Your financial data stays yours; we use it only to run Runway for you, as the privacy page describes. Connect only accounts you are authorised to
              share, and keep your password private.
            </p>
          ),
        },
        {
          heading: "Fair use",
          body: (
            <p>
              Don&apos;t try to break, overload or get around the app&apos;s security, read other people&apos;s data, or use Runway for anything unlawful. We may
              suspend access that does.
            </p>
          ),
        },
        {
          heading: "No warranty",
          body: (
            <p>
              During early access Runway is provided as is, without warranties. To the extent the law allows, we aren&apos;t liable for indirect losses or for
              decisions made from its estimates.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              <ContactLine email={email} />
            </p>
          ),
        },
      ]}
    />
  );
}
