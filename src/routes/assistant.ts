import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, classifyReplyError, writeAssistantReply } from "../assistant/reply.js";
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
  // What the assistant's Track Events say about the conversation: how deep it is, never what it says.
  const conversation = {
    conversationId: body.conversationId.slice(0, 100),
    messageCount: messages.length,
    userMessageCount: messages.filter((message) => message.role === "user").length,
    model: ASSISTANT_MODEL,
  };
  const startedAt = Date.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, stopReason, refused } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    const latencyMs = Date.now() - startedAt;
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    trackEvent("assistant_reply_generated", {
      visitorId: user.id,
      accountId: account.id,
      properties: {
        ...conversation,
        upcomingTripCount: upcomingTrips.length,
        stopReason,
        refused,
        replyLength: content.length,
        latencyMs,
      },
    });
    res.json(reply);
  } catch (error) {
    trackEvent("assistant_reply_failed", {
      visitorId: user.id,
      accountId: account.id,
      properties: { ...conversation, ...classifyReplyError(error), latencyMs: Date.now() - startedAt },
    });
    next(error);
  }
});
