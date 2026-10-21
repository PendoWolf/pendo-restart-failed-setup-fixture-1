import type { Account, User } from "../types.js";

// Pendo Track Events for outcomes only the API knows. The web app's clicks are Pendo Features, but a click can't
// tell whether its request worked: these say that a trip, user or account was really created, changed or removed,
// and how an assistant reply ended. They go to Pendo's server-side Track Event API.

/** The Track Events the API sends. Pendo matches on these exact names, so never rename one. */
export type TrackEventName =
  | "trip_created"
  | "trip_updated"
  | "trip_deleted"
  | "assistant_reply_generated"
  | "assistant_reply_failed"
  | "user_created"
  | "user_role_changed"
  | "user_removed"
  | "account_created"
  | "account_plan_changed"
  | "account_deleted";

type TrackEventValue = string | number | boolean | string[];

/**
 * What a Track Event tells Pendo besides its name: never personal details (emails, names, chat messages) or
 * secrets. Values that are undefined, null or not a finite number are left out.
 */
export type TrackEventProperties = Record<string, TrackEventValue | null | undefined>;

/** Where Track Events go unless PENDO_DATA_HOST says otherwise. */
const DEFAULT_DATA_HOST = "data.pendo-dev.pendo-dev.com";

/**
 * The longest string sent for a property. Pendo turns away events whose properties are over 512 bytes, and some
 * values, such as a trip's destination, are free text.
 */
const MAX_STRING_LENGTH = 100;

let warnedAboutMissingSecret = false;

/**
 * Sends a Track Event to Pendo for the signed-in `user` (the Pendo visitor) and their `account`. It runs in the
 * background, so it never holds up or breaks the response: a failure is only logged. Nothing is sent while
 * PENDO_TRACK_EVENT_SECRET is unset.
 */
export function trackEvent(
  event: TrackEventName,
  user: User,
  account: Account,
  properties: TrackEventProperties,
): void {
  send(event, user, account, properties).catch((error: unknown) => {
    console.error(`Couldn't send the Pendo Track Event "${event}":`, error);
  });
}

async function send(
  event: TrackEventName,
  user: User,
  account: Account,
  properties: TrackEventProperties,
): Promise<void> {
  const secret = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!secret) {
    if (!warnedAboutMissingSecret) {
      warnedAboutMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so no Pendo Track Events are sent.");
    }
    return;
  }
  const response = await fetch(`https://${process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: user.id,
      accountId: account.id,
      timestamp: Date.now(),
      properties: cleanProperties(properties),
    }),
    // So a slow Pendo can't pile up open requests.
    signal: AbortSignal.timeout(5000),
  });
  // Read the body even on success, so the connection can be reused.
  const answer = await response.text();
  if (!response.ok) {
    throw new Error(`Pendo answered ${response.status}: ${answer.slice(0, 200)}`);
  }
}

/** The properties as sent: without empty or non-finite values, and with long strings cut short. */
function cleanProperties(properties: TrackEventProperties): Record<string, TrackEventValue> {
  const cleaned: Record<string, TrackEventValue> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (value === undefined || value === null || (typeof value === "number" && !Number.isFinite(value))) continue;
    cleaned[name] = typeof value === "string" ? value.slice(0, MAX_STRING_LENGTH) : value;
  }
  return cleaned;
}
