import { chargeDates } from "../finance/schedule";
import { formatMoney } from "../format";
import type { Renewal } from "../finance/renewals";

/**
 * Renewals worth deciding on as an iCalendar file (RFC 5545), so they land in the calendar a
 * founder already lives in, with a reminder while there's still time to cancel or renegotiate.
 * Pure: amounts come from the detected streams, in integer cents.
 */

/** How far ahead the calendar reaches: one year covers every annual renewal once. */
const HORIZON_DAYS = 365;
/** Two weeks is enough to cancel, downgrade or ask for a better price. */
const REMIND_DAYS_BEFORE = 14;
const DAY_MS = 86_400_000;

/**
 * RFC 5545 TEXT escaping: backslash, semicolon, comma, and every line break (CR, LF or both) as
 * "\\n"; other control characters are dropped, so text from a bank file can't start a new line.
 */
const text = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u001f\u007f]/g, "");

/** Lines of at most 75 octets, continued with a leading space, never splitting a character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines spend one octet on the space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const day = (iso: string) => iso.replaceAll("-", "");
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
const stamp = (d: Date) => `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

export function renewalsCalendar({ renewals, company, now, link }: { renewals: readonly Renewal[]; company: string; now: Date; link?: string }): string {
  const today = now.toISOString().slice(0, 10);
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + HORIZON_DAYS * DAY_MS).toISOString().slice(0, 10);
  const due = renewals.filter((r) => r.decide).flatMap((r) => chargeDates(r, today, until).map((dueDate) => ({ ...r, dueDate })));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Runway//Renewals//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(`${company} renewals (Runway)`)}`,
  ];
  for (const r of due) {
    const amount = formatMoney(r.amountCents);
    const card = r.cardholder ? ` on ${r.cardholder}’s card` : "";
    const description = `Expected from your past charges: about ${amount}${card}, ${r.cadence}. Cancel, downgrade or renegotiate before it renews.${link ? ` ${link}` : ""}`;
    lines.push(
      "BEGIN:VEVENT",
      // The same vendor, card and date keep one identity, so importing a fresh copy updates it.
      `UID:renewal-${slug(r.vendorKey)}-${slug(r.cardholder ?? "")}-${day(r.dueDate)}@runway`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${day(r.dueDate)}`,
      `DTEND;VALUE=DATE:${day(nextDay(r.dueDate))}`,
      `SUMMARY:${text(`${r.vendorName} renews: ${amount} (${r.cadence})`)}`,
      `DESCRIPTION:${text(description)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${text(`${r.vendorName} renews in ${REMIND_DAYS_BEFORE} days`)}`,
      `TRIGGER:-P${REMIND_DAYS_BEFORE}D`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
