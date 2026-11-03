// Server-side Pendo Track Events, sent to Pendo's Track API (POST https://<data host>/data/track).
// The integration key is read from PENDO_TRACK_EVENT_SECRET; when it isn't set, tracking is skipped.

const DEFAULT_PENDO_DATA_HOST = "data.pendo-dev.pendo-dev.com";

/** A Track Event property value. Keep the whole properties object under 512 bytes. */
export type TrackPropertyValue = string | number | boolean | string[];

export interface TrackEvent {
  /** The Track Event name, exactly as it's registered in Pendo. */
  event: string;
  /** The signed-in user's id, or "system" when there's no user. */
  visitorId: string;
  /** The user's account id, or "system" when there's no account. */
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

/**
 * Sends a Track Event to Pendo without waiting for it. A tracking failure is logged and never breaks the
 * request that fired it.
 */
export function trackEvent({ event, visitorId, accountId, properties = {} }: TrackEvent): void {
  const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!integrationKey) return;
  const dataHost = process.env.PENDO_DATA_HOST || DEFAULT_PENDO_DATA_HOST;
  try {
    fetch(`https://${dataHost}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
      body: JSON.stringify({ type: "track", event, visitorId, accountId, timestamp: Date.now(), properties }),
    })
      .then((response) => {
        if (!response.ok) console.error(`Pendo track "${event}" failed with status ${response.status}`);
      })
      .catch((error: unknown) => {
        console.error(`Pendo track "${event}" failed`, error);
      });
  } catch (error) {
    console.error(`Pendo track "${event}" failed`, error);
  }
}

/** Whole days from `from` to `to`, both ISO dates such as "2026-11-03". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Today's date in UTC, as an ISO date such as "2026-11-03". */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Cuts a free-text value down so it stays well within Pendo's property size limits. */
export function truncate(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
