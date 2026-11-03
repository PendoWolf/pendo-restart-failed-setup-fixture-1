/** The Pendo agent id of the Tripwise Assistant. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "j3ht_ZgpBaeTIYtWJvruQV6dZ-M";

export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata of a Pendo trackAgent event. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message text, or the reaction type for "user_reaction". */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

declare global {
  // Pendo's agent tracking, when a Pendo agent is loaded. Optional: a plain Node process has no `pendo` global.
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/**
 * Sends an agent event to Pendo through pendo.trackAgent(). Does nothing when Pendo isn't loaded, and never
 * throws, so tracking can't break a chat reply.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  try {
    globalThis.pendo?.trackAgent(eventType, metadata);
  } catch (error) {
    console.error("pendo.trackAgent failed", error);
  }
}
