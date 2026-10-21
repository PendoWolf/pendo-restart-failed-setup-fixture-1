import type { Account, User } from "../types.js";

/** The kinds of event Pendo's trackAgent records about an AI agent. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What each trackAgent event carries, as Pendo's trackAgent API defines it. */
export interface AgentEventMetadata {
  /** The agent's id in Pendo. */
  agentId: string;
  conversationId: string;
  /** Unique to the message. A user_reaction carries the id of the message it reacts to. */
  messageId: string;
  /** The message's text, or for a user_reaction one of "positive", "negative", "mixed", "undo" or "retry". */
  content: string;
  /** The language model that wrote an agent_response. */
  modelUsed?: string;
  /** Whether the prompt was one the app suggested. */
  suggestedPrompt?: boolean;
  /** The tools the agent called for an agent_response. */
  toolsUsed?: string[];
  /** Whether a file came with the message. */
  fileUploaded?: boolean;
}

// Pendo's endpoint for events sent from a server, and the key it takes them with: the subscription's Track Event
// Shared Secret. Without the secret, trackAgent sends nothing.
const trackUrl = process.env.PENDO_TRACK_URL || "https://app.pendo.io/data/track";
const trackEventSecret = process.env.PENDO_TRACK_EVENT_SECRET;

/** Sends a trackAgent event to Pendo's Track Events endpoint as the user, and rejects when Pendo doesn't take it. */
async function sendAgentEvent(
  user: User,
  account: Account,
  eventType: AgentEventType,
  metadata: AgentEventMetadata,
): Promise<void> {
  if (!trackEventSecret) return;
  const response = await fetch(trackUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pendo-integration-key": trackEventSecret },
    body: JSON.stringify({
      type: "track",
      event: eventType,
      visitorId: user.id,
      accountId: account.id,
      timestamp: Date.now(),
      properties: metadata,
    }),
    signal: AbortSignal.timeout(5000),
  });
  // Reading the answer through also frees the connection for the next event.
  const answer = await response.text();
  if (!response.ok) throw new Error(`Pendo answered ${response.status}: ${answer}`);
}

/**
 * Pendo for the signed-in user and their account. Node has no `window.pendo`, so this `trackAgent` takes the same
 * arguments as the browser's and sends the event to Pendo's Track Events endpoint as that user instead. It neither
 * waits for Pendo nor throws: a failed send is only logged, so tracking can't slow down or break a request.
 */
export function pendoFor(user: User, account: Account) {
  return {
    trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata): void {
      sendAgentEvent(user, account, eventType, metadata).catch((error: unknown) => {
        console.error(`Couldn't send the ${eventType} event to Pendo:`, error);
      });
    },
  };
}
