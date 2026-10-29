/** The Pendo agent id of the Tripwise Assistant. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "6oQ81u0WnbsdMxmDenff9-RRsEI";

export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata Pendo's trackAgent() takes with every event. */
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

/**
 * Sends an agent event to Pendo with pendo.trackAgent(). Does nothing when no `pendo` global is registered, and never
 * throws, so analytics can't break a request.
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
