import type { Metadata } from "next";
import { ContactLine, LegalPage } from "@/components/landing/legal-page";
import { env } from "@/lib/server/env";
import "../landing.css";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Runway collects, why, who processes it, and how to have it deleted.",
};

export default function PrivacyPage() {
  const email = env().CONTACT_EMAIL;
  return (
    <LegalPage
      title="Privacy"
      intro="Runway reads financial data so it can tell you about your runway. Here is exactly what it keeps and why."
      updated="November 2, 2026"
      sections={[
        {
          heading: "What we collect",
          body: (
            <ul className="bullet-list space-y-2">
              <li>
                <strong>Early-access list:</strong> your email, the role and bank you chose, which part of the site you signed up from, and the time.
              </li>
              <li>
                <strong>Connected bank data:</strong> account names and balances and up to twelve months of transactions, read through your bank&apos;s
                read-only API. We never see or store your bank login.
              </li>
              <li>
                <strong>What you do in the app:</strong> findings you accept or dismiss, drafts you approve, and agent run summaries, so the app remembers
                your decisions.
              </li>
              <li>
                <strong>The free grader:</strong> nothing. Your CSV is read in your browser and never uploaded.
              </li>
            </ul>
          ),
        },
        {
          heading: "What we don't do",
          body: (
            <p>
              We don&apos;t sell or rent your data, show ads, or use advertising or analytics trackers. The public site sets no cookies. Bank data is used only to
              produce your own analysis.
            </p>
          ),
        },
        {
          heading: "Who processes it",
          body: (
            <ul className="bullet-list space-y-2">
              <li>Vercel hosts the app.</li>
              <li>Supabase stores the database (Postgres), in the region the deployment is configured for.</li>
              <li>
                OpenAI, only when AI features are switched on: it receives vendor names and amounts to label unfamiliar vendors, the computed numbers to
                answer your questions, and the context needed to write drafts.
              </li>
              <li>Slack, only if you connect the Monday digest: it receives the digest text.</li>
            </ul>
          ),
        },
        {
          heading: "How long we keep it",
          body: (
            <p>
              Early-access entries are kept until early access ends or you ask us to remove yours. Connected bank data is kept while your account is active and
              deleted when you disconnect and ask for deletion.
            </p>
          ),
        },
        {
          heading: "Your choices",
          body: (
            <p>
              You can ask what we hold about you, ask for a copy, or ask for it to be deleted, at any time. <ContactLine email={email} />
            </p>
          ),
        },
        {
          heading: "Changes",
          body: <p>If this policy changes in a way that matters, people on the list and connected customers hear about it before it takes effect.</p>,
        },
      ]}
    />
  );
}
