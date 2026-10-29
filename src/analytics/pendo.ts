/** The Tripwise Assistant's agent id in Pendo Agent Analytics. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "yvfOxmBwWLjgqvqwStfH_uLsJpI";

export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata pendo.trackAgent takes with every event. */
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

declare global {
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/**
 * Sends an agent event to Pendo through pendo.trackAgent. Does nothing when no Pendo client is loaded in this
 * process, and never throws, so analytics can't break a request.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  try {
    if (typeof pendo !== "undefined" && typeof pendo.trackAgent === "function") {
      pendo.trackAgent(eventType, metadata);
    }
  } catch (error) {
    console.error(`pendo.trackAgent("${eventType}") failed`, error);
  }
}
