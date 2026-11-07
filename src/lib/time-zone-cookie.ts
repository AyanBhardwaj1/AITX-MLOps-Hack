/**
 * The founder's time zone (an IANA name such as "America/Chicago"), kept in a cookie by the app's
 * pages so the server knows the founder's "today": a row dated today in Tokyo has happened, even
 * while it's still yesterday in UTC. Functional only; it holds nothing else.
 */
export const TIME_ZONE_COOKIE = "runway_tz";
