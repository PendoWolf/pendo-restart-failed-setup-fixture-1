import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, describeAssistantError, writeAssistantReply } from "../assistant/reply.js";
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
  // What the assistant's track events say about the chat. Never its messages: they may hold personal details.
  const chat = { conversationId: body.conversationId, messageCount: messages.length, model: ASSISTANT_MODEL };
  const startedAt = performance.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, stopReason, inputTokens, outputTokens } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    // A refusal still gets a canned reply, so only stopReason tells it apart from a real answer.
    trackEvent("assistant_reply_generated", { user, account }, {
      ...chat,
      // The web app sends the whole conversation, so this is the turn number: 1 starts a new conversation.
      userMessageCount: messages.filter((message) => message.role === "user").length,
      stopReason: stopReason ?? undefined,
      refused: stopReason === "refusal",
      replyLength: content.length,
      upcomingTripCount: upcomingTrips.length,
      latencyMs: Math.round(performance.now() - startedAt),
      inputTokens,
      outputTokens,
    });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    res.json(reply);
  } catch (error) {
    // No answer came back: a missing or invalid API key, rate limiting, an overloaded model or a network failure.
    trackEvent("assistant_reply_failed", { user, account }, {
      ...chat,
      ...describeAssistantError(error),
      latencyMs: Math.round(performance.now() - startedAt),
    });
    next(error);
  }
});
