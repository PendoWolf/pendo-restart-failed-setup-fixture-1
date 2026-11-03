// Server-side Pendo Track Events, sent to Pendo's Track Event API (POST https://<data host>/data/track).
// The integration key is read from PENDO_TRACK_EVENT_SECRET and never committed; when it isn't set, events
// are skipped. Tracking never blocks or breaks the request that fires it.

const DEFAULT_DATA_HOST = "data.pendo-dev.pendo-dev.com";
const TRACK_TIMEOUT_MS = 5000;

/** Property values Pendo accepts on a Track Event. */
export type TrackPropertyValue = string | number | boolean | null | undefined;

export interface TrackEvent {
  /** The event's name, exactly as registered in Pendo. */
  event: string;
  /** The user who did it, or "system" when there's truly none. */
  visitorId: string;
  /** The account it belongs to, or "system" when there's truly none. */
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

let warnedMissingSecret = false;

/** Sends a Track Event to Pendo in the background. Failures are logged, never thrown. */
export function trackPendoEvent({ event, visitorId, accountId, properties = {} }: TrackEvent): void {
  const secret = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so Pendo Track Events are skipped");
    }
    return;
  }
  const dataHost = process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST;
  // Leave out properties with no value rather than sending nulls.
  const definedProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null),
  );
  void fetch(`https://${dataHost}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId,
      accountId,
      timestamp: Date.now(),
      properties: definedProperties,
    }),
    signal: AbortSignal.timeout(TRACK_TIMEOUT_MS),
  })
    .then((response) => {
      if (!response.ok) {
        console.error(`Pendo Track Event "${event}" was rejected with status ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      console.error(`Pendo Track Event "${event}" failed to send`, error);
    });
}

/** Shortens a free-text value so the event's properties stay within Pendo's size limits. */
export function truncate(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
