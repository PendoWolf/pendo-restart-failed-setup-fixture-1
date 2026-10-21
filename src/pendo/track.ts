/** The Track Events the API sends. Pendo matches events by these exact names, so never rename one. */
export type TrackEventName =
  | "trip_created"
  | "trip_updated"
  | "assistant_reply_generated"
  | "assistant_reply_failed"
  | "team_member_added"
  | "team_member_role_changed"
  | "account_created"
  | "account_plan_changed";

/**
 * A Track Event's properties. Undefined ones are left out and strings are cut to 64 characters. Never put chat
 * text, emails, names or passwords in them.
 */
export type TrackProperties = Record<string, string | number | boolean | string[] | undefined>;

/** A Track Event to send, much as Pendo's Track Event API takes it. */
export interface TrackEvent {
  /** The event's name, which Pendo matches exactly. */
  event: TrackEventName;
  /** The id of the user the event is for. */
  visitorId: string;
  /** The id of the account the event is for. */
  accountId: string;
  properties: TrackProperties;
}

// Pendo's Track Event shared secret, from the environment: no events are sent without it.
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;
const dataHost = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";

const MAX_STRING_LENGTH = 64;
// Pendo's limit on an event's properties, measured as JSON with the "properties" key.
const MAX_PROPERTIES_BYTES = 512;

let warnedNoSecret = false;

/** Cuts the string to MAX_STRING_LENGTH characters, without splitting a character such as an emoji in two. */
function cut(value: string): string {
  return value.length <= MAX_STRING_LENGTH ? value : [...value].slice(0, MAX_STRING_LENGTH).join("");
}

/** The properties within Pendo's limits: long strings cut short, or none at all if they'd still be too big. */
function withinLimits(event: TrackEventName, properties: TrackProperties): TrackProperties {
  const limited: TrackProperties = Object.fromEntries(
    Object.entries(properties).map(([name, value]) => [
      name,
      typeof value === "string" ? cut(value) : Array.isArray(value) ? value.map(cut) : value,
    ]),
  );
  const bytes = Buffer.byteLength(JSON.stringify({ properties: limited }));
  if (bytes <= MAX_PROPERTIES_BYTES) return limited;
  // Better to count the event without its properties than to have Pendo turn it away.
  console.warn(`Pendo Track Event ${event} is sent without its properties: they're ${bytes} bytes, over Pendo's limit`);
  return {};
}

/** Posts the event to Pendo's Track Event API, and throws when Pendo doesn't accept it. */
async function send({ event, visitorId, accountId, properties }: TrackEvent, secret: string): Promise<void> {
  const response = await fetch(`https://${dataHost}/data/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": secret },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId,
      accountId,
      timestamp: Date.now(),
      properties: withinLimits(event, properties),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pendo answered ${response.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Sends a Pendo Track Event through Pendo's server-side Track Event API, for an outcome only the API knows about,
 * such as a trip that was saved or a model call that failed. It's sent in the background: it never delays or
 * breaks the caller, and a failure is only logged. Nothing is sent while PENDO_TRACK_EVENT_SECRET isn't set.
 */
export function trackEvent(event: TrackEvent): void {
  if (!trackEventSecret) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so the API doesn't send Pendo Track Events");
    }
    return;
  }
  send(event, trackEventSecret).catch((error: unknown) => {
    console.error(`Couldn't send Pendo Track Event ${event.event}:`, error);
  });
}
