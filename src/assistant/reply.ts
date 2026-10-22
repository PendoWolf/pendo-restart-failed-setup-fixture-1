import Anthropic from "@anthropic-ai/sdk";
import type { Account, IncomingChatMessage, Trip, User } from "../types.js";

/** The model the Tripwise Assistant answers with. */
export const ASSISTANT_MODEL = "claude-opus-5-5";

// The SDK reads the key from the ANTHROPIC_API_KEY environment variable.
const anthropic = new Anthropic();

/** The assistant's reply, and how the model call that wrote it went. */
export interface AssistantReply {
  /** The reply's text, or a short apology when the model refused. */
  content: string;
  /** Why the model stopped, such as "end_turn", "max_tokens" (cut off) or "refusal". */
  stopReason: Anthropic.StopReason | null;
  /** The tokens the model call read and wrote. */
  usage: Anthropic.Usage;
}

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

/**
 * Writes the Tripwise Assistant's reply to the conversation by sending it to a Claude model through the
 * Anthropic SDK, and returns the reply's text with the model's stop reason and token usage.
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
  const { stop_reason: stopReason, usage } = response;
  if (stopReason === "refusal") {
    return {
      content: "Sorry, I can't help with that one. Ask me about another part of your trip.",
      stopReason,
      usage,
    };
  }
  return {
    content: response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim(),
    stopReason,
    usage,
  };
}

/**
 * What kind of error writing a reply threw, without its message: the error's class (such as "RateLimitError" or
 * "AuthenticationError"), and the HTTP status when the Anthropic API answered with one.
 */
export function describeReplyError(error: unknown): { errorType: string; errorStatus: number | undefined } {
  return {
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorStatus: error instanceof Anthropic.APIError ? error.status : undefined,
  };
}
