import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, describeReplyError, writeAssistantReply } from "../assistant/reply.js";
import { trackEvent } from "../pendo/track-event.js";
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
  // What the chat's Track Events say about the conversation: never its messages, only its id and length. The id comes
  // from the web app, so a long one is cut short to stay within Pendo's size limit for properties.
  const conversation = {
    conversationId: body.conversationId.slice(0, 64),
    messageCount: messages.length,
    model: ASSISTANT_MODEL,
  };
  const startedAt = Date.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, stopReason, usage } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    const latencyMs = Date.now() - startedAt;
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // Tells Pendo the model answered, and how: in full, cut off at max_tokens, or with a refusal.
    trackEvent("assistant_reply_generated", res.locals as AuthLocals, {
      ...conversation,
      userMessageCount: messages.filter((message) => message.role === "user").length,
      upcomingTripCount: upcomingTrips.length,
      stopReason: stopReason ?? undefined,
      refused: stopReason === "refusal",
      replyLength: content.length,
      latencyMs,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    });
    res.json(reply);
  } catch (error) {
    // Tells Pendo the assistant couldn't reply, before the error becomes a generic 500.
    trackEvent("assistant_reply_failed", res.locals as AuthLocals, {
      ...conversation,
      ...describeReplyError(error),
      latencyMs: Date.now() - startedAt,
    });
    next(error);
  }
});
