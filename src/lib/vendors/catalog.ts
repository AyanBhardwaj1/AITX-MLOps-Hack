import type { Category } from "../types";

export interface CatalogEntry {
  key: string;
  name: string;
  category: Category;
  /** Job-to-be-done. Two active vendors with the same job are overlapping tools. */
  job: string | null;
  /** Raw alias strings; matched after the same cleaning as bank descriptors. */
  aliases: string[];
}

/**
 * Known vendors. Rules before models: anything matched here never costs an LLM call.
 * Jobs are deliberately narrow so legitimate pairs (Slack + Zoom) are not flagged.
 */
export const VENDOR_CATALOG: readonly CatalogEntry[] = [
  // Communication
  { key: "slack", name: "Slack", category: "software", job: "team_chat", aliases: ["slack"] },
  { key: "microsoft_teams", name: "Microsoft Teams", category: "software", job: "team_chat", aliases: ["microsoft teams", "msft teams"] },
  { key: "zoom", name: "Zoom", category: "software", job: "video_meetings", aliases: ["zoom.us", "zoom video", "zoom"] },
  { key: "webex", name: "Webex", category: "software", job: "video_meetings", aliases: ["webex", "cisco webex"] },
  { key: "loom", name: "Loom", category: "software", job: "async_video", aliases: ["loom"] },
  { key: "google_workspace", name: "Google Workspace", category: "software", job: "email_docs", aliases: ["google *gsuite", "gsuite", "google workspace", "google *workspace"] },
  { key: "microsoft_365", name: "Microsoft 365", category: "software", job: "email_docs", aliases: ["microsoft 365", "msft *office", "office 365"] },
  // Work management
  { key: "notion", name: "Notion", category: "software", job: "docs_wiki", aliases: ["notion"] },
  { key: "confluence", name: "Confluence", category: "software", job: "docs_wiki", aliases: ["atlassian *confluence", "confluence"] },
  { key: "jira", name: "Jira", category: "software", job: "project_mgmt", aliases: ["atlassian *jira", "jira"] },
  { key: "linear", name: "Linear", category: "software", job: "project_mgmt", aliases: ["linear"] },
  { key: "asana", name: "Asana", category: "software", job: "project_mgmt", aliases: ["asana"] },
  { key: "miro", name: "Miro", category: "software", job: "whiteboard", aliases: ["miro"] },
  { key: "calendly", name: "Calendly", category: "software", job: "scheduling", aliases: ["calendly"] },
  { key: "docusign", name: "DocuSign", category: "software", job: "esign", aliases: ["docusign"] },
  { key: "one_password", name: "1Password", category: "software", job: "password_mgr", aliases: ["1password", "agilebits"] },
  // Engineering
  { key: "github", name: "GitHub", category: "software", job: "code_hosting", aliases: ["github"] },
  { key: "gitlab", name: "GitLab", category: "software", job: "code_hosting", aliases: ["gitlab"] },
  { key: "datadog", name: "Datadog", category: "software", job: "observability", aliases: ["datadog"] },
  { key: "new_relic", name: "New Relic", category: "software", job: "observability", aliases: ["new relic", "newrelic"] },
  { key: "sentry", name: "Sentry", category: "software", job: "error_tracking", aliases: ["sentry"] },
  { key: "vercel", name: "Vercel", category: "cloud", job: "frontend_hosting", aliases: ["vercel"] },
  { key: "aws", name: "AWS", category: "cloud", job: null, aliases: ["aws", "amazon web services"] },
  { key: "gcp", name: "Google Cloud", category: "cloud", job: null, aliases: ["google *cloud", "google cloud"] },
  { key: "openai", name: "OpenAI", category: "ai_api", job: null, aliases: ["openai"] },
  { key: "anthropic", name: "Anthropic", category: "ai_api", job: null, aliases: ["anthropic"] },
  // Design
  { key: "figma", name: "Figma", category: "software", job: "design", aliases: ["figma"] },
  { key: "canva", name: "Canva", category: "software", job: "design_lite", aliases: ["canva"] },
  // Go-to-market
  { key: "hubspot", name: "HubSpot", category: "software", job: "crm", aliases: ["hubspot"] },
  { key: "salesforce", name: "Salesforce", category: "software", job: "crm", aliases: ["salesforce"] },
  { key: "intercom", name: "Intercom", category: "software", job: "support_chat", aliases: ["intercom"] },
  { key: "zendesk", name: "Zendesk", category: "software", job: "support_chat", aliases: ["zendesk"] },
  { key: "google_ads", name: "Google Ads", category: "marketing", job: null, aliases: ["google *ads", "google ads"] },
  { key: "linkedin_ads", name: "LinkedIn Ads", category: "marketing", job: null, aliases: ["linkedin"] },
  // People and office
  { key: "gusto", name: "Gusto Payroll", category: "payroll", job: null, aliases: ["gusto"] },
  { key: "deel", name: "Deel", category: "contractors", job: null, aliases: ["deel"] },
  { key: "brazos_properties", name: "Brazos Properties (rent)", category: "rent", job: null, aliases: ["brazos properties"] },
  { key: "vouch", name: "Vouch Insurance", category: "insurance", job: null, aliases: ["vouch"] },
  { key: "pilot", name: "Pilot (bookkeeping)", category: "legal_accounting", job: null, aliases: ["pilot.com"] },
  { key: "carta", name: "Carta", category: "legal_accounting", job: null, aliases: ["carta"] },
  { key: "wilson_sonsini", name: "Wilson Sonsini (legal)", category: "legal_accounting", job: null, aliases: ["wilson sonsini"] },
  // Travel and meals
  { key: "united", name: "United Airlines", category: "travel", job: null, aliases: ["united airlines", "united air"] },
  { key: "uber", name: "Uber", category: "travel", job: null, aliases: ["uber trip", "uber"] },
  { key: "doordash", name: "DoorDash", category: "meals", job: null, aliases: ["doordash"] },
  { key: "apple", name: "Apple", category: "hardware", job: null, aliases: ["apple store", "apple.com"] },
  // Money in and bank
  { key: "stripe", name: "Stripe payouts", category: "revenue", job: null, aliases: ["stripe"] },
  { key: "bank_fees", name: "Bank fees", category: "fees", job: null, aliases: ["wire fee", "service fee", "foreign transaction fee"] },
];

const JOB_LABELS: Readonly<Record<string, string>> = {
  crm: "CRM",
  docs_wiki: "docs & wiki",
  email_docs: "email & docs",
  esign: "e-signature",
  password_mgr: "password management",
};

/** Human-readable job-to-be-done, e.g. "video_meetings" → "video meetings". */
export function jobLabel(job: string): string {
  return JOB_LABELS[job] ?? job.replaceAll("_", " ");
}
