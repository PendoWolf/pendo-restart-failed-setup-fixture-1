import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type { Account, IncomingChatMessage, Trip, User } from "../types.js";

/** The model the Tripwise Assistant answers with. */
export const ASSISTANT_MODEL = "claude-opus-5-5";

/** The assistant's reply, with how the model finished and the tokens it used. */
export interface AssistantReply {
  /** The reply's text, or a short apology when the model refused. */
  content: string;
  /** Why the model stopped, such as "end_turn", "max_tokens" or "refusal". */
  stopReason: Anthropic.Message["stop_reason"];
  /** Whether the model refused, so `content` is the apology rather than the model's own words. */
  refused: boolean;
  inputTokens: number;
  outputTokens: number;
}

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

/**
 * Writes the Tripwise Assistant's reply to the conversation by sending it to a Claude model through the
 * Anthropic SDK, and returns the reply's text with how the model finished and the tokens it used.
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
  const outcome = {
    stopReason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  if (response.stop_reason === "refusal") {
    return {
      ...outcome,
      refused: true,
      content: "Sorry, I can't help with that one. Ask me about another part of your trip.",
    };
  }
  return {
    ...outcome,
    refused: false,
    content: response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim(),
  };
}

/**
 * What kind of error writeAssistantReply threw, for reporting it: the error's class, such as "RateLimitError" or
 * "APIConnectionError" from the Anthropic SDK, and the Anthropic API's HTTP status when there was one.
 */
export function replyErrorDetails(error: unknown): { errorType: string; errorStatus: number | undefined } {
  return {
    // The SDK's error classes don't set `name`, so it's "Error" for all of them: use the class's own name.
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorStatus: error instanceof APIError ? error.status : undefined,
  };
}
