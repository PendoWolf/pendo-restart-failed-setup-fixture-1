import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
import { clip, identityOf, trackEvent } from "../pendo/track.js";
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
  // Pendo Track Event properties shared by the success, refusal and failure variants of assistant_reply_generated.
  const conversationProperties = {
    conversationId: clip(body.conversationId),
    messageCount: messages.length,
    userTurnCount: messages.filter((message) => message.role === "user").length,
    model: ASSISTANT_MODEL,
    upcomingTripCount: upcomingTrips.length,
    accountPlan: account.plan,
  };
  try {
    const { content, refused } = await writeAssistantReply(messages, { user, account, upcomingTrips });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // Pendo Track Event: the model answered (or refused), which a click on the chat send button can't tell apart.
    trackEvent("assistant_reply_generated", identityOf({ user, account }), {
      ...conversationProperties,
      replyLength: content.length,
      refused,
      outcome: refused ? "refused" : "success",
    });
    res.json(reply);
  } catch (error) {
    // Pendo Track Event, failure variant: the model call (or building the reply) threw.
    trackEvent("assistant_reply_generated", identityOf({ user, account }), {
      ...conversationProperties,
      refused: false,
      outcome: "failed",
      failureType: clip(error instanceof Error ? error.name : "unknown", 50),
    });
    next(error);
  }
});
