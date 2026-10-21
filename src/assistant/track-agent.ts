/** The Tripwise Assistant's agent id in Pendo Agent Analytics. */
export const PENDO_AGENT_ID = "7IvnuipmYdkkXUADOu-BMho5a38";

/** The kinds of event Pendo Agent Analytics records about an agent. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What pendo.trackAgent takes about one event. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message's text, or for a "user_reaction" one of "positive", "negative", "mixed", "undo" or "retry". */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

declare global {
  /** Pendo's agent API. It's only there where a Pendo agent is loaded: plain Node has none. */
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/**
 * Records an event in Pendo Agent Analytics with pendo.trackAgent. It does nothing where no Pendo agent is
 * loaded, and never throws, so tracking can't fail a request.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  try {
    globalThis.pendo?.trackAgent(eventType, metadata);
  } catch (error) {
    console.error("pendo.trackAgent failed", error);
  }
}
