import type { Account, User } from "../types.js";

/** A Track Event property value Pendo accepts. */
export type PendoTrackProperty = string | number | boolean | null;

// The integration key is a server-side secret: it's read from the environment, never committed.
const PENDO_TRACK_URL = `https://${process.env.PENDO_DATA_HOST ?? "data.pendo-dev.pendo-dev.com"}/data/track`;

/** Cuts a free-text value down so the event's properties stay within Pendo's size limits. */
export function truncateForPendo(value: string, maxLength = 100): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** Whole days from `from` to `to`, both ISO dates such as "2026-11-03". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * Sends a Track Event to Pendo for the signed-in user and their account (server-side Track API). It never
 * throws and never holds up the response: a failure is only logged.
 */
export function trackPendoEvent(
  event: string,
  session: { user: User; account: Account },
  properties: Record<string, PendoTrackProperty>,
): void {
  const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!integrationKey) return;
  fetch(PENDO_TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: session.user.id,
      accountId: session.account.id,
      timestamp: Date.now(),
      properties,
    }),
  })
    .then((response) => {
      if (!response.ok) console.error(`Pendo track "${event}" failed with status ${response.status}`);
    })
    .catch((error: unknown) => {
      console.error(`Pendo track "${event}" failed`, error);
    });
}
