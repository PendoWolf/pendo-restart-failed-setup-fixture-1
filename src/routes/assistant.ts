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
  const replyProperties = {
    conversation_id: body.conversationId.slice(0, 100),
    message_count: messages.length,
    user_message_count: messages.filter((message) => message.role === "user").length,
    model: ASSISTANT_MODEL,
    account_id: account.id,
    account_plan: account.plan,
  };
  let upcomingTripCount = 0;
  try {
    const upcomingTrips = tripStore.upcoming();
    upcomingTripCount = upcomingTrips.length;
    const { content, wasRefusal } = await writeAssistantReply(messages, { user, account, upcomingTrips });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // The language model's reply came back (or it refused) and the reply is ready to send.
    trackEvent(
      "assistant_reply_generated",
      { visitorId: user.id, accountId: account.id },
      {
        ...replyProperties,
        upcoming_trip_count: upcomingTripCount,
        was_refusal: wasRefusal,
        reply_length: content.length,
        outcome: "success",
      },
    );
    res.json(reply);
  } catch (error) {
    // No reply could be generated, so failed replies can be measured too.
    trackEvent(
      "assistant_reply_generated",
      { visitorId: user.id, accountId: account.id },
      {
        ...replyProperties,
        upcoming_trip_count: upcomingTripCount,
        was_refusal: false,
        reply_length: 0,
        outcome: "error",
      },
    );
    next(error);
  }
});
