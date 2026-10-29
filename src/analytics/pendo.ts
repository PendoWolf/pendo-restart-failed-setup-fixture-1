// Server-side Pendo Track Events: outcomes only the API knows about (a trip saved, a sign-in that succeeded,
// an assistant reply that came back), sent to Pendo's Track API. Pendo matches events by name exactly, so
// event names are fixed strings that must not be reworded.

/** Pendo's data host, which receives the track events. */
const PENDO_DATA_HOST = process.env.PENDO_DATA_HOST ?? "data.pendo-dev.pendo-dev.com";
/** Pendo's track event (integration) key. It's a secret, so it's only ever read from the environment. */
const PENDO_TRACK_EVENT_SECRET = process.env.PENDO_TRACK_EVENT_SECRET;

/** The track events the API sends to Pendo. */
export type PendoTrackEventName =
  | "trip_created"
  | "trip_updated"
  | "assistant_reply_completed"
  | "user_signed_in"
  | "team_member_added"
  | "user_role_changed"
  | "company_account_created"
  | "account_plan_changed";

export type PendoTrackProperties = Record<string, string | number | boolean | null | undefined>;

/** Who did it: the signed-in user (the Pendo visitor) and their account. */
export interface PendoTrackActor {
  visitorId: string;
  accountId: string;
}

let warnedMissingSecret = false;

/** Shortens user-entered text so the event's properties stay well under Pendo's size limit. */
export function truncateForPendo(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Sends a track event to Pendo. Never throws and never blocks the response: a failed or skipped event is
 * logged and the request carries on.
 */
export function trackPendoEvent(
  event: PendoTrackEventName,
  actor: PendoTrackActor,
  properties: PendoTrackProperties = {},
): void {
  if (!PENDO_TRACK_EVENT_SECRET) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so Pendo track events aren't sent.");
    }
    return;
  }
  const definedProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );
  void fetch(`https://${PENDO_DATA_HOST}/data/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pendo-integration-key": PENDO_TRACK_EVENT_SECRET,
    },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: actor.visitorId,
      accountId: actor.accountId,
      timestamp: Date.now(),
      properties: definedProperties,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        console.error(`Pendo track event ${event} failed with status ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      console.error(`Pendo track event ${event} failed`, error);
    });
}
