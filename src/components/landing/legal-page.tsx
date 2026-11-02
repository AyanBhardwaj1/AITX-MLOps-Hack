import { Reveal } from "./reveal";
import { REPO_URL, SiteFooter, SiteHeader } from "./site-chrome";

export interface LegalSection {
  heading: string;
  body: React.ReactNode;
}

/** Shared layout for /privacy, /security and /terms: sticky title column, readable text column. */
export function LegalPage({ title, intro, updated, sections }: { title: string; intro: string; updated: string; sections: LegalSection[] }) {
  return (
    <div className="site">
      <Reveal />
      <SiteHeader />
      <main id="main" className="wrap grid grid-cols-12 gap-x-6 gap-y-10 pb-[var(--gap-section)] pt-[clamp(32px,6vw,96px)]">
        <div className="col-span-12 lg:sticky lg:top-10 lg:col-span-4 lg:self-start">
          <h1 className="text-[length:var(--t-4)]">{title}</h1>
          <p className="mt-5 max-w-[40ch] text-[length:var(--t-2)]">{intro}</p>
          <p className="mt-4 text-[15px] text-muted">Last updated {updated}. Draft pending legal review.</p>
        </div>
        <div className="col-span-12 space-y-12 lg:col-span-7 lg:col-start-6">
          {sections.map((s) => (
            <section key={s.heading} aria-labelledby={slug(s.heading)}>
              <h2 id={slug(s.heading)} className="text-[length:var(--t-3)]">
                {s.heading}
              </h2>
              <div className="legal-body mt-4 max-w-[64ch] space-y-4 text-[length:var(--t-2)]">{s.body}</div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** How to reach us: the configured address, else replying to our email, plus public issues for non-private matters. */
export function ContactLine({ email }: { email: string | undefined }) {
  return email ? (
    <>
      Email{" "}
      <a href={`mailto:${email}`} className="text-link font-medium text-brand">
        {email}
      </a>
      .
    </>
  ) : (
    <>
      Reply to any email you have received from Runway. For anything that isn&apos;t private, you can also{" "}
      <a href={`${REPO_URL}/issues`} className="text-link font-medium text-brand">
        open an issue
      </a>
      .
    </>
  );
}
