import type { Response } from "express";
import type { AuthLocals } from "../auth/require-auth.js";

// Server-side Pendo Track Events, sent to Pendo's Track Event API. They're off until PENDO_TRACK_EVENT_SECRET (the
// subscription's Track Event shared secret, kept out of the repo) is set.
const dataHost = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;
if (!trackEventSecret) {
  console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so no Pendo Track Events will be sent.");
}

/** The Track Events the API sends. Pendo matches them by their exact name, so never reword or re-case one. */
export type PendoTrackEvent =
  | "trip_created"
  | "assistant_reply_generated"
  | "assistant_reply_failed"
  | "sign_in_failed"
  | "user_created"
  | "user_role_changed"
  | "account_created"
  | "account_plan_changed"
  | "account_deleted";

/** Who an event is about: the Pendo visitor (a user's id) and account (their account's id). */
export interface PendoVisitor {
  visitorId: string;
  accountId: string;
}

/** An event's properties. Ones that are undefined, null or NaN aren't sent. */
export type PendoTrackProperties = Record<string, string | number | boolean | null | undefined>;

/** Pendo caps an event's properties at 512 bytes, so longer strings (such as free text) are cut to this length. */
const MAX_STRING_LENGTH = 100;

/** The signed-in user and their account, from what requireAuth put on res.locals. */
export function signedInVisitor(res: Response): PendoVisitor {
  const { user, account } = res.locals as AuthLocals;
  return { visitorId: user.id, accountId: account.id };
}

/** Sends a Track Event to Pendo in the background. It never throws or holds up the response: failures are logged. */
export function trackPendoEvent(event: PendoTrackEvent, visitor: PendoVisitor, properties: PendoTrackProperties): void {
  if (!trackEventSecret) return;
  sendTrackEvent(trackEventSecret, event, visitor, properties).catch((error: unknown) => {
    console.error(`Couldn't send the Pendo Track Event ${event}:`, error);
  });
}

async function sendTrackEvent(
  secret: string,
  event: PendoTrackEvent,
  visitor: PendoVisitor,
  properties: PendoTrackProperties,
): Promise<void> {
  const response = await fetch(`https://${dataHost}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: visitor.visitorId,
      accountId: visitor.accountId,
      timestamp: Date.now(),
      properties: sendableProperties(properties),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // Read the answer even on success, so the connection can be reused.
  const answer = await response.text();
  if (!response.ok) {
    throw new Error(`Pendo answered ${response.status}: ${answer.slice(0, 200)}`);
  }
}

/** The properties without empty or NaN values, which Pendo would get as null, and with long strings cut short. */
function sendableProperties(properties: PendoTrackProperties): Record<string, string | number | boolean> {
  const sendable: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    sendable[name] = typeof value === "string" ? value.slice(0, MAX_STRING_LENGTH) : value;
  }
  return sendable;
}
