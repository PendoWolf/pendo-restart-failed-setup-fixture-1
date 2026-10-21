/** The Tripwise Assistant's agent id in Pendo, which every trackAgent event about the assistant carries. */
export const ASSISTANT_AGENT_ID = "yMJXN1gsvRnaQbuOspo0MLPjnBU";

/** The events of a conversation that trackAgent records: a prompt, the agent's response, or a reaction to it. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What trackAgent records with each event. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message's text, or for a user_reaction one of positive, negative, mixed, undo or retry. */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

declare global {
  /**
   * Pendo's SDK, whose trackAgent records conversations with AI agents. It's only there once something installs it on
   * the global scope: the API doesn't load Pendo itself, as Pendo's web SDK runs in the browser.
   */
  var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
}

/**
 * Records an event of a conversation with an AI agent in Pendo, through pendo.trackAgent. Does nothing while Pendo
 * isn't installed, and a failure to record one never breaks the chat.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
  if (typeof pendo === "undefined") return;
  try {
    pendo.trackAgent(eventType, metadata);
  } catch (error) {
    console.error("Pendo trackAgent failed", error);
  }
}
