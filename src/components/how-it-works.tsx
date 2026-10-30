const STEPS = [
  { title: "Read", body: "Pulls accounts and transactions from Rho's read-only API. Runway has no way to move money." },
  { title: "Detect", body: "Plain code finds recurring charges and four kinds of waste, each linked to the transactions behind it." },
  { title: "Forecast", body: "Burn, runway and a range from 1,000 simulations of your own cash swings, plus a revenue-drop test. No AI in the math." },
  { title: "Act", body: "Copilot plans with the same numbers; Autopilot runs the monthly review. Agents only draft: you approve in the Inbox." },
];

/** A four-step tour for first-time visitors; collapsible so it stays out of the way. */
export function HowItWorks() {
  return (
    <details open className="group mb-6 rounded-xl border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold">
        How Runway works
        <span className="text-xs font-normal text-muted group-open:hidden">Show</span>
        <span className="hidden text-xs font-normal text-muted group-open:inline">Hide</span>
      </summary>
      <ol className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="bg-panel px-5 py-4">
            <p className="text-sm font-medium">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-xs text-brand">{i + 1}</span>
              {s.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
