import type { Account, User } from "../types.js";

/**
 * The track events the API sends to Pendo. Pendo counts each event under its exact name, so never rename one: its
 * events would start counting toward a different track type.
 */
type TrackEventName =
  | "trip_created"
  | "trip_updated"
  | "assistant_reply_generated"
  | "assistant_reply_failed"
  | "user_created"
  | "user_role_changed"
  | "account_created"
  | "account_plan_changed"
  | "account_deleted";

/** What a track event records. Pendo groups by strings and booleans and adds up numbers; undefined ones aren't sent. */
type TrackProperties = Record<string, string | number | boolean | undefined>;

// Pendo's Track Event shared secret, from its app settings. It's a credential, so it only ever comes from the
// environment, and no track events are sent without it.
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;
const trackUrl = `https://${process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com"}/data/track`;

// Pendo takes at most 512 bytes of properties per event, so free text, such as a destination, is cut to this length.
const MAX_TEXT_LENGTH = 80;

let warnedAboutMissingSecret = false;

/**
 * Sends a track event to Pendo for the signed-in user (the Pendo visitor) and their account (the Pendo account). It
 * doesn't wait for Pendo, and a failure is only logged, so tracking never slows down or breaks the request.
 */
export function trackEvent(
  event: TrackEventName,
  { user, account }: { user: User; account: Account },
  properties: TrackProperties,
): void {
  if (!trackEventSecret) {
    if (!warnedAboutMissingSecret) {
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so no track events are sent to Pendo");
      warnedAboutMissingSecret = true;
    }
    return;
  }
  const body = JSON.stringify({
    type: "track",
    event,
    visitorId: user.id,
    accountId: account.id,
    timestamp: Date.now(),
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, value]) => [
        name,
        typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : value,
      ]),
    ),
  });
  void send(event, body, trackEventSecret);
}

/** Posts the event to Pendo's Track Event API, and logs a failure instead of throwing it. */
async function send(event: TrackEventName, body: string, secret: string): Promise<void> {
  try {
    const response = await fetch(trackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error(`Pendo didn't accept the ${event} track event: HTTP ${response.status}`);
    }
    // Nothing in Pendo's reply is needed, and discarding it frees the connection for the next event.
    await response.body?.cancel();
  } catch (error) {
    console.error(`Couldn't send the ${event} track event to Pendo:`, error);
  }
}
