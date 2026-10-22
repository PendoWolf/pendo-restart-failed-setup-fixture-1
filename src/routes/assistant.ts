import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
import { tripStore } from "../store/trips.js";
import type { ChatReply, ChatRequest } from "../types.js";

/** The Tripwise Assistant's agent id in Pendo, on every trackAgent event. */
const PENDO_AGENT_ID = "PntL-oJaBf6O-wmmx75LBr7E2xY";

/**
 * Pendo's trackAgent API, there only when a Pendo agent is loaded: never on a plain Node server. Every call checks
 * for it first, so the assistant answers the same without it.
 */
declare var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;

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
  try {
    // The user's new message is the last one: track it as a prompt before the model answers.
    const prompt = messages[messages.length - 1];
    if (typeof pendo !== "undefined" && prompt.role === "user") {
      pendo.trackAgent("prompt", {
        agentId: PENDO_AGENT_ID,
        conversationId: body.conversationId,
        messageId: randomUUID(),
        content: prompt.content,
      });
    }
    const content = await writeAssistantReply(messages, {
      user,
      account,
      upcomingTrips: tripStore.upcoming(),
    });
    const reply: ChatReply = {
      conversationId: body.conversationId,
      message: { id: randomUUID(), role: "assistant", content },
    };
    // Track the finished reply under the id the web app gets, so feedback on the reply can use the same id.
    if (typeof pendo !== "undefined") {
      pendo.trackAgent("agent_response", {
        agentId: PENDO_AGENT_ID,
        conversationId: reply.conversationId,
        messageId: reply.message.id,
        content: reply.message.content,
        modelUsed: ASSISTANT_MODEL,
      });
    }
    res.json(reply);
  } catch (error) {
    next(error);
  }
});
