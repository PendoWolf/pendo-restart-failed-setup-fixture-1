import type { Response } from "express";
import type { AuthLocals } from "../auth/require-auth.js";

/**
 * The Track Events the API sends to Pendo. Pendo counts each one under this exact name, so renaming one would start
 * a new, empty event.
 */
export type PendoTrackEvent =
  | "sign_in_failed"
  | "trip_created"
  | "assistant_reply_generated"
  | "assistant_reply_failed"
  | "user_added"
  | "user_role_changed"
  | "account_created"
  | "account_plan_changed"
  | "account_deleted";

/** Who a Track Event is credited to in Pendo: a user's id and their account's id. */
export interface PendoVisitor {
  visitorId: string;
  accountId: string;
}

/** A Track Event's details; undefined ones are left out. Never put emails, names, passwords or chat text here. */
export type PendoTrackProperties = Record<string, string | number | boolean | undefined>;

/** For an event no user can be credited with, such as a sign-in with an email that no user has. */
export const SYSTEM_VISITOR: PendoVisitor = { visitorId: "system", accountId: "system" };

// The integration key is a secret, so it only comes from the environment. Without it, no events are sent.
const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
const trackUrl = `https://${process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com"}/data/track`;
// Pendo takes at most 512 bytes of properties per event, so long strings (free text such as a destination) are cut.
const MAX_STRING_LENGTH = 100;

let warnedAboutMissingKey = false;

/** The signed-in user and their account, from what requireAuth put on res.locals. */
export function signedInVisitor(res: Response): PendoVisitor {
  const { user, account } = res.locals as AuthLocals;
  return { visitorId: user.id, accountId: account.id };
}

/**
 * Sends a Track Event to Pendo's server-side Track API in the background. The route doesn't wait for it and it never
 * throws: a failed send is only logged, so tracking can't slow down or break a request.
 */
export function trackPendoEvent(
  event: PendoTrackEvent,
  visitor: PendoVisitor,
  properties: PendoTrackProperties,
): void {
  void sendTrackEvent(event, visitor, properties);
}

async function sendTrackEvent(
  event: PendoTrackEvent,
  visitor: PendoVisitor,
  properties: PendoTrackProperties,
): Promise<void> {
  if (!integrationKey) {
    if (!warnedAboutMissingKey) {
      warnedAboutMissingKey = true;
      console.warn("Pendo Track Events are off: set PENDO_TRACK_EVENT_SECRET to send them.");
    }
    return;
  }
  try {
    const response = await fetch(trackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId: visitor.visitorId,
        accountId: visitor.accountId,
        timestamp: Date.now(),
        properties: Object.fromEntries(
          Object.entries(properties).map(([name, value]) => [
            name,
            typeof value === "string" ? value.slice(0, MAX_STRING_LENGTH) : value,
          ]),
        ),
      }),
      signal: AbortSignal.timeout(5000),
    });
    // Read the reply so the connection can be reused.
    await response.text();
    if (!response.ok) {
      console.error(`Pendo turned down the ${event} Track Event: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Couldn't send the ${event} Track Event to Pendo`, error);
  }
}
