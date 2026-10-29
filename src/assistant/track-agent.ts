import type { Account, User } from "../types.js";

/** The Tripwise Assistant's agent id in Pendo Agent Analytics. */
export const TRIPWISE_ASSISTANT_AGENT_ID = "eBvAD7-woSMLWPGZ7hz58XHCuHE";

/** Pendo's server-side Track Events endpoint, used when PENDO_TRACK_URL isn't set. */
const DEFAULT_PENDO_TRACK_URL = "https://app.pendo.io/data/track";

export type AgentEventType = "prompt" | "agent_response" | "user_reaction";

/** The metadata of one agent event, the same fields pendo.trackAgent() takes in the browser. */
export interface AgentEventMetadata {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message text, or the reaction type for a user_reaction. */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
}

/** Who the event is about, and where their request came from. */
export interface AgentEventVisitor {
  user: User;
  account: Account;
  ip?: string;
  userAgent?: string;
}

/**
 * The server-side counterpart of pendo.trackAgent(): sends one agent event to Pendo's Track Events API. It's
 * fire-and-forget, so it never delays or fails the request that triggered it, and it does nothing when
 * PENDO_TRACK_EVENT_SECRET isn't set.
 */
export function trackAgent(eventType: AgentEventType, metadata: AgentEventMetadata, visitor: AgentEventVisitor): void {
  const integrationKey = process.env.PENDO_TRACK_EVENT_SECRET;
  if (!integrationKey) return;
  const url = process.env.PENDO_TRACK_URL || DEFAULT_PENDO_TRACK_URL;
  const event = {
    type: "track",
    event: eventType,
    visitorId: visitor.user.id,
    accountId: visitor.account.id,
    timestamp: Date.now(),
    properties: metadata,
    context: { ip: visitor.ip, userAgent: visitor.userAgent },
  };
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pendo-integration-key": integrationKey },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5000),
  })
    .then((response) => {
      if (!response.ok) console.warn(`Pendo trackAgent("${eventType}") failed with status ${response.status}`);
    })
    .catch((error: unknown) => {
      console.warn(`Pendo trackAgent("${eventType}") failed`, error);
    });
}
