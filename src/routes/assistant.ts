import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
import { TRIPWISE_ASSISTANT_AGENT_ID, trackAgent } from "../assistant/track-agent.js";
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
  const visitor = { user, account, ip: req.ip, userAgent: req.get("user-agent") };
  // The web app resends the whole conversation, so the new prompt is its last message.
  const prompt = messages[messages.length - 1];
  if (prompt.role === "user") {
    trackAgent(
      "prompt",
      {
        agentId: TRIPWISE_ASSISTANT_AGENT_ID,
        conversationId: body.conversationId,
        messageId: randomUUID(),
        content: prompt.content,
        fileUploaded: false,
      },
      visitor,
    );
  }
  try {
    const content = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips: tripStore.upcoming(),
    });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    trackAgent(
      "agent_response",
      {
        agentId: TRIPWISE_ASSISTANT_AGENT_ID,
        conversationId: reply.conversationId,
        messageId: reply.message.id,
        content: reply.message.content,
        modelUsed: ASSISTANT_MODEL,
      },
      visitor,
    );
    res.json(reply);
  } catch (error) {
    next(error);
  }
});
