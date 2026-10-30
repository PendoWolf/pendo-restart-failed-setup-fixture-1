/** A property value Pendo accepts on a Track Event. */
export type TrackPropertyValue = string | number | boolean | string[];

export interface TrackEvent {
  /** The Pendo track type's name, exactly as it's registered in Pendo. */
  event: string;
  /** The signed-in user the event belongs to. */
  visitorId: string;
  /** The signed-in user's account. */
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

// Pendo's data host and the Track Event integration key come from the environment. The key is a secret, so it
// must never be committed: without it, tracking is skipped and the API works as before.
const dataHost = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;

/** The longest string property value sent, to stay well inside Pendo's limits. */
const MAX_STRING_LENGTH = 100;

/** Caps a string property value's length. */
export function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
}

/**
 * Sends a server-side Track Event to Pendo. It's fire-and-forget: it never throws or rejects, and a failure is only
 * logged, so tracking can't break the request that triggered it.
 */
export function trackEvent({ event, visitorId, accountId, properties = {} }: TrackEvent): void {
  if (!integrationKey) return;
  fetch(`https://${dataHost}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
    body: JSON.stringify({ type: "track", event, visitorId, accountId, timestamp: Date.now(), properties }),
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => {
      if (!response.ok) console.error(`Pendo track event ${event} failed with status ${response.status}`);
    })
    .catch((error: unknown) => {
      console.error(`Pendo track event ${event} failed`, error);
    });
}
