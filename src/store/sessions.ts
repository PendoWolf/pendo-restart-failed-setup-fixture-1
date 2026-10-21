import { randomBytes } from "node:crypto";

// Signed-in sessions, by bearer token. They live in memory, so a restart signs everyone out.
const sessions = new Map<string, { userId: string; createdAt: string }>();

export const sessionStore = {
  /** Starts a session for the user and returns its bearer token. */
  start(userId: string): string {
    const token = randomBytes(24).toString("base64url");
    sessions.set(token, { userId, createdAt: new Date().toISOString() });
    return token;
  },
  userIdFor(token: string): string | undefined {
    return sessions.get(token)?.userId;
  },
  end(token: string): void {
    sessions.delete(token);
  },
};
