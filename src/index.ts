import { init, shutdown } from "pendo-server-sdk";
import { createApp } from "./app.js";

// Pendo Agent Analytics for the Tripwise Assistant (writeAssistantReply). Set PENDO_DISABLED=true to turn it off.
init({
  apiKey: "e36cd04a-b9d9-428e-93b0-490c8559720c",
  agentId: "8pqkX8JqwqYDJBlErkNwU_evrcc",
  endpoint: "https://app.pendo-dev.pendo-dev.com",
  autoPatch: true,
});

const port = Number(process.env.PORT) || 3001;
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

const server = createApp(corsOrigin).listen(port, () => {
  console.log(`Tripwise API on port ${port}, allowing ${corsOrigin}`);
});

// Sends the Pendo events still buffered before the process goes.
server.on("close", () => {
  void shutdown();
});

async function stop(): Promise<void> {
  server.close();
  await shutdown();
  process.exit(0);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
