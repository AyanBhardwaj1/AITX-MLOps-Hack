// A minimal local stand-in for Supabase Auth (GoTrue): email OTP with PKCE, token exchange, user, logout.
// The "email" is exposed at GET /__last_link?email=... instead of being sent.
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 9999);
const users = new Map(); // email -> user
const pending = new Map(); // email -> { code, challenge, method, redirectTo }
const codes = new Map(); // code -> { email, challenge, method }
const tokens = new Map(); // access token -> email
const refresh = new Map(); // refresh token -> email
const log = [];

const b64url = (buf) => Buffer.from(buf).toString("base64url");
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return [b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64url(JSON.stringify({ sub: user.id, email: user.email, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, session_id: randomUUID() })), b64url("sig")].join(".");
}
function session(email) {
  const user = users.get(email);
  const access = jwt(user);
  const rt = randomUUID();
  tokens.set(access, email);
  refresh.set(rt, email);
  return { access_token: access, refresh_token: rt, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
  const send = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(obj === undefined ? "" : JSON.stringify(obj));
  };
  log.push(`${req.method} ${url.pathname}${url.search}`);
  const path = url.pathname.replace(/^\/auth\/v1/, "");

  if (path === "/__last_link") {
    const p = pending.get(url.searchParams.get("email"));
    if (!p) return send(404, { error: "no link" });
    const sep = p.redirectTo.includes("?") ? "&" : "?";
    return send(200, { link: `${p.redirectTo}${sep}code=${p.code}` });
  }
  if (path === "/__log") return send(200, log);
  // The public settings Runway's verify:live checks (the values DEPLOY.md asks for).
  if (req.method === "GET" && path === "/settings") return send(200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: false });

  if (req.method === "POST" && path === "/otp") {
    const email = String(body.email).toLowerCase();
    if (!users.has(email)) {
      if (!body.create_user) return send(422, { code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" });
      users.set(email, { id: randomUUID(), aud: "authenticated", role: "authenticated", email, app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString(), email_confirmed_at: null });
    }
    const code = randomUUID();
    const entry = { code, challenge: body.code_challenge, method: body.code_challenge_method, redirectTo: url.searchParams.get("redirect_to") ?? "" };
    pending.set(email, entry);
    codes.set(code, { email, ...entry });
    return send(200, {});
  }
  if (req.method === "POST" && path === "/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "pkce") {
      const c = codes.get(body.auth_code);
      codes.delete(body.auth_code);
      if (!c) return send(400, { code: 400, error_code: "flow_state_not_found", msg: "invalid flow state" });
      const expected = c.method === "s256" ? b64url(createHash("sha256").update(body.code_verifier ?? "").digest()) : body.code_verifier;
      if (expected !== c.challenge) return send(400, { code: 400, error_code: "bad_code_verifier", msg: "code challenge does not match" });
      // Following the emailed link proves the address, as with real Supabase.
      users.get(c.email).email_confirmed_at ??= new Date().toISOString();
      return send(200, session(c.email));
    }
    if (grant === "refresh_token") {
      const email = refresh.get(body.refresh_token);
      if (!email) return send(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      refresh.delete(body.refresh_token);
      return send(200, session(email));
    }
  }
  if (req.method === "GET" && path === "/user") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const email = tokens.get(token);
    if (!email) return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(200, users.get(email));
  }
  if (req.method === "POST" && path === "/logout") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const email = tokens.get(token);
    for (const [t, e] of tokens) if (e === email) tokens.delete(t);
    return send(204);
  }
  send(404, { code: 404, msg: `not found: ${req.method} ${path}` });
}).listen(PORT, () => console.log(`fake gotrue on ${PORT}`));
