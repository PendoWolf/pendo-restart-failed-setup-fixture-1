// Server-side Pendo Track Events, sent to Pendo's Track API (POST https://<data host>/data/track).
// The integration key is read from PENDO_TRACK_EVENT_SECRET and is never committed. When it isn't set,
// events are skipped. Tracking runs in the background and never fails or slows down the request.

/** The Track Events the API sends. Pendo matches on these names exactly, so they must not change. */
export type PendoEventName =
  | "assistant_reply_generated"
  | "assistant_reply_failed"
  | "trip_created"
  | "trip_updated"
  | "team_member_added"
  | "user_role_changed"
  | "account_created"
  | "account_plan_changed";

export type PendoEventProperties = Record<string, string | number | boolean>;

export interface PendoTrackEvent {
  event: PendoEventName;
  /** The id of the signed-in user who did it. */
  visitorId: string;
  /** The id of the signed-in user's account. */
  accountId: string;
  properties?: PendoEventProperties;
}

const DEFAULT_DATA_HOST = "data.pendo-dev.pendo-dev.com";
const TIMEOUT_MS = 5000;

/** Cuts a free-text property value down so the event stays within Pendo's property size limits. */
export function truncateProperty(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** Sends a Track Event to Pendo in the background. Failures are logged and never thrown. */
export function trackPendoEvent({ event, visitorId, accountId, properties = {} }: PendoTrackEvent): void {
  const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!integrationKey) return;
  const dataHost = process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST;
  try {
    fetch(`https://${dataHost}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
      body: JSON.stringify({ type: "track", event, visitorId, accountId, timestamp: Date.now(), properties }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
      .then((response) => {
        if (!response.ok) console.error(`Pendo track event ${event} failed with status ${response.status}`);
      })
      .catch((error: unknown) => {
        console.error(`Pendo track event ${event} failed`, error);
      });
  } catch (error) {
    console.error(`Pendo track event ${event} failed`, error);
  }
}
