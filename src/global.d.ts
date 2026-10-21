/** What Pendo's trackAgent takes with each event. */
interface PendoAgentEvent {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message's text, or for a "user_reaction" event the reaction, such as "positive" or "retry". */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

/**
 * Pendo, whose trackAgent reports conversations with an AI agent. Browsers get it from the Pendo install snippet, but
 * the API runs in Node, so it's undefined unless something installs it on the global object. Read it as
 * globalThis.pendo: unlike a bare `pendo`, that doesn't throw when it's missing.
 */
declare var pendo:
  | { trackAgent(eventType: "prompt" | "agent_response" | "user_reaction", metadata: PendoAgentEvent): void }
  | undefined;
