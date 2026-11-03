import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackEvent, truncate } from "../analytics/pendo-track.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
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
  const upcomingTrips = tripStore.upcoming();
  try {
    const { content, refused } = await writeAssistantReply(messages, { user, account, upcomingTrips });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // The model finished its reply (or refused): only known once the Anthropic call returns.
    trackEvent({
      event: "assistant_reply_generated",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId: truncate(body.conversationId),
        messageCount: messages.length,
        userMessageCount: messages.filter((message) => message.role === "user").length,
        upcomingTripsCount: upcomingTrips.length,
        refused,
        replyLength: content.length,
        model: ASSISTANT_MODEL,
        plan: account.plan,
        userRole: user.role,
      },
    });
    res.json(reply);
  } catch (error) {
    // The Anthropic call threw, so the user gets a 500 instead of a reply.
    trackEvent({
      event: "assistant_reply_failed",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId: truncate(body.conversationId),
        messageCount: messages.length,
        model: ASSISTANT_MODEL,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        plan: account.plan,
      },
    });
    next(error);
  }
});
