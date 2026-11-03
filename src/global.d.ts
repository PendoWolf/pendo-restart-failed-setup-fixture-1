/**
 * Pendo's agent, when one is loaded. It's a browser global, so on the API it's usually undefined; the Tripwise
 * Assistant's chat route (src/routes/assistant.ts) reports to it with trackAgent only when it's there.
 */
declare var pendo: { trackAgent: (eventType: string, metadata: object) => void } | undefined;
