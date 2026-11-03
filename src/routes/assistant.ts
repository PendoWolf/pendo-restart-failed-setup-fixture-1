import { randomUUID } from "node:crypto";
import { Router } from "express";
import { trackPendoEvent, truncate } from "../analytics/pendo.js";
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
  const conversationId = truncate(body.conversationId, 64);
  const startedAt = Date.now();
  try {
    const upcomingTrips = tripStore.upcoming();
    const { content, isRefusal, stopReason } = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips,
    });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // The model call returned: record whether it answered or refused, and how much context it had.
    trackPendoEvent({
      event: "assistant_reply_generated",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId,
        message_id: reply.message.id,
        message_count: messages.length,
        user_message_count: messages.filter((message) => message.role === "user").length,
        upcoming_trip_count: upcomingTrips.length,
        model: ASSISTANT_MODEL,
        is_refusal: isRefusal,
        stop_reason: stopReason,
        reply_length: content.length,
        latency_ms: Date.now() - startedAt,
        account_plan: account.plan,
      },
    });
    res.json(reply);
  } catch (error) {
    // The Anthropic call threw (missing key, rate limit, timeout...) and the user is about to get a 500.
    const status = (error as { status?: unknown } | null)?.status;
    trackPendoEvent({
      event: "assistant_reply_failed",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        conversationId,
        message_count: messages.length,
        model: ASSISTANT_MODEL,
        error_type: error instanceof Error ? error.constructor.name : typeof error,
        error_status: typeof status === "number" ? status : undefined,
        latency_ms: Date.now() - startedAt,
      },
    });
    next(error);
  }
});
