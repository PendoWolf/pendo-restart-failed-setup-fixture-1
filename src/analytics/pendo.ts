// Server-side Pendo Track Events, sent to Pendo's Track API (POST https://<data host>/data/track).
// The integration key is a secret: it's read from PENDO_TRACK_EVENT_SECRET and never committed.
const DATA_HOST = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const TRACK_EVENT_SECRET = process.env.PENDO_TRACK_EVENT_SECRET;

export type TrackProperties = Record<string, string | number | boolean | string[] | null>;

export interface TrackEventInput {
  /** The id of the user the event is about. */
  visitorId: string;
  /** The id of the account (company) the event is about. */
  accountId: string;
  properties?: TrackProperties;
}

let warnedMissingSecret = false;

/**
 * Sends a Track Event to Pendo without waiting for it. Tracking never throws or slows down the request: a
 * missing key or a failed request is only logged.
 */
export function trackEvent(event: string, { visitorId, accountId, properties = {} }: TrackEventInput): void {
  if (!TRACK_EVENT_SECRET) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so Pendo Track Events aren't sent");
    }
    return;
  }
  void sendTrackEvent(TRACK_EVENT_SECRET, {
    type: "track",
    event,
    visitorId,
    accountId,
    timestamp: Date.now(),
    properties,
  });
}

async function sendTrackEvent(secret: string, body: Record<string, unknown>): Promise<void> {
  try {
    const response = await fetch(`https://${DATA_HOST}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error(`Pendo Track Event "${String(body.event)}" failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(`Pendo Track Event "${String(body.event)}" failed`, error);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from one ISO date ("2026-11-03") to another; negative when `to` is before `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** Today's date in UTC, as an ISO date like "2026-11-03". */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
