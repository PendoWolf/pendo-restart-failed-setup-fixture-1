/** The Pendo agent id of the Tripwise Assistant. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "vUK8ZihR50EwxdVPOa9Uz6ehvbo";

export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata of a pendo.trackAgent() event. */
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

/**
 * Sends an agent event to Pendo with pendo.trackAgent(). Does nothing where no Pendo agent is loaded, and never
 * throws, so tracking can't break a request.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  if (typeof pendo === "undefined" || typeof pendo.trackAgent !== "function") {
    return;
  }
  try {
    pendo.trackAgent(eventType, metadata);
  } catch (error) {
    console.error("pendo.trackAgent failed", error);
  }
}
