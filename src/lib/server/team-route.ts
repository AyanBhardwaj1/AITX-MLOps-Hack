import "server-only";
import { NextResponse } from "next/server";
import { accessErrorResponse } from "./errors";

/** Shared error handling for the team routes: expected access errors, else a logged 500. */
export function teamError(err: unknown, what: string): NextResponse {
  const known = accessErrorResponse(err);
  if (known) return known;
  console.error(`[team] ${what} failed`, err instanceof Error ? err.message : "unknown error");
  return NextResponse.json({ error: "That didn’t go through. Try again." }, { status: 500 });
}
