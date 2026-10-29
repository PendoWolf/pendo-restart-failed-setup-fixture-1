// Server-side Pendo Track Events, sent to Pendo's Track API (POST https://<data host>/data/track).
// The integration key is a secret: it's read from PENDO_TRACK_EVENT_SECRET and never committed. Without it,
// events are skipped so local development keeps working.

/** A Track Event property value Pendo accepts. */
export type PendoTrackPropertyValue = string | number | boolean | string[];

/** Who did it: the signed-in user and their account. */
export interface PendoTrackIdentity {
  visitorId: string;
  accountId: string;
}

const DEFAULT_DATA_HOST = "data.pendo-dev.pendo-dev.com";
const TIMEOUT_MS = 5000;

/** Shortens a string property so the event stays well inside Pendo's property size limits. */
export function truncateForPendo(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Sends a Track Event to Pendo in the background. It never throws and never blocks the response: a failure
 * is logged and the request carries on.
 */
export function trackPendoEvent(
  event: string,
  identity: PendoTrackIdentity,
  properties: Record<string, PendoTrackPropertyValue> = {},
): void {
  const secret = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!secret) return;
  const dataHost = process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST;
  try {
    fetch(`https://${dataHost}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId: identity.visitorId,
        accountId: identity.accountId,
        timestamp: Date.now(),
        properties,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
