import type { AuthLocals } from "../auth/require-auth.js";

/** The Pendo data host Track Events are sent to, unless PENDO_DATA_HOST overrides it. */
const DEFAULT_DATA_HOST = "data.pendo-dev.pendo-dev.com";

/** Who a Track Event is about: the Pendo visitor (a user's id) and their Pendo account (an account's id). */
export interface TrackIdentity {
  visitorId: string;
  accountId: string;
}

/** A Track Event's properties. Pendo caps the whole properties object at 512 bytes, so keep values short. */
export type TrackProperties = Record<string, string | number | boolean>;

/** The signed-in user and their account, from what requireAuth put on res.locals, as a Track Event's identity. */
export function identityOf({ user, account }: Pick<AuthLocals, "user" | "account">): TrackIdentity {
  return { visitorId: user.id, accountId: account.id };
}

/** Shortens free text a client sent so it can't push a Track Event over Pendo's properties size limit. */
export function clip(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Sends a Track Event to Pendo's server-side Track API (POST /data/track). It never throws and never holds up
 * the response: the request runs in the background and a failure is only logged. It does nothing when
 * PENDO_TRACK_EVENT_SECRET (the Track Event shared secret) isn't set.
 */
export function trackEvent(event: string, identity: TrackIdentity, properties: TrackProperties = {}): void {
  const secret = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!secret) return;
  const host = process.env.PENDO_DATA_HOST || DEFAULT_DATA_HOST;
  try {
    fetch(`https://${host}/data/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId: identity.visitorId,
        accountId: identity.accountId,
        timestamp: Date.now(),
        properties,
      }),
    }).then(
      (response) => {
        if (!response.ok) console.error(`Pendo Track Event "${event}" was rejected with HTTP ${response.status}`);
      },
      (error: unknown) => {
        console.error(`Pendo Track Event "${event}" couldn't be sent`, error);
      },
    );
  } catch (error) {
    console.error(`Pendo Track Event "${event}" couldn't be sent`, error);
  }
}
