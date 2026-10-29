// Pendo's agent-analytics API. This is a server, so `pendo` is only defined when a Pendo integration registers it
// on the global object; src/analytics/track-agent.ts checks for it before every call.
declare var pendo: { trackAgent: (eventType: string, metadata: object) => void };
