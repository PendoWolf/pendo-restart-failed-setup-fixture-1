import { Router } from "express";
import { SYSTEM_VISITOR, trackPendoEvent } from "../analytics/pendo.js";
import { requireAuth, type AuthLocals } from "../auth/require-auth.js";
import { accountStore } from "../store/accounts.js";
import { sessionStore } from "../store/sessions.js";
import { userStore } from "../store/users.js";
import type { SessionResponse, SignInRequest } from "../types.js";

/**
 * Tells Pendo a sign-in was turned down. It's credited to the user who has the email when there is one, and never
 * carries the email or password.
 */
function trackSignInFailed(email: unknown, failureReason: "missing_credentials" | "invalid_credentials"): void {
  const matched = typeof email === "string" ? userStore.findByEmail(email) : undefined;
  const visitor = matched ? { visitorId: matched.id, accountId: matched.accountId } : SYSTEM_VISITOR;
  trackPendoEvent("sign_in_failed", visitor, { failureReason, emailRecognized: matched !== undefined });
}

export const authRouter = Router();

// Signs a user in with their email and password, and returns a bearer token with the user and their account.
authRouter.post("/login", (req, res) => {
  const body = req.body as Partial<SignInRequest> | undefined;
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    trackSignInFailed(body?.email, "missing_credentials");
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const user = userStore.verifyPassword(body.email, body.password);
  const account = user ? accountStore.get(user.accountId) : undefined;
  if (!user || !account) {
    trackSignInFailed(body.email, "invalid_credentials");
    res.status(401).json({ error: "wrong email or password" });
    return;
  }
  const session: SessionResponse = { token: sessionStore.start(user.id), user, account };
  res.json(session);
});

// Returns the signed-in user and their account.
authRouter.get("/me", requireAuth, (_req, res) => {
  const { token, user, account } = res.locals as AuthLocals;
  const session: SessionResponse = { token, user, account };
  res.json(session);
});

// Ends the session: its token stops working.
authRouter.post("/logout", requireAuth, (_req, res) => {
  sessionStore.end((res.locals as AuthLocals).token);
  res.status(204).end();
});
