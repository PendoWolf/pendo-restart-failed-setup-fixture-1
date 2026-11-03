import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
import { tripStore } from "../store/trips.js";
import type { ChatReply, ChatRequest } from "../types.js";

export const assistantRouter = Router();

/** The Tripwise Assistant's agent id in Pendo. */
const PENDO_AGENT_ID = "PXcPKoBMsUGoNwhwwR_Lkuo3TF0";

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
  // The newest message is the prompt this request answers. Pendo is a browser global, so it's only reported to
  // when an agent is loaded.
  const prompt = messages[messages.length - 1];
  if (prompt.role === "user") {
    globalThis.pendo?.trackAgent("prompt", {
      agentId: PENDO_AGENT_ID,
      conversationId: body.conversationId,
      messageId: randomUUID(),
      content: prompt.content,
      fileUploaded: false,
    });
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
    globalThis.pendo?.trackAgent("agent_response", {
      agentId: PENDO_AGENT_ID,
      conversationId: reply.conversationId,
      messageId: reply.message.id,
      content: reply.message.content,
      modelUsed: ASSISTANT_MODEL,
      toolsUsed: [],
    });
    res.json(reply);
  } catch (error) {
    next(error);
  }
});
