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

/** The Tripwise Assistant's reply, with why the model stopped and the tokens it used. */
export interface AssistantReply {
  content: string;
  /** Such as "end_turn", "max_tokens" when the reply was cut off, or "refusal". */
  stopReason: Anthropic.StopReason | null;
  usage: Anthropic.Usage;
}

/**
 * Writes the Tripwise Assistant's reply to the conversation by sending it to a Claude model through the
 * Anthropic SDK, and returns the reply's text with why the model stopped and the tokens it used.
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
    return { content: "Sorry, I can't help with that one. Ask me about another part of your trip.", stopReason, usage };
  }
  const content = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
  return { content, stopReason, usage };
}

/** Why writing a reply failed: the Anthropic API's HTTP status, when it answered, and the kind of error. */
export function describeReplyError(error: unknown): { status?: number; type: string } {
  if (error instanceof Anthropic.APIError) {
    // The API's error type, such as "rate_limit_error" or "overloaded_error", or else the SDK's error class, such
    // as "APIConnectionError" when the API couldn't be reached.
    return { status: error.status, type: error.type ?? error.constructor.name };
  }
  // Not from the API, such as the plain Error the SDK throws when it has no API key.
  return { type: error instanceof Error ? error.constructor.name : "unknown" };
}
