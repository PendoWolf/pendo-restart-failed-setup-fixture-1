// Server-side Pendo Track Events, sent to Pendo's Track API (POST https://<data host>/data/track).
// The integration key is a secret, so it's read from the environment and never committed. Without it,
// tracking is a no-op, so local development and tests don't send events.
const PENDO_DATA_HOST = process.env.PENDO_DATA_HOST ?? "data.pendo-dev.pendo-dev.com";
const PENDO_TRACK_EVENT_SECRET = process.env.PENDO_TRACK_EVENT_SECRET;

/** A Track Event property value Pendo accepts. */
export type PendoPropertyValue = string | number | boolean | string[] | number[];

export interface PendoTrackEvent {
  /** The Track Event's name, exactly as it's registered in Pendo. */
  event: string;
  /** The user the event is about, or "system" when there's none. */
  visitorId: string;
  /** The account (company) the event is about, or "system" when there's none. */
  accountId: string;
  properties?: Record<string, PendoPropertyValue | undefined>;
}

/**
 * Sends a Track Event to Pendo in the background. It never throws and never delays the response: a failure is
 * only logged, so tracking can't break the request that fired it.
 */
export function trackPendoEvent({ event, visitorId, accountId, properties }: PendoTrackEvent): void {
  if (!PENDO_TRACK_EVENT_SECRET) return;
  try {
    fetch(`https://${PENDO_DATA_HOST}/data/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pendo-integration-key": PENDO_TRACK_EVENT_SECRET,
      },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId: visitorId || "system",
        accountId: accountId || "system",
        timestamp: Date.now(),
        properties: properties ?? {},
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(`Pendo track event "${event}" failed with status ${response.status}`);
        }
      })
      .catch((error: unknown) => {
        console.error(`Pendo track event "${event}" failed`, error);
      });
  } catch (error) {
    console.error(`Pendo track event "${event}" failed`, error);
  }
}

/** Shortens free text, such as a destination, so a property stays well within Pendo's size limits. */
export function truncateForPendo(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
