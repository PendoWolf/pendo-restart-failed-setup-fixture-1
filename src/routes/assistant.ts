import { randomUUID } from "node:crypto";
import { Router } from "express";
import { pendoFor } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, PENDO_AGENT_ID, writeAssistantReply } from "../assistant/reply.js";
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
  const pendo = pendoFor(user, account);
  // The last message is the one the user just sent: the ones before it were tracked when they were sent. Messages
  // are only ever text, so no file comes with it.
  const latest = messages[messages.length - 1];
  if (latest.role === "user") {
    pendo.trackAgent("prompt", {
      agentId: PENDO_AGENT_ID,
      conversationId: body.conversationId,
      messageId: randomUUID(),
      content: latest.content,
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
    // The reply's id is the one the web app gets, so a reaction to the reply can carry it. The model has no tools.
    pendo.trackAgent("agent_response", {
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
