/** The Pendo agent, where one is loaded. Only its trackAgent call is used (src/analytics/pendo.ts). */
declare var pendo: { trackAgent: (eventType: string, metadata: object) => void };
