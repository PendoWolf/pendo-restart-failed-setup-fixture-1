// Server-side Pendo Track Events, sent to Pendo's Track API (POST https://<data host>/data/track).
// The integration key is read from PENDO_TRACK_EVENT_SECRET and never lives in the repo. Without it, events
// are skipped. Tracking is fire-and-forget: a failure is logged and never breaks the request that fired it.

const dataHost = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const TRACK_TIMEOUT_MS = 5000;

/** A Track Event property value Pendo accepts. */
export type TrackPropertyValue = string | number | boolean | string[];

/** Who did it and what happened: the visitor (user id), their account id, and the event's properties. */
export interface TrackEventDetails {
  visitorId: string;
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

let warnedMissingSecret = false;

async function sendTrackEvent(event: string, details: TrackEventDetails): Promise<void> {
  const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!integrationKey) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so Pendo Track Events are skipped");
    }
    return;
  }
  const response = await fetch(`https://${dataHost}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: details.visitorId,
      accountId: details.accountId,
      timestamp: Date.now(),
      properties: details.properties ?? {},
    }),
    signal: AbortSignal.timeout(TRACK_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Pendo Track API answered ${response.status}`);
  }
}

/** Sends a Track Event to Pendo in the background. Never throws: a failure is only logged. */
export function trackServerEvent(event: string, details: TrackEventDetails): void {
  sendTrackEvent(event, details).catch((failure: unknown) => {
    console.error(`Couldn't send the Pendo Track Event "${event}"`, failure);
  });
}
