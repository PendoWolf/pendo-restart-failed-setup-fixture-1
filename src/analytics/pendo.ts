/** The Pendo agent event types trackAgent accepts. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata Pendo's trackAgent takes with each event. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

declare global {
  // Pendo's agent analytics API, present only where a Pendo agent has been loaded.
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/** The Pendo agent id of the Tripwise Assistant. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "w3qFQR-K63XksofyNmvGbcZbMAU";

/**
 * Sends an agent event to Pendo with pendo.trackAgent. Does nothing where Pendo isn't loaded, and never throws,
 * so analytics can't break a chat request.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  try {
    globalThis.pendo?.trackAgent(eventType, metadata);
  } catch (error) {
    console.error("pendo.trackAgent failed", error);
  }
}
