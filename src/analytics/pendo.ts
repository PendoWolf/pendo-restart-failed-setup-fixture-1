/** The Pendo agent id of the Tripwise Assistant (src/assistant/reply.ts). */
export const TRIPWISE_ASSISTANT_AGENT_ID = "gHhvoGs87K2tRuEbvsOeiLINpV4";

/** The kinds of event Pendo's trackAgent() records. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata Pendo's trackAgent() takes with every event. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message's text, or for a user_reaction, the reaction ("positive", "negative", "mixed", "undo", "retry"). */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

declare global {
  // The Pendo agent, when one is loaded. Node has no Pendo snippet of its own, so it's usually undefined here.
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/**
 * Sends an agent event to Pendo through pendo.trackAgent(). Does nothing when no Pendo agent is loaded, and never
 * lets an analytics failure break the request that's being tracked.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  try {
    globalThis.pendo?.trackAgent(eventType, metadata);
  } catch (error) {
    console.error("pendo.trackAgent failed", error);
  }
}
