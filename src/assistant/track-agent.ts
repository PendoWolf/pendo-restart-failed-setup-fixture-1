/** The Tripwise Assistant's agent id in Pendo. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "-J5a_rvXyg10cHzoxQeQ6czfrKE";

export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata of one pendo.trackAgent() event. */
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
 * Sends an agent event to Pendo with pendo.trackAgent(). Does nothing when no Pendo agent is loaded, and never
 * lets a tracking failure break the conversation.
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
