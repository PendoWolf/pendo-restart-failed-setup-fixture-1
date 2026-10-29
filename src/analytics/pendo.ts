/** The kinds of agent event Pendo's trackAgent accepts. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What every trackAgent event carries, following Pendo's trackAgent metadata. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message's text, or the reaction type for a user_reaction. */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

/** Who the event is about: the signed-in user and their account. */
export interface AgentEventVisitor {
  visitorId: string;
  accountId: string;
}

// The Track Events integration key is a server-side secret, so it only ever comes from the environment.
// Without it, tracking is off and trackAgent does nothing.
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;
const dataHost = process.env.PENDO_DATA_HOST ?? "https://app.pendo.io";

/**
 * Pendo agent analytics for the API. The browser's window.pendo isn't available on the server, so trackAgent
 * sends the same event types and metadata to Pendo's Track Events API, for the signed-in visitor and account.
 */
export const pendo = {
  /** Sends the event without holding up the request; a failure is logged and never reaches the user. */
  trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata, visitor: AgentEventVisitor): void {
    if (!trackEventSecret) return;
    fetch(`${dataHost}/data/track`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-pendo-integration-key": trackEventSecret },
      body: JSON.stringify({
        type: "track",
        event: eventType,
        visitorId: visitor.visitorId,
        accountId: visitor.accountId,
        timestamp: Date.now(),
        properties: metadata,
      }),
    })
      .then((response) => {
        if (!response.ok) console.error(`Pendo trackAgent ${eventType} failed with ${response.status}`);
      })
      .catch((error: unknown) => {
        console.error(`Pendo trackAgent ${eventType} failed`, error);
      });
  },
};
