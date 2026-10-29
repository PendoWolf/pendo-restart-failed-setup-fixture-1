// Server-side Pendo Track Events. The routes call trackEvent once the outcome is known (a trip saved, a user
// signed in, ...), which a click in the web app can't tell. Events go to Pendo's Track API over HTTPS.

/** Pendo's data host. Not a secret, so it has a default; set PENDO_DATA_HOST to send events elsewhere. */
const PENDO_DATA_HOST = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
/** The Track Event shared secret (integration key). A secret: it only ever comes from the environment. */
const PENDO_TRACK_EVENT_SECRET = process.env.PENDO_TRACK_EVENT_SECRET;

/** Property values Pendo accepts on a Track Event. */
export type TrackPropertyValue = string | number | boolean | string[];

export interface TrackEvent {
  /** The event's name, exactly as Pendo has it registered. */
  event: string;
  /** The user the event is about: the signed-in user who did it. */
  visitorId: string;
  /** The signed-in user's account (company). */
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

let warnedMissingSecret = false;

/**
 * Sends a Track Event to Pendo without waiting for it. Tracking never breaks a request: when the secret
 * isn't set the event is skipped, and a failed send is only logged.
 */
export function trackEvent({ event, visitorId, accountId, properties = {} }: TrackEvent): void {
  if (!PENDO_TRACK_EVENT_SECRET) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so Pendo Track Events are not sent");
    }
    return;
  }
  void fetch(`https://${PENDO_DATA_HOST}/data/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pendo-integration-key": PENDO_TRACK_EVENT_SECRET,
    },
    body: JSON.stringify({ type: "track", event, visitorId, accountId, timestamp: Date.now(), properties }),
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => {
      if (!response.ok) {
        console.error(`Pendo Track Event "${event}" was rejected with status ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      console.error(`Pendo Track Event "${event}" could not be sent`, error);
    });
}
