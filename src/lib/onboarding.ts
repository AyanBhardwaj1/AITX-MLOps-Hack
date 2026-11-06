/** The first things a new company does in Runway, each ticked off from what it has actually done. */

export interface GettingStartedInput {
  uploaded: boolean;
  /** Findings someone accepted or dismissed. */
  decidedFindings: number;
  /** People in the company, counting pending invites. */
  teamSize: number;
  shareLinks: number;
}

export interface GettingStartedStep {
  key: "upload" | "review" | "team" | "share";
  title: string;
  detail: string;
  href: string;
  done: boolean;
}

export function gettingStarted(input: GettingStartedInput): { steps: GettingStartedStep[]; remaining: number } {
  const steps: GettingStartedStep[] = [
    { key: "upload", title: "Upload your bank exports", detail: "Bank and card CSVs plus today's cash.", href: "/app/upload", done: input.uploaded },
    { key: "review", title: "Review a finding", detail: "Accept or dismiss what Runway found.", href: "#waste-found", done: input.decidedFindings > 0 },
    { key: "team", title: "Invite a teammate", detail: "Your cofounder or finance lead.", href: "/app/settings", done: input.teamSize > 1 },
    { key: "share", title: "Share with investors", detail: "A read-only link to cash, burn and runway.", href: "#share-with-investors", done: input.shareLinks > 0 },
  ];
  return { steps, remaining: steps.filter((s) => !s.done).length };
}
