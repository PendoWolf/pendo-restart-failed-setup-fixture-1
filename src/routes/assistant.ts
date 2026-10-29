import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
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
    // The model answered (or refused): only the server knows the outcome and how much context it had.
    trackEvent("assistant_reply_generated", {
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId: body.conversationId,
        messageCount: messages.length,
        userMessageCount: messages.filter((message) => message.role === "user").length,
        refused,
        replyLength: content.length,
        model: ASSISTANT_MODEL,
        upcomingTripsCount: upcomingTrips.length,
        accountPlan: account.plan,
        userRole: user.role,
      },
    });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    res.json(reply);
  } catch (error) {
    // The model call failed (for example an Anthropic API error); the request ends in the 500 handler.
    trackEvent("assistant_reply_failed", {
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId: body.conversationId,
        messageCount: messages.length,
        model: ASSISTANT_MODEL,
        errorType: error instanceof Error ? error.constructor.name : "unknown",
        accountPlan: account.plan,
      },
    });
    next(error);
  }
});
