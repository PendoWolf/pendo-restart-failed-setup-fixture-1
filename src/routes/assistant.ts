import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { signedInVisitor, trackPendoEvent } from "../analytics/pendo.js";
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
  const visitor = signedInVisitor(res);
  const startedAt = Date.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, stopReason, inputTokens, outputTokens } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    const latencyMs = Date.now() - startedAt;
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // The assistant answered: how long it took, and whether the model finished, refused or was cut off at max_tokens.
    trackPendoEvent("assistant_reply_generated", visitor, {
      conversationId: body.conversationId,
      messageCount: messages.length,
      upcomingTripCount: upcomingTrips.length,
      model: ASSISTANT_MODEL,
      stopReason,
      inputTokens,
      outputTokens,
      latencyMs,
    });
    res.json(reply);
  } catch (error) {
    // The model call threw (such as an authentication, rate-limit, overload or connection error), so the user gets a
    // 500 instead of a reply.
    trackPendoEvent("assistant_reply_failed", visitor, {
      conversationId: body.conversationId,
      messageCount: messages.length,
      model: ASSISTANT_MODEL,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStatus: error instanceof Anthropic.APIError ? error.status : undefined,
      latencyMs: Date.now() - startedAt,
    });
    next(error);
  }
});
