import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EarlyAccessForm } from "@/components/landing/early-access-form";
import { FeedDiagram } from "@/components/landing/feed-diagram";
import { LoopVideo } from "@/components/landing/loop-video";
import { Reveal } from "@/components/landing/reveal";
import { RunwayCalculator } from "@/components/landing/runway-calculator";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { WasteSwitch } from "@/components/landing/waste-switch";
import { formatDate } from "@/lib/format";
import { demoStory } from "@/lib/landing/demo-story";
import { formatDollars } from "@/lib/money";
import type { Finding } from "@/lib/types";
import "./landing.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: { absolute: "Runway: know the day your cash runs out" },
  description:
    "Runway reads your startup’s bank feed, read-only, dates the day the cash runs out, and finds the spend pulling it closer. Every Monday, in Slack.",
  alternates: { canonical: "/" },
};

const KIND: Record<Finding["kind"], string> = {
  duplicate_tools: "Two tools, one job",
  price_creep: "Bill went up",
  zombie: "Card of someone who left",
  duplicate_charge: "Charged twice",
};

const css = (vars: Record<string, string | number>) => vars as React.CSSProperties;

type Shot = { kind: "image"; src: string; w: number; h: number; alt: string } | { kind: "video"; src: string; poster: string; label: string };

const STEPS: { name: string; text: string; shot: Shot }[] = [
  {
    name: "Read",
    text: "Connects to Rho through its read endpoints, or takes any bank’s CSV, OFX, Quicken or QuickBooks download. Accounts and transactions; nothing else.",
    shot: { kind: "image", src: "/shots/runway-summary.jpg", w: 1344, h: 496, alt: "Runway’s summary card: 12.2 months of runway, cash runs out Nov 3, 2027" },
  },
  {
    name: "Reduce",
    text: "Groups recurring charges, measures burn and checks every vendor for waste. Plain arithmetic in cents: no AI writes a number.",
    shot: { kind: "video", src: "/shots/waste-demo.mp4", poster: "/shots/waste-demo-poster.jpg", label: "Screen recording: ticking each finding in the Waste found list and watching runway grow" },
  },
  {
    name: "Report",
    text: "Monday morning, Slack gets what changed, and hears the same day a budget goes over or runway drops under 12, 6 or 3 months. Cancellation emails arrive as drafts, and nothing is sent until you approve it.",
    shot: { kind: "image", src: "/shots/this-week.jpg", w: 1344, h: 470, alt: "This week: a $14,500 legal payment and a new AI vendor, flagged with amounts" },
  },
];

const FAQ = [
  {
    q: "Which banks does it work with?",
    a: "Any bank, through its CSV exports or its OFX, Quicken (QFX) or QuickBooks (QBO) downloads: once you’re invited, you upload them from your bank and card accounts, and add fresh ones as the weeks go by. Most layouts are read as they come, including debit and credit columns and files with no header row. The free grader takes the same files. Direct connections, starting with Rho’s read-only API, come next, in the order people on the list ask for them.",
  },
  {
    q: "Can Runway move money or cancel anything?",
    a: "No. Runway only calls the bank’s read endpoints and has no code that pays, transfers or cancels. Use a read-only API token. Runway drafts cancellation emails and tickets; nothing leaves until a person approves it.",
  },
  {
    q: "Does AI see my transactions?",
    a: "Burn, runway and savings are plain arithmetic with no AI. When the AI features are on, an OpenAI model labels unfamiliar vendors, answers questions using the computed figures and the transactions it looks up, and writes drafts. The grader uses no AI and runs entirely in your browser.",
  },
  {
    q: "How accurate are the findings?",
    a: "On a synthetic company with planted waste, the detectors find every planted problem with no false alarms. Real ledgers are messier, so every finding shows the transactions behind it and how sure Runway is.",
  },
  {
    q: "What else does it show?",
    a: "Why burn moved last month, vendor by vendor. Spend by person and by category, and budgets that start from your recent spend. A calendar of renewals worth deciding on. Who pays you, and your runway if the biggest customer stopped. A monthly cash P&L for your accountant, and a list of who may need a 1099 from you. The free grader shows why burn moved and builds the P&L in your browser too.",
  },
  {
    q: "What does it cost?",
    a: "Nothing during early access. Pricing will be set before early access ends, and people on the list hear first, with time to decide.",
  },
  {
    q: "Where did Runway come from?",
    a: "It started as a hackathon project at AITX & MLOps World in Austin in October 2026, and is now an independent product. The code is public. It is not affiliated with Rho or any bank.",
  },
  {
    q: "What happens to my data?",
    a: "Early access stores your email, role and bank choice, nothing more. Once you’re in, the transactions you upload are kept for your company alone, never sold or shared, and you can download or delete them whenever you like. The privacy page has the details.",
  },
];

export default function Home() {
  const s = demoStory();
  const runway = s.runwayMonths.toFixed(1);
  const countdown = Array.from({ length: 13 }, (_, i) => 12 - i);
  return (
    <div className="site">
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <Reveal />
      <SiteHeader />

      <main id="main">
        {/* Hero: headline upper-left, a notched accent stage below carrying the live calculator. */}
        <section aria-labelledby="hero-heading" className="relative min-h-[calc(100svh-88px)] overflow-hidden pb-0" data-reveal>
          <div className="wrap grid grid-cols-12 gap-x-6 pt-[clamp(24px,7vh,96px)]">
            <h1 id="hero-heading" className="rise col-span-12 text-[length:var(--t-5)] lg:col-span-9">
              Know the day your <br className="hidden sm:inline" />
              cash runs out
            </h1>
            <div className="col-span-12 mt-6 sm:col-span-8 lg:col-span-4">
              <p className="rise max-w-[40ch] text-[length:var(--t-2)]" style={css({ "--i": 1 })}>
                Runway reads your bank feed, read-only, works out the date your cash hits zero, and finds the spend pulling that date closer.
              </p>
              <div className="rise mt-7 flex flex-wrap items-center gap-x-6 gap-y-3" style={css({ "--i": 2 })}>
                <Link href="#early-access" className="btn h-[52px] px-6 text-[18px]">
                  Get early access
                </Link>
                <Link href="/grader" className="text-link text-[15px] font-medium">
                  Or grade a bank CSV free
                </Link>
              </div>
            </div>
          </div>
          <div className="stage relative mt-10 bg-brand pl-4 pt-[calc(var(--notch)+16px)] sm:pl-14 sm:pt-[calc(var(--notch)+24px)] lg:absolute lg:bottom-0 lg:left-[36%] lg:right-0 lg:top-[36%] lg:mt-0">
            <div className="shutter">
              <div>
                <RunwayCalculator cashCents={s.cashCents} burnCents={s.netBurnCents} asOf={s.asOf} />
              </div>
            </div>
          </div>
        </section>

        <div className="h-[var(--gap-section)]" />

        <WasteSwitch
          daysGained={s.daysGained}
          wasteMonthlyCents={s.wasteMonthlyCents}
          findings={s.tiles.length}
          zeroCashDate={s.zeroCashDate!}
          zeroCashDateAfterCuts={s.zeroCashDateAfterCuts!}
        />

        {/* Proof: what it actually found, one tile per finding. */}
        <section aria-labelledby="finds-heading" className="wrap pt-[var(--gap-section)]" data-reveal>
          <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-4 lg:gap-2">
            <li className="rise col-span-2 flex min-h-[120px] flex-col justify-between bg-brand p-6 text-white lg:aspect-[3/1] lg:min-h-0">
              <h2 id="finds-heading" className="text-[length:var(--t-4)]">
                What it found
              </h2>
              <p className="mt-4 max-w-[44ch] text-[15px] text-white/90">
                In the demo company: {s.transactions.toLocaleString("en-US")} transactions, {runway} months of runway, {formatDollars(s.wasteMonthlyCents)} a month
                of waste and {formatDollars(s.oneTimeCents)} to claim back.
              </p>
            </li>
            {s.tiles.map((t, i) => (
              <li key={t.name} className="rise flex min-h-[150px] flex-col justify-between bg-[#e7ebf0] p-5 sm:p-6 lg:aspect-[3/2] lg:min-h-0" style={css({ "--i": i + 1 })}>
                <p className="text-[length:var(--t-3)] font-bold leading-tight tracking-tight">{t.name}</p>
                <p className="mt-3 text-[15px]">
                  <span className="font-semibold tabular-nums">{t.monthlyCents ? `${formatDollars(t.monthlyCents)} a month` : `${formatDollars(t.oneTimeCents)} back`}</span>
                  <span className="text-muted"> · {KIND[t.kind]}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-[70ch] text-[15px] text-muted">
            The demo company is fictional, generated with realistic billing patterns. Explore it in the{" "}
            <Link href="/app" className="text-link font-medium text-ink">
              live demo
            </Link>
            ; every number there links to the transactions behind it.
          </p>
        </section>

        {/* The band between the halves: twelve months, counting down like a runway’s distance markers. */}
        <section aria-label={`Twelve months counting down to the run-out date, ${formatDate(s.zeroCashDate!)}`} className="mt-[var(--gap-section)] bg-[#e7ebf0] py-[clamp(28px,4vw,56px)]">
          <div className="wrap">
            <ol className="countdown flex justify-between gap-1 sm:gap-2" data-reveal aria-hidden="true">
              {countdown.map((n, i) => (
                <li key={n} className="flex-1">
                  <span
                    className={`board w-full text-[clamp(16px,3.4vw,52px)] ${n === 0 ? "bg-brand" : ""}`}
                    style={css({ "--i": i })}
                  >
                    {n}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-[70ch] text-[length:var(--t-2)]">
              Every month the board counts down one. Runway tells you which number you are on, and the day it reaches zero: for the demo company,{" "}
              <strong>{formatDate(s.zeroCashDate!)}</strong>.
            </p>
          </div>
        </section>

        {/* How it works: many into one. */}
        <section id="how" aria-labelledby="how-heading" className="wrap scroll-mt-6 pt-[var(--gap-section)]" data-reveal>
          <div className="grid grid-cols-12 gap-x-6">
            <h2 id="how-heading" className="rise col-span-12 text-[length:var(--t-4)] md:col-span-6 lg:col-span-5">
              Your bank feed, <br />
              every Monday
            </h2>
            <p className="rise col-span-12 mt-5 max-w-[46ch] text-[length:var(--t-2)] md:col-span-6 md:col-start-7 md:mt-2 lg:col-span-4 lg:col-start-7" style={css({ "--i": 1 })}>
              Hundreds of transactions go in. A short list comes out: what changed, what to cut, and how far the date moves if you do.
            </p>
          </div>
          <FeedDiagram className="mt-12" />
          <ol className="mt-10 grid gap-12 md:grid-cols-3 md:gap-6">
            {STEPS.map((step, i) => (
              <li key={step.name} className="rise" style={css({ "--i": i })}>
                <h3 className="text-[length:var(--t-3)] font-bold">{step.name}</h3>
                <p className="mt-2 max-w-[38ch] text-[length:var(--t-2)]">{step.text}</p>
                <div className="mt-6 aspect-[4/3] overflow-hidden bg-[#e7ebf0]">
                  {step.shot.kind === "image" ? (
                    <Image src={step.shot.src} width={step.shot.w} height={step.shot.h} alt={step.shot.alt} sizes="(min-width: 768px) 33vw, 100vw" className="h-full w-full object-cover object-left-top" />
                  ) : (
                    <LoopVideo src={step.shot.src} poster={step.shot.poster} label={step.shot.label} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Trust: inset ink panel with the notched picture. */}
        <section aria-labelledby="trust-heading" className="mt-[var(--gap-section)] px-[10px] sm:px-5" data-reveal>
          <div className="on-dark relative overflow-hidden bg-ink px-6 pb-[min(64vw,520px)] pt-12 text-[#e2e8f0] sm:px-14 sm:pt-14 lg:min-h-[110svh] lg:pb-14">
            <h2 id="trust-heading" className="rise max-w-[12ch] text-[length:var(--t-4)] text-white">
              Reads everything. Moves nothing.
            </h2>
            <div className="mt-12 space-y-16 lg:absolute lg:left-[63%] lg:top-14 lg:mt-0 lg:w-[min(380px,32vw)]">
              <div className="rise" style={css({ "--i": 1 })}>
                <h3 className="text-[length:var(--t-3)] text-white">Read-only, by design</h3>
                <ul className="bullet-list mt-4 space-y-2 text-[length:var(--t-2)]">
                  <li>It only calls read endpoints: no code pays or transfers.</li>
                  <li>Agents write drafts. A person approves each one.</li>
                  <li>The grader never uploads your file.</li>
                </ul>
              </div>
              <div className="rise" style={css({ "--i": 2 })}>
                <h3 className="text-[length:var(--t-3)] text-white">Numbers you can check</h3>
                <p className="mt-4 text-[length:var(--t-2)]">
                  Burn, runway and savings are arithmetic on your transactions, in whole cents. Savings count as verified only when the next bill doesn’t
                  arrive.
                </p>
              </div>
              <Link href="/security" className="btn rise" style={css({ "--i": 3 })}>
                How Runway handles your data
              </Link>
            </div>
            <div className="notched absolute bottom-[-10%] left-6 w-[86vw] overflow-hidden sm:left-14 lg:w-[50vw]">
              <Image
                src="/shots/default-alive.jpg"
                width={1344}
                height={1516}
                alt="Runway’s default-alive planner: whether the demo company breaks even before its cash runs out"
                sizes="(min-width: 1024px) 50vw, 86vw"
                className="drift aspect-[4/3] w-full object-cover object-bottom"
              />
            </div>
          </div>
        </section>

        {/* FAQ: sticky heading, filled tiles, one open at a time. */}
        <section id="faq" aria-labelledby="faq-heading" className="wrap scroll-mt-6 pt-[var(--gap-section)]" data-reveal>
          <div className="grid grid-cols-12 gap-x-6 gap-y-8">
            <h2 id="faq-heading" className="rise col-span-12 text-[length:var(--t-4)] lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
              Fair questions
            </h2>
            <div className="col-span-12 space-y-1.5 lg:col-span-8 lg:space-y-2">
              {FAQ.map((item, i) => (
                <details key={item.q} name="faq" className="faq-tile rise bg-[#e7ebf0]" style={css({ "--i": i })}>
                  <summary className="flex min-h-[64px] items-center justify-between gap-6 px-5 py-4 text-[18px] font-medium sm:min-h-[72px] sm:px-6 sm:text-[length:var(--t-3)]">
                    {item.q}
                    <span className="plus" aria-hidden="true" />
                  </summary>
                  <p className="max-w-[52ch] px-5 pb-6 text-[length:var(--t-2)] sm:px-6">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA: the product’s first screen, already open. */}
        <section id="early-access" aria-labelledby="cta-heading" className="mt-[var(--gap-section)] scroll-mt-0 bg-brand text-white" data-reveal>
          <div className="wrap grid min-h-[84svh] grid-cols-12 gap-x-6 gap-y-10 py-14 lg:min-h-[90svh] lg:py-10">
            <div className="col-span-12 flex flex-col justify-start lg:col-span-6 lg:justify-end lg:pb-8">
              <h2 id="cta-heading" className="rise text-[length:var(--t-5)] leading-[0.92]">
                More months, <br />
                same cash
              </h2>
              <p className="rise mt-6 max-w-[40ch] text-[length:var(--t-2)]" style={css({ "--i": 1 })}>
                Join the early-access list. We’ll write when Runway can connect to your bank, and not otherwise.
              </p>
            </div>
            <div className="rise col-span-12 flex items-center lg:col-span-5 lg:col-start-8" style={css({ "--i": 2 })}>
              <EarlyAccessForm />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
