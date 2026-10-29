// Server-side Pendo Track Events. This API has no pages, so outcomes that only the server knows (validation
// passed, the model refused, sign-in was rejected) are sent to Pendo's Track API over HTTP.
//
// The integration key is a server-side secret: it's read from PENDO_TRACK_EVENT_SECRET and must never be
// committed. Without it, tracking is a no-op so local development keeps working.

const DEFAULT_DATA_HOST = "data.pendo-dev.pendo-dev.com";

/** The visitor and account ids for events with no signed-in user, such as a failed sign-in. */
export const ANONYMOUS_ID = "anonymous";

export type TrackPropertyValue = string | number | boolean | null;

export interface TrackEvent {
  /** The Pendo track type's name, exactly as it's registered in Pendo. */
  event: string;
  /** The signed-in user's id, or ANONYMOUS_ID. */
  visitorId: string;
  /** The signed-in user's account id, or ANONYMOUS_ID. */
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

let warnedMissingKey = false;

/** Cuts a free-text value down so the event's properties stay within Pendo's size limits. */
export function truncate(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Sends a Track Event to Pendo without waiting for it. Tracking never throws and never slows the response:
 * failures are logged and otherwise ignored.
 */
export function trackEvent({ event, visitorId, accountId, properties = {} }: TrackEvent): void {
  const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!integrationKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("PENDO_TRACK_EVENT_SECRET is not set, so Pendo Track Events are not sent");
    }
    return;
  }
  const dataHost = process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST;
  try {
    void fetch(`https://${dataHost}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
      body: JSON.stringify({ type: "track", event, visitorId, accountId, timestamp: Date.now(), properties }),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(`Pendo Track Event "${event}" was rejected with status ${response.status}`);
        }
      })
      .catch((error: unknown) => {
        console.error(`Pendo Track Event "${event}" failed to send`, error);
      });
  } catch (error) {
    console.error(`Pendo Track Event "${event}" failed to send`, error);
  }
}
