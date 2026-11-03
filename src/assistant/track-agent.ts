/** The Tripwise Assistant's agent ID in Pendo. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "U8BtC7XBu0BFUwrkK4kx3MSqV18";

export type TrackAgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What pendo.trackAgent() records about one message of a conversation. */
export interface TrackAgentMetadata {
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
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/**
 * Records a Tripwise Assistant event with pendo.trackAgent(). Does nothing when no Pendo agent is loaded, and
 * never lets a tracking failure break the chat.
 */
export function trackAssistantEvent(eventType: TrackAgentEventType, metadata: TrackAgentMetadata): void {
  try {
    globalThis.pendo?.trackAgent(eventType, { agentId: TRIPWISE_ASSISTANT_AGENT_ID, ...metadata });
  } catch (error) {
    console.error("pendo.trackAgent failed", error);
  }
}
