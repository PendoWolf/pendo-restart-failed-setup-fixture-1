import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, replyErrorDetails, writeAssistantReply } from "../assistant/reply.js";
import { tripStore } from "../store/trips.js";
import type { ChatReply, ChatRequest } from "../types.js";

export const assistantRouter = Router();

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
  // What Pendo hears about the conversation, whether the reply works out or not. Never the messages' text: it's
  // free text that may hold personal details.
  const conversation = {
    conversationId: body.conversationId,
    messageCount: messages.length,
    isNewConversation: messages.length === 1,
    model: ASSISTANT_MODEL,
  };
  const startedAt = Date.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, stopReason, refused, inputTokens, outputTokens } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    trackEvent("assistant_reply_generated", user, account, {
      ...conversation,
      messageId: reply.message.id,
      userMessageCount: messages.filter((message) => message.role === "user").length,
      upcomingTripsCount: upcomingTrips.length,
      stopReason,
      refused,
      replyLength: content.length,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
    });
    res.json(reply);
  } catch (error) {
    trackEvent("assistant_reply_failed", user, account, {
      ...conversation,
      ...replyErrorDetails(error),
      latencyMs: Date.now() - startedAt,
    });
    next(error);
  }
});
