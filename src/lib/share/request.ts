import { z } from "zod";
import { DATA_MODES, type DataMode } from "../modes";
import { isStoreError, type Store } from "../store/types";
import type { ShareSnapshot } from "./snapshot";
import { hashShareToken } from "./token";

/** Enough for every investor conversation at once; stops runaway link creation. */
export const MAX_ACTIVE_LINKS = 20;
export const EXPIRY_DAYS = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

type Mode = DataMode;
const mode = z.enum(DATA_MODES);
const request = z.discriminatedUnion("action", [
  z.object({
    mode,
    action: z.literal("create"),
    days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    label: z.string().trim().max(80).optional(),
    /** The name investors see at the top of the page. */
    company: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({ mode, action: z.literal("revoke"), id: z.string().max(64) }),
]);

export interface ShareDeps {
  storeFor: (mode: Mode) => Pick<Store, "createShareLink" | "revokeShareLink"> | Promise<Pick<Store, "createShareLink" | "revokeShareLink">>;
  /** Today's numbers for this data source, frozen into the link. */
  snapshotFor: (mode: Mode, company?: string) => Promise<ShareSnapshot>;
  /** False where the app refuses to show the data (a real account with no password set). */
  canWrite: (mode: Mode) => boolean;
  now: () => Date;
  newToken: () => string;
  /** False where links would only live in one server's memory (hosted without DATABASE_URL). */
  storageReady: () => boolean;
}

export type ShareResult =
  | { status: 200; body: { url: string; id?: string; expiresAt?: string; sample?: true } | { ok: true } }
  | { status: 400 | 403 | 404 | 409 | 503; body: { error: string } };

export async function handleShare(raw: unknown, deps: ShareDeps): Promise<ShareResult> {
  const parsed = request.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "Invalid request" } };
  const req = parsed.data;
  // The public demo never writes: its "link" is the live sample page.
  if (req.mode === "demo") return req.action === "create" ? { status: 200, body: { url: "/s/demo", sample: true } } : { status: 404, body: { error: "Demo links can't be revoked." } };
  if (!deps.canWrite(req.mode)) return { status: 403, body: { error: "Set APP_PASSWORD before making share links." } };
  if (!deps.storageReady()) return { status: 503, body: { error: "Set DATABASE_URL to make share links: without a database they wouldn't survive." } };
  const store = await deps.storeFor(req.mode);
  if (req.action === "revoke") {
    try {
      await store.revokeShareLink(req.id);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      if (isStoreError(err, "not_found")) return { status: 404, body: { error: "That link doesn't exist." } };
      throw err;
    }
  }
  const now = deps.now();
  const token = deps.newToken();
  const expiresAt = new Date(now.getTime() + req.days * DAY_MS).toISOString();
  const created = await store.createShareLink(
    { tokenHash: hashShareToken(token), label: req.label || null, payload: await deps.snapshotFor(req.mode, req.company), expiresAt },
    MAX_ACTIVE_LINKS,
    now,
  );
  if (created === "limit") return { status: 409, body: { error: `You can have ${MAX_ACTIVE_LINKS} active links. Revoke one to make another.` } };
  return { status: 200, body: { url: `/s/${token}`, id: created.id, expiresAt } };
}
