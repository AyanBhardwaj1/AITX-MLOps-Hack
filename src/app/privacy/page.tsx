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
      updated="2026-11-06"
      sections={[
        {
          heading: "What we collect",
          body: (
            <ul className="bullet-list space-y-2">
              <li>
                <strong>Early-access list:</strong> your email, the role and bank you chose, which part of the site you signed up from, and the time.
              </li>
              <li>
                <strong>Your account:</strong> the email you sign in with, the company created for you (named from your email’s domain), and a session
                cookie set only once you sign in. If you invite teammates, their email addresses, so they can join when they sign in; the owner can
                withdraw an invite or remove a teammate at any time. Decisions on findings, and the company&apos;s activity log (uploads,
                cash and budget changes, deletions, team and settings changes), show the email of whoever made them, and stay with the company&apos;s records after
                that person leaves.
              </li>
              <li>
                <strong>Uploaded bank exports:</strong> your files are read in your browser. Only the transaction rows are sent and stored for your
                company: date, description, amount, the account name you give each file (for an OFX, Quicken or QuickBooks download, with the
                account number’s last four digits and its kind, such as “savings”), and the cardholder where the export has one, plus the
                cash balance you enter. Full account numbers and a download’s balances stay in your browser. Nobody else’s account can read them.
              </li>
              <li>
                <strong>Connected bank data:</strong> account names and balances and the transaction history your bank’s API returns (the
                analysis uses the last twelve months), including vendor descriptions and the cardholder on each card charge. Runway only calls
                read endpoints. We never see or store your bank login.
              </li>
              <li>
                <strong>What you do in the app:</strong> findings you accept or dismiss, drafts you approve, monthly budgets you set, and agent run
                summaries, so the app remembers your decisions.
              </li>
              <li>
                <strong>The free grader:</strong> nothing. Your CSV is read in your browser and never uploaded.
              </li>
            </ul>
          ),
        },
        {
          heading: "What we don’t do",
          body: (
            <p>
              We don’t sell or rent your data, show ads, or use advertising or analytics trackers. The public site sets no cookies (signing in sets a session cookie); the live demo keeps any category fixes you make in a cookie in your own browser, so nobody else sees them. Bank data is used only to
              produce your own analysis.
            </p>
          ),
        },
        {
          heading: "Who processes it",
          body: (
            <ul className="bullet-list space-y-2">
              <li>Vercel hosts the app.</li>
              <li>Supabase stores the database (Postgres), in the region the deployment is configured for, and handles sign-in: it holds your email and sends your sign-in links.</li>
              <li>
                OpenAI, only when AI features are switched on. It receives the transaction descriptions of unfamiliar vendors (to label them); when
                you ask Copilot a question, the computed figures and the individual transactions it looks up (date, amount, vendor, category and
                cardholder name); and the context needed to write drafts.
              </li>
              <li>Slack, only if your company connects its own channel for the Monday digest: it receives the digest text, and a short note the day a budget goes over (the company name, the category, the month, the amount spent and the budget, with a link back to Runway), and one the day runway drops under 12, 6 or 3 months (the runway, net burn and zero-cash date). The webhook address is kept on the server and never shown in full.</li>
            </ul>
          ),
        },
        {
          heading: "How long we keep it",
          body: (
            <p>
              Early-access entries are kept until early access ends or you ask us to remove yours. Uploaded transactions are kept until you delete them.
              The upload page downloads them all as a CSV whenever you like, deletes one account&apos;s rows, or deletes every row, the cash you entered
              and everything worked out from them (findings, drafts, fixes and share links) at once. The owner can also delete the whole company from its settings page. Connected bank data is kept while your account is active and
              deleted when you disconnect and ask for deletion. To remove your sign-in email as well, ask us.
            </p>
          ),
        },
        {
          heading: "Your choices",
          body: (
            <p>
              You can download a copy of everything held for your company yourself, from its settings page. You can also ask what we hold
              about you, ask for a copy, or ask for it to be deleted, at any time. <ContactLine email={email} />
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
