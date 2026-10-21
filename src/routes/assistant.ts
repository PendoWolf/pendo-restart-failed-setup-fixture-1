import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { ASSISTANT_MODEL, writeAssistantReply } from "../assistant/reply.js";
import { tripStore } from "../store/trips.js";
import type { ChatReply, ChatRequest } from "../types.js";

/** The Tripwise Assistant's agent id in Pendo, for its trackAgent events. */
const ASSISTANT_AGENT_ID = "7mxxTWIcEJPzJDaq-2XhR9K4oOE";

/**
 * Reports a Tripwise Assistant event to Pendo with trackAgent. It does nothing unless Pendo is installed on the global
 * object (see src/global.d.ts), and a tracking failure never fails the chat.
 */
function trackAgent(eventType: "prompt" | "agent_response", metadata: Omit<PendoAgentEvent, "agentId">): void {
  try {
    globalThis.pendo?.trackAgent(eventType, { agentId: ASSISTANT_AGENT_ID, ...metadata });
  } catch (error) {
    console.error(error);
  }
}

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
  // The user's new prompt is the conversation's last message, when that's theirs. The API takes only text, so
  // a prompt never comes with a file.
  const prompt = messages[messages.length - 1];
  if (prompt.role === "user") {
    trackAgent("prompt", {
      conversationId: body.conversationId,
      messageId: randomUUID(),
      content: prompt.content,
      fileUploaded: false,
    });
  }
  const { user, account } = res.locals as AuthLocals;
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
    res.json(reply);
    // The reply's id is also its messageId in Pendo, so the web app can report reactions to the same message.
    trackAgent("agent_response", {
      conversationId: reply.conversationId,
      messageId: reply.message.id,
      content: reply.message.content,
      modelUsed: ASSISTANT_MODEL,
    });
  } catch (error) {
    next(error);
  }
});
