import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackPendoEvent, truncateForPendo } from "../analytics/pendo.js";
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
  const { conversationId } = body;
  const upcomingTrips = tripStore.upcoming();
  // How the model call ended (a reply, a refusal or an error), which only the API knows once it returns.
  const trackReplyCompleted = (properties: { outcome: string; stopReason?: string | null; replyLength?: number }) => {
    trackPendoEvent(
      "assistant_reply_completed",
      { visitorId: user.id, accountId: account.id },
      {
        conversationId: truncateForPendo(conversationId),
        messageCount: messages.length,
        upcomingTripCount: upcomingTrips.length,
        model: ASSISTANT_MODEL,
        accountPlan: account.plan,
        userRole: user.role,
        ...properties,
      },
    );
  };
  try {
    const { content, stopReason } = await writeAssistantReply(messages, { user, account, upcomingTrips });
    trackReplyCompleted({
      outcome: stopReason === "refusal" ? "refusal" : "success",
      stopReason,
      replyLength: content.length,
    });
    const reply: ChatReply = {
      conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    res.json(reply);
  } catch (error) {
    trackReplyCompleted({ outcome: "error" });
    next(error);
  }
});
