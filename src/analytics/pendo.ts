/** The kinds of agent event Pendo's trackAgent() records. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata of an agent event, the same shape as the browser's pendo.trackAgent(eventType, metadata). */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message's text, or for a user_reaction the reaction: positive, negative, mixed, undo or retry. */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

/** Who the event is for: the signed-in user as the Pendo visitor, and their account. */
export interface PendoIdentity {
  visitorId: string;
  accountId: string;
}

// The API has no browser, so there's no window.pendo here: agent events go to Pendo's server-side Track Events
// endpoint instead. Without PENDO_TRACK_EVENT_SECRET, trackAgent does nothing.
const trackUrl = process.env.PENDO_TRACK_URL ?? "https://app.pendo.io/data/track";
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;

/**
 * Records a Tripwise Assistant event in Pendo, like the browser's pendo.trackAgent(eventType, metadata). It sends
 * in the background and never throws, so tracking can't slow down or break a chat reply.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata, identity: PendoIdentity): void {
  if (!trackEventSecret) {
    return;
  }
  const event = {
    type: "track",
    event: eventType,
    visitorId: identity.visitorId,
    accountId: identity.accountId,
    timestamp: Date.now(),
    properties: metadata,
  };
  fetch(trackUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pendo-integration-key": trackEventSecret },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => {
      if (!response.ok) {
        console.error(`Pendo trackAgent("${eventType}") failed with status ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      console.error(`Pendo trackAgent("${eventType}") failed`, error);
    });
}
