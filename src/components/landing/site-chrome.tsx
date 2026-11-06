import Link from "next/link";

export const REPO_URL = "https://github.com/AyanBhardwaj1/AITX-MLOps-Hack";

/** Sign-in exists only where Supabase Auth is configured (these values are public, built into the app). */
const signInAvailable = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Plain bar: wordmark, four links, sign-in for invited founders, one action. */
export function SiteHeader() {
  return (
    <header className="wrap flex items-center justify-between gap-6 py-6 text-[15px]">
      <Link href="/" className="flex items-center gap-2.5 font-semibold" aria-label="Runway home">
        <span className="board w-8 text-[18px]" aria-hidden="true">
          R
        </span>
        <span className="text-[18px] tracking-tight" translate="no">
          Runway
        </span>
      </Link>
      <nav aria-label="Main" className="flex items-center gap-4 sm:gap-7">
        <Link href="/#how" className="text-link hidden md:inline">
          How it works
        </Link>
        <Link href="/security" className="text-link hidden md:inline">
          Security
        </Link>
        <Link href="/grader" className="text-link hidden sm:inline">
          Free grader
        </Link>
        <Link href="/#faq" className="text-link hidden lg:inline">
          Questions
        </Link>
        {signInAvailable() && (
          <Link href="/login" className="text-link whitespace-nowrap">
            Sign in
          </Link>
        )}
        <Link href="/#early-access" className="btn min-h-[44px] whitespace-nowrap px-4">
          Get early access
        </Link>
      </nav>
    </header>
  );
}

const WORD = [
  { ch: "R", h: 100 },
  { ch: "U", h: 82 },
  { ch: "N", h: 91 },
  { ch: "W", h: 66 },
  { ch: "A", h: 76 },
  { ch: "Y", h: 60 },
];

const LINKS = [
  {
    title: "Product",
    items: [
      { href: "/app", label: "Live demo" },
      { href: "/grader", label: "Free runway grader" },
      { href: "/#how", label: "How it works" },
    ],
  },
  {
    title: "Trust",
    items: [
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
  {
    title: "Project",
    items: [
      { href: REPO_URL, label: "Source code" },
      { href: `${REPO_URL}/issues`, label: "Report a problem" },
    ],
  },
];

/** The close: RUNWAY built from distance-marker boards, letters knocked out in white. */
export function SiteFooter() {
  return (
    <footer className="bg-[#e7ebf0] pb-8 pt-[clamp(56px,8vw,120px)]">
      <div className="wrap">
        <div className="flex h-[22svh] items-end gap-1 sm:h-[34svh]" aria-hidden="true">
          {WORD.map((l) => (
            <span key={l.ch} className="flex flex-1 items-center justify-center bg-ink font-bold leading-none text-white" style={{ height: `${l.h}%` }}>
              <span className="text-[clamp(36px,9vw,150px)]">{l.ch}</span>
            </span>
          ))}
        </div>
        <div className="mt-14 grid gap-10 text-[15px] sm:grid-cols-2 lg:grid-cols-12">
          {LINKS.map((col) => (
            <div key={col.title} className="lg:col-span-2">
              <p className="font-semibold">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="text-link">
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="space-y-2 lg:col-span-4 lg:col-start-9">
            <p>Runway started at the AITX &amp; MLOps World hackathon in Austin, October 2026, and is now its own product.</p>
            <p>Independent: not affiliated with or endorsed by Rho or any bank.</p>
          </div>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 text-[15px]">
          <p>
            © 2026 <span translate="no">Runway</span>
          </p>
          <Link href="/#early-access" className="btn btn-ink min-h-[44px] px-4">
            Get early access
          </Link>
        </div>
      </div>
    </footer>
  );
}
