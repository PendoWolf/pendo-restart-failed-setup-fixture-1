import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackServerEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, REFUSAL_REPLY, writeAssistantReply } from "../assistant/reply.js";
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
  // The conversation's shape, sent with assistant_reply_generated whether or not a reply comes back.
  const conversation = {
    conversationId: body.conversationId,
    messageCount: messages.length,
    userMessageCount: messages.filter((message) => message.role === "user").length,
    upcomingTripCount: upcomingTrips.length,
    model: ASSISTANT_MODEL,
  };
  try {
    const content = await writeAssistantReply(messages, { user, account, upcomingTrips });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // The model's reply came back (possibly a refusal).
    trackServerEvent("assistant_reply_generated", {
      visitorId: user.id,
      accountId: account.id,
      properties: {
        ...conversation,
        refused: content === REFUSAL_REPLY,
        replyLength: content.length,
        success: true,
      },
    });
    res.json(reply);
  } catch (error) {
    // The model call failed, so no reply came back.
    trackServerEvent("assistant_reply_generated", {
      visitorId: user.id,
      accountId: account.id,
      properties: {
        ...conversation,
        refused: false,
        replyLength: 0,
        success: false,
        errorType: error instanceof Error ? error.name : "unknown",
      },
    });
    next(error);
  }
});
