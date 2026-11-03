/** A property value Pendo accepts on a Track Event. */
export type TrackPropertyValue = string | number | boolean | string[];

/** One server-side Pendo Track Event. */
export interface TrackEvent {
  /** The event's name, exactly as Pendo has it registered. */
  event: string;
  /** The id of the signed-in user the event belongs to. */
  visitorId: string;
  /** The id of the signed-in user's account. */
  accountId: string;
  properties?: Record<string, TrackPropertyValue>;
}

// The integration key comes from the environment, never from source control. Without it, tracking is off.
const dataHost = process.env.PENDO_DATA_HOST ?? "data.pendo-dev.pendo-dev.com";
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;

let warnedMissingSecret = false;

/**
 * Sends a Track Event to Pendo's server-side Track API. It never throws or rejects, so call it without
 * awaiting: a tracking failure is logged and never breaks the request it came from.
 */
export async function trackEvent({ event, visitorId, accountId, properties = {} }: TrackEvent): Promise<void> {
  if (!trackEventSecret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("PENDO_TRACK_EVENT_SECRET isn't set, so Pendo Track Events are off");
    }
    return;
  }
  try {
    const response = await fetch(`https://${dataHost}/data/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pendo-integration-key": trackEventSecret,
      },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId,
        accountId,
        timestamp: Date.now(),
        properties,
      }),
    });
    if (!response.ok) {
      console.error(`Pendo Track Event "${event}" failed with HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`Pendo Track Event "${event}" failed`, error);
  }
}
