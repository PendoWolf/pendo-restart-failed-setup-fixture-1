/** The events Pendo Agent Analytics tracks for a conversational AI agent. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What pendo.trackAgent() takes with each event. */
export interface AgentEventMetadata {
  /** The agent's id in Pendo. */
  agentId: string;
  conversationId: string;
  /** Unique to the message. A "user_reaction" event uses the id of the message it reacts to. */
  messageId: string;
  /**
   * The message's text, or for a "user_reaction" event the reaction: "positive", "negative", "mixed", "undo" or
   * "retry".
   */
  content: string;
  /** The language model that wrote an "agent_response". */
  modelUsed?: string;
  /** Whether a "prompt" was one the app suggested rather than one the user wrote. */
  suggestedPrompt?: boolean;
  /** The tools the agent called for an "agent_response". */
  toolsUsed?: string[];
  /** Whether a file came with the message. */
  fileUploaded?: boolean;
}

declare global {
  /** Pendo's agent, where it's installed. Node has none of its own, so in the API it's undefined unless provided. */
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/**
 * Reports an agent event to Pendo Agent Analytics with pendo.trackAgent(). It does nothing when there's no Pendo
 * agent, and a failure to track is logged rather than thrown, so it never breaks the request being tracked.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  try {
    globalThis.pendo?.trackAgent(eventType, metadata);
  } catch (error) {
    console.error(`pendo.trackAgent failed for the "${eventType}" event`, error);
  }
}
