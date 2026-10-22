import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
import { tripStore } from "../store/trips.js";
import type { ChatReply, ChatRequest } from "../types.js";

/** The Tripwise Assistant's agentId in Pendo, which its trackAgent events are reported under. */
const ASSISTANT_AGENT_ID = "COB0ZWmfMQkVA2Q7h6xTF-YkU1Q";

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
  // The conversation's last message is the one the user just sent.
  const prompt = messages[messages.length - 1];
  try {
    // globalThis.pendo is only there where Pendo's web SDK (or a stand-in) is loaded, so in plain Node these
    // trackAgent calls are skipped.
    if (prompt.role === "user") {
      globalThis.pendo?.trackAgent("prompt", {
        agentId: ASSISTANT_AGENT_ID,
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
    // Reported under the id the web app gets back, so reactions to this reply can refer to it.
    globalThis.pendo?.trackAgent("agent_response", {
      agentId: ASSISTANT_AGENT_ID,
      conversationId: reply.conversationId,
      messageId: reply.message.id,
      content: reply.message.content,
      modelUsed: ASSISTANT_MODEL,
    });
    res.json(reply);
  } catch (error) {
    next(error);
  }
});
