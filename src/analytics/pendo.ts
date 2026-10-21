import type { Account, User } from "../types.js";

/**
 * The track events the API sends to Pendo, for outcomes only the API sees. Pendo matches events on these exact
 * names, so renaming one would start a new event in Pendo.
 */
export type TrackEventName =
  | "account_created"
  | "account_plan_changed"
  | "assistant_reply_failed"
  | "assistant_reply_generated"
  | "trip_created"
  | "trip_updated"
  | "user_created"
  | "user_role_changed"
  | "user_signed_in";

/** A track event's properties: never personal details such as emails, names or chat messages. */
export type TrackProperties = Record<string, string | number | boolean | undefined>;

// Pendo's Track Events API takes the subscription's track event secret. Without it the API sends no track events.
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;
const trackUrl = `https://${process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com"}/data/track`;
if (!trackEventSecret) {
  console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so the API sends no Pendo track events.");
}

// Pendo takes at most 512 bytes of properties per event, so free text such as a trip's destination is cut short.
const MAX_TEXT_LENGTH = 100;

/** The properties as Pendo takes them: text cut short, and values left out when undefined or not a finite number. */
function pendoProperties(properties: TrackProperties): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) continue;
    result[name] = typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : value;
  }
  return result;
}

async function sendTrackEvent(
  event: TrackEventName,
  user: User,
  account: Account,
  properties: TrackProperties,
): Promise<void> {
  if (!trackEventSecret) return;
  try {
    const response = await fetch(trackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": trackEventSecret },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId: user.id,
        accountId: account.id,
        timestamp: Date.now(),
        properties: pendoProperties(properties),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error(`Pendo track event ${event} failed: HTTP ${response.status}`);
    }
    // Nothing in the response is needed: cancelling its body frees the connection.
    await response.body?.cancel();
  } catch (error) {
    console.error(`Pendo track event ${event} failed:`, error);
  }
}

/**
 * Sends Pendo a track event for something `user`, of `account`, did: Pendo records it against them as the visitor
 * and the account. It goes in the background, so it never holds up the response and never throws: a failure is
 * only logged.
 */
export function trackEvent(event: TrackEventName, user: User, account: Account, properties: TrackProperties): void {
  void sendTrackEvent(event, user, account, properties);
}
