/**
 * Pendo's global, whose trackAgent reports conversations with an AI agent to Pendo. Pendo's web SDK sets it in the
 * browser; in this Node API it's undefined unless something in the process provides it, so check before calling it.
 */
declare var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
