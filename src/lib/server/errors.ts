import "server-only";
import { NextResponse } from "next/server";

/** The request needs a signed-in user (the "company" data mode). */
export class SignInRequired extends Error {
  constructor() {
    super("Sign in to see your company.");
    this.name = "SignInRequired";
  }
}

/** The data mode isn't offered on this deployment (e.g. the env Rho feed once accounts are on). */
export class ModeUnavailable extends Error {
  constructor(message = "That data source isn't available here.") {
    super(message);
    this.name = "ModeUnavailable";
  }
}

/** The signed-in company hasn't uploaded any bank data yet. */
export class NoCompanyData extends Error {
  constructor() {
    super("Upload your bank exports to get started.");
    this.name = "NoCompanyData";
  }
}

/** The verified user wasn't invited, and sign-ups are invite-only. */
export class NotInvited extends Error {
  constructor() {
    super("Runway is invite-only for now. Join the list and we'll let you know.");
    this.name = "NotInvited";
  }
}

/** Only the company's owner can do this. */
export class OwnerOnly extends Error {
  constructor() {
    super("Only the company's owner can do that.");
    this.name = "OwnerOnly";
  }
}

/** Maps the expected access errors to a response; null for anything else (a real failure). Checked by name: route bundles each carry their own copy of these classes. */
export function accessErrorResponse(err: unknown): NextResponse | null {
  if (!(err instanceof Error)) return null;
  if (err.name === "SignInRequired") return NextResponse.json({ error: err.message }, { status: 401 });
  if (err.name === "OwnerOnly") return NextResponse.json({ error: err.message }, { status: 403 });
  if (err.name === "NotInvited") return NextResponse.json({ error: err.message }, { status: 403 });
  if (err.name === "ModeUnavailable") return NextResponse.json({ error: err.message }, { status: 403 });
  if (err.name === "NoCompanyData") return NextResponse.json({ error: err.message }, { status: 409 });
  return null;
}
