/** The Pendo Track Events the API sends. Each name must match its track type in Pendo exactly. */
export type TrackEventName =
  | "trip_created"
  | "trip_updated"
  | "assistant_reply_generated"
  | "assistant_reply_failed"
  | "user_created"
  | "user_role_changed"
  | "account_created"
  | "account_plan_changed";

/** A Track Event's properties. They never hold message content, passwords, emails or names. */
export type TrackProperties = Record<string, string | number | boolean | string[] | null | undefined>;

// Pendo's data API, and the track event secret it expects. The secret is a server-side credential, so it comes
// from the environment, never from the code. Without it the API sends no Track Events.
const dataHost = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;

let warnedNoSecret = false;

/** Posts one Track Event to Pendo, and throws when Pendo doesn't accept it. */
async function postTrackEvent(body: string, secret: string): Promise<void> {
  const response = await fetch(`https://${dataHost}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
    body,
    signal: AbortSignal.timeout(5000),
  });
  // Nothing in Pendo's answer is needed: drop it so the connection is freed.
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Pendo answered ${response.status}`);
}

/**
 * Sends a Pendo Track Event for something a user (the visitor) did in an account. It never throws and never holds
 * up the response: the event goes out in the background, and a failure to send it is only logged.
 */
export function trackEvent(
  event: TrackEventName,
  { visitorId, accountId, properties }: { visitorId: string; accountId: string; properties: TrackProperties },
): void {
  if (!trackEventSecret) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so the API sends no Pendo Track Events");
    }
    return;
  }
  const body = JSON.stringify({ type: "track", event, visitorId, accountId, timestamp: Date.now(), properties });
  postTrackEvent(body, trackEventSecret).catch((error: unknown) => {
    console.error(`Couldn't send the Pendo Track Event ${event}:`, error);
  });
}
