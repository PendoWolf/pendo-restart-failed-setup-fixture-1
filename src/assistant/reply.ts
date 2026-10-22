import Anthropic from "@anthropic-ai/sdk";
import type { Account, IncomingChatMessage, Trip, User } from "../types.js";

/** The model the Tripwise Assistant answers with. */
export const ASSISTANT_MODEL = "claude-opus-5-5";

// The SDK reads the key from the ANTHROPIC_API_KEY environment variable.
const anthropic = new Anthropic();

/** The assistant's instructions, with what it knows about the signed-in user and their upcoming trips. */
function systemPrompt(user: User, account: Account, upcomingTrips: Trip[]): string {
  const trips =
    upcomingTrips.length === 0
      ? "They have no upcoming trips yet."
      : `Their upcoming trips:\n${upcomingTrips
          .map((trip) => `- ${trip.destination}, ${trip.startDate} to ${trip.endDate}, ${trip.travelers} traveler(s)`)
          .join("\n")}`;
  return [
    "You are the Tripwise Assistant, a travel-planning agent inside the Tripwise web app.",
    "Help with itineraries, packing lists, budgets and cheaper alternatives. Keep answers short and practical.",
    `You're talking to ${user.name} from ${account.name}.`,
    trips,
  ].join("\n");
}

/** The Tripwise Assistant's reply, and why the model stopped writing it. */
export interface AssistantReply {
  content: string;
  /** The model's stop_reason, such as "end_turn", "max_tokens" or "refusal". */
  stopReason: Anthropic.StopReason | null;
  /** True when the model refused, and `content` is a canned apology instead of its answer. */
  refused: boolean;
}

/**
 * Writes the Tripwise Assistant's reply to the conversation by sending it to a Claude model through the
 * Anthropic SDK, and returns the reply's text with why the model stopped.
 */
export async function writeAssistantReply(
  messages: IncomingChatMessage[],
  context: { user: User; account: Account; upcomingTrips: Trip[] },
): Promise<AssistantReply> {
  const response = await anthropic.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: 2000,
    system: systemPrompt(context.user, context.account, context.upcomingTrips),
    messages: messages.map(({ role, content }) => ({ role, content })),
  });
  if (response.stop_reason === "refusal") {
    return {
      content: "Sorry, I can't help with that one. Ask me about another part of your trip.",
      stopReason: response.stop_reason,
      refused: true,
    };
  }
  return {
    content: response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim(),
    stopReason: response.stop_reason,
    refused: false,
  };
}

/**
 * What kind of error writeAssistantReply threw: its class, such as "RateLimitError" or "AuthenticationError", and
 * for an Anthropic API error its HTTP status. Never its message.
 */
export function classifyReplyError(error: unknown): { errorType: string; errorStatus: number | undefined } {
  return {
    // The SDK's errors are all named "Error", so their class is what tells them apart.
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorStatus: error instanceof Anthropic.APIError ? error.status : undefined,
  };
}
