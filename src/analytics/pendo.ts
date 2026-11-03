// Server-side Pendo Track Events. The API has no pages of its own, so outcomes only it knows (a sign-in
// accepted, a trip saved, an assistant reply written) are sent straight to Pendo's Track API.

/** A Track Event property value. Properties left undefined are dropped from the request. */
export type TrackPropertyValue = string | number | boolean | string[] | undefined;

export interface TrackEvent {
  /** The Pendo track type's name, exactly as registered in Pendo. */
  event: string;
  /** The user the event belongs to, or "system" when there's truly none. */
  visitorId: string;
  /** The account the event belongs to, or "system" when there's truly none. */
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

const DEFAULT_DATA_HOST = "data.pendo-dev.pendo-dev.com";

let warnedMissingKey = false;

/**
 * Sends a Track Event to Pendo without waiting for it. Tracking never breaks a request: failures are logged and
 * swallowed. Needs PENDO_TRACK_EVENT_SECRET (the integration key) and optionally PENDO_DATA_HOST.
 */
export function trackEvent({ event, visitorId, accountId, properties = {} }: TrackEvent): void {
  const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!integrationKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so Pendo Track Events aren't sent");
    }
    return;
  }
  const dataHost = process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST;
  try {
    fetch(`https://${dataHost}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
      body: JSON.stringify({ type: "track", event, visitorId, accountId, timestamp: Date.now(), properties }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(`Pendo Track Event ${event} was rejected with ${response.status}`);
        }
      })
      .catch((error: unknown) => {
        console.error(`Pendo Track Event ${event} failed to send`, error);
      });
  } catch (error) {
    console.error(`Pendo Track Event ${event} failed to send`, error);
  }
}

/** Cuts a free-text value down so the event's properties stay well under Pendo's size limit. */
export function truncate(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
