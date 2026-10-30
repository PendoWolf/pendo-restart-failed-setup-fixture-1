/** The Tripwise Assistant's agent id in Pendo Agent Analytics. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "WeIH6-02-X41K4N5fI9BXqzTbJ0";

export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata of one agent event, with the same fields as the Pendo agent's trackAgent(). */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message text, or the reaction type for a user_reaction. */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

/** Who the event is about, and the request it came from. */
export interface AgentEventVisitor {
  visitorId: string;
  accountId: string;
  ip?: string;
  userAgent?: string;
}

// Pendo's Track Events endpoint. Set PENDO_TRACK_URL for a subscription on another data host.
const trackUrl = process.env.PENDO_TRACK_URL ?? "https://app.pendo.io/data/track";
// The server-side integration key. Without it, agent events aren't sent.
const integrationKey = process.env.PENDO_INTEGRATION_KEY;

/**
 * Sends an agent event to Pendo, the server-side counterpart of the Pendo agent's
 * pendo.trackAgent(eventType, metadata). It never waits or throws, so tracking can't slow down or break a reply.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata, visitor: AgentEventVisitor): void {
  if (!integrationKey) {
    return;
  }
  const event = {
    type: "track",
    event: eventType,
    visitorId: visitor.visitorId,
    accountId: visitor.accountId,
    timestamp: Date.now(),
    properties: metadata,
    context: { ip: visitor.ip, userAgent: visitor.userAgent },
  };
  fetch(trackUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pendo-integration-key": integrationKey },
    body: JSON.stringify(event),
  })
    .then((response) => {
      if (!response.ok) {
        console.error(`Pendo didn't take the ${eventType} event: ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      console.error(`Couldn't send the ${eventType} event to Pendo`, error);
    });
}
