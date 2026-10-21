import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, describeReplyError, writeAssistantReply } from "../assistant/reply.js";
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
  const startedAt = Date.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, stopReason, usage } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // The assistant answered: how long the model took, and whether it refused or was cut off at max_tokens. Only
    // the length of the reply is sent, never its text. A messageCount of 1 is a new conversation.
    trackEvent("assistant_reply_generated", user, account, {
      conversationId: body.conversationId,
      messageCount: messages.length,
      upcomingTripCount: upcomingTrips.length,
      model: ASSISTANT_MODEL,
      stopReason: stopReason ?? "unknown",
      replyLength: content.length,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      latencyMs: Date.now() - startedAt,
    });
    res.json(reply);
  } catch (error) {
    // The assistant couldn't answer (an Anthropic API error, a missing or invalid key, a network failure), which
    // the web app only sees as a generic 500.
    const failure = describeReplyError(error);
    trackEvent("assistant_reply_failed", user, account, {
      conversationId: body.conversationId,
      messageCount: messages.length,
      model: ASSISTANT_MODEL,
      errorStatus: failure.status,
      errorType: failure.type,
      latencyMs: Date.now() - startedAt,
    });
    next(error);
  }
});
