import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackEvent, truncate } from "../analytics/pendo.js";
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
  const { conversationId } = body;
  const { user, account } = res.locals as AuthLocals;
  const upcomingTrips = tripStore.upcoming();
  const startedAt = Date.now();
  // Pendo Track Event: the outcome of each assistant reply (answered, refused or error), which the chat
  // panel's send button can't show.
  const trackReply = (outcome: "answered" | "refused" | "error", replyLength: number, stopReason: string | null) => {
    trackEvent({
      event: "assistant_reply_generated",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId: truncate(conversationId),
        outcome,
        messageCount: messages.length,
        userMessageCount: messages.filter((message) => message.role === "user").length,
        upcomingTripCount: upcomingTrips.length,
        replyLength,
        model: ASSISTANT_MODEL,
        stopReason,
        durationMs: Date.now() - startedAt,
        accountPlan: account.plan,
        userRole: user.role,
      },
    });
  };
  try {
    const { content, refused, stopReason } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    trackReply(refused ? "refused" : "answered", content.length, stopReason);
    const reply: ChatReply = {
      conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    res.json(reply);
  } catch (error) {
    trackReply("error", 0, null);
    next(error);
  }
});
