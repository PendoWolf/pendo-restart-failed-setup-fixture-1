// Server-side Pendo Track Events, sent to Pendo's Track API over HTTP. The integration key is read from
// PENDO_TRACK_EVENT_SECRET; without it, tracking is switched off and every call is a no-op.

type TrackPropertyValue = string | number | boolean;

/** Who the event belongs to in Pendo: the signed-in user (visitor) and their account. */
export interface TrackIdentity {
  visitorId: string;
  accountId: string;
}

const dataHost = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;

/** Whole days from `from` to `to`, both ISO dates like "2026-11-03". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Today's date in UTC, like "2026-11-03". */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sends a Track Event to Pendo without waiting for it. A failed or slow request is logged and never
 * affects the response the route sends.
 */
export function trackEvent(
  event: string,
  identity: TrackIdentity,
  properties: Record<string, TrackPropertyValue> = {},
): void {
  if (!trackEventSecret) return;
  fetch(`https://${dataHost}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": trackEventSecret },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: identity.visitorId,
      accountId: identity.accountId,
      timestamp: Date.now(),
      properties,
    }),
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => {
      if (!response.ok) console.error(`Pendo track "${event}" failed with status ${response.status}`);
    })
    .catch((error: unknown) => {
      console.error(`Pendo track "${event}" failed`, error);
    });
}
