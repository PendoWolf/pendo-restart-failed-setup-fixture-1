/** The kinds of event Pendo's trackAgent() records. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What Pendo's trackAgent() records with each agent event. */
export interface AgentEventMetadata {
  /** The agent's id in Pendo. */
  agentId: string;
  conversationId: string;
  /** Unique per message. A user_reaction uses the id of the message it reacts to. */
  messageId: string;
  /** The message's text, or for a user_reaction one of "positive", "negative", "mixed", "undo" or "retry". */
  content: string;
  /** The language model that wrote the agent's response. */
  modelUsed?: string;
  /** Whether the prompt was one the app suggested rather than one the user wrote. */
  suggestedPrompt?: boolean;
  /** The tools or functions the agent called. */
  toolsUsed?: string[];
  /** Whether a file was attached to the message. */
  fileUploaded?: boolean;
}

declare global {
  // Pendo's agent defines this global where it's loaded, as in a browser. A plain Node process doesn't load it, so
  // here it's absent unless something provides it.
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/** The Tripwise Assistant's agent id in Pendo. */
export const PENDO_AGENT_ID = "NmyAB-F20cszYjAlCJFBwI41iw8";

/**
 * Records an event in a conversation with pendo.trackAgent(). Does nothing when Pendo isn't loaded, and never throws:
 * analytics mustn't break the chat.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  try {
    globalThis.pendo?.trackAgent(eventType, metadata);
  } catch (error) {
    console.error("pendo.trackAgent failed", error);
  }
}
