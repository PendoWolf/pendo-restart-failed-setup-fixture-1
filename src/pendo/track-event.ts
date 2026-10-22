import type { AuthLocals } from "../auth/require-auth.js";

/** The Track Events the API sends. Pendo matches on these exact names, so never rename one. */
export type TrackEventName =
  | "trip_created"
  | "trip_updated"
  | "team_member_added"
  | "team_member_role_changed"
  | "account_created"
  | "account_plan_changed"
  | "account_deleted"
  | "assistant_reply_generated"
  | "assistant_reply_failed";

/**
 * A Track Event's properties. Pendo takes at most 512 bytes of them as JSON, so keep them few and short, and never
 * put personal details (emails, names, passwords, message text) in them. Undefined ones are left out.
 */
export type TrackEventProperties = Record<string, string | number | boolean | undefined>;

// Pendo's Track API, and the subscription's Track Event shared secret it checks. The secret comes from the
// environment and is never committed; without it, no events are sent.
const dataHost = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;

let warnedAboutMissingSecret = false;

/**
 * Sends a server-side Track Event to Pendo for the signed-in user and their account. It doesn't wait for Pendo and
 * never throws, so a failed send can't slow down or break the request that triggered it: failures are only logged.
 */
export function trackEvent(
  event: TrackEventName,
  { user, account }: Pick<AuthLocals, "user" | "account">,
  properties: TrackEventProperties,
): void {
  if (!trackEventSecret) {
    if (!warnedAboutMissingSecret) {
      warnedAboutMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so no Pendo Track Events are sent");
    }
    return;
  }
  try {
    void fetch(`https://${dataHost}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": trackEventSecret },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId: user.id,
        accountId: account.id,
        timestamp: Date.now(),
        properties,
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        if (!response.ok) {
          console.error(`Pendo didn't accept the ${event} Track Event: HTTP ${response.status}`);
        }
        // Nothing to read, but the body has to be released for the connection to be reused.
        await response.body?.cancel();
      })
      .catch((error: unknown) => {
        console.error(`Couldn't send the ${event} Track Event to Pendo`, error);
      });
  } catch (error) {
    console.error(`Couldn't send the ${event} Track Event to Pendo`, error);
  }
}
