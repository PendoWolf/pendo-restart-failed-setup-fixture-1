import type { Account, User } from "../types.js";

/** The kinds of agent interaction Pendo tracks. */
export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** What Pendo's trackAgent() takes with each event. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message text, or the reaction ("positive", "negative", "mixed", "undo" or "retry"). */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

/** Pendo's trackAgent(), for one signed-in visitor. */
export interface PendoAgentTracker {
  trackAgent: (eventType: AgentEventType, metadata: AgentEventMetadata) => void;
}

// The Track Event integration key is a server-side secret, so it only ever comes from the environment.
const trackUrl = process.env.PENDO_TRACK_URL || "https://app.pendo.io/data/track";

/**
 * Pendo's trackAgent() for the signed-in user and their account. The API has no browser Pendo agent, so it
 * sends each event to Pendo's Track Event API instead. It does nothing while PENDO_TRACK_EVENT_SECRET is unset,
 * and never holds up or fails the request it's tracking.
 */
export function pendoFor(user: User, account: Account): PendoAgentTracker {
  return {
    trackAgent(eventType, metadata) {
      const secret = process.env.PENDO_TRACK_EVENT_SECRET;
      if (!secret) {
        return;
      }
      fetch(trackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-pendo-integration-key": secret },
        body: JSON.stringify({
          type: "track",
          event: eventType,
          visitorId: user.id,
          accountId: account.id,
          timestamp: Date.now(),
          properties: metadata,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            console.error(`Pendo trackAgent("${eventType}") failed with status ${response.status}`);
          }
        })
        .catch((error: unknown) => {
          console.error(`Pendo trackAgent("${eventType}") failed`, error);
        });
    },
  };
}
