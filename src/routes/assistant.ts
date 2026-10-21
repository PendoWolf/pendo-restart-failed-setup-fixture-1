import { randomUUID } from "node:crypto";
import { APIError } from "@anthropic-ai/sdk";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
import { trackEvent } from "../pendo/track.js";
import { tripStore } from "../store/trips.js";
import type { ChatReply, ChatRequest } from "../types.js";

export const assistantRouter = Router();

/** The error's class name, such as "RateLimitError": the Anthropic SDK's errors leave `name` as "Error". */
function errorName(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  return error.name !== "Error" ? error.name : error.constructor.name;
}

// The web app sends the whole conversation each time, so the API keeps no chat state of its own. The reply
// comes from a large language model (src/assistant/reply.ts).
assistantRouter.post("/chat", async (req, res, next) => {
  const body = req.body as Partial<ChatRequest> | undefined;
  if (!body || typeof body.conversationId !== "string" || !Array.isArray(body.messages)) {
    res.status(400).json({ error: "conversationId and messages are required" });
    return;
  }
  const messages = body.messages.filter(
    (message) =>
      (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string",
  );
  if (messages.length === 0 || messages[0].role !== "user") {
    res.status(400).json({ error: "the conversation must start with a user message" });
    return;
  }
  const { user, account } = res.locals as AuthLocals;
  const startedAt = Date.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, stopReason } = await writeAssistantReply(messages, { user, account, upcomingTrips });
    const latencyMs = Date.now() - startedAt;
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // The text of the messages and of the reply never goes to Pendo.
    trackEvent({
      event: "assistant_reply_generated",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId: body.conversationId,
        messageId: reply.message.id,
        messageCount: messages.length,
        upcomingTripCount: upcomingTrips.length,
        model: ASSISTANT_MODEL,
        stopReason: stopReason ?? undefined,
        refused: stopReason === "refusal",
        replyLength: content.length,
        latencyMs,
      },
    });
    res.json(reply);
  } catch (error) {
    // The model call failed, so the user gets a 500 and no reply.
    trackEvent({
      event: "assistant_reply_failed",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId: body.conversationId,
        messageCount: messages.length,
        model: ASSISTANT_MODEL,
        errorName: errorName(error),
        errorStatus: error instanceof APIError ? error.status : undefined,
        latencyMs: Date.now() - startedAt,
      },
    });
    next(error);
  }
});
