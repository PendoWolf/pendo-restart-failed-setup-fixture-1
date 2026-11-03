import { Router } from "express";
import { trackPendoEvent } from "../analytics/pendo.js";
import { requireAuth, type AuthLocals } from "../auth/require-auth.js";
import { accountStore } from "../store/accounts.js";
import { sessionStore } from "../store/sessions.js";
import { userStore } from "../store/users.js";
import type { SessionResponse, SignInRequest } from "../types.js";

export const authRouter = Router();

/**
 * Records a rejected sign-in attempt. Nobody is signed in yet, so it's sent as "system", and never with the
 * email or password that was tried.
 */
function trackSignInFailed(failureReason: string, statusCode: number): void {
  trackPendoEvent({
    event: "sign_in_failed",
    visitorId: "system",
    accountId: "system",
    properties: { failure_reason: failureReason, status_code: statusCode },
  });
}

// Signs a user in with their email and password, and returns a bearer token with the user and their account.
authRouter.post("/login", (req, res) => {
  const body = req.body as Partial<SignInRequest> | undefined;
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    trackSignInFailed("missing_fields", 400);
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const user = userStore.verifyPassword(body.email, body.password);
  const account = user ? accountStore.get(user.accountId) : undefined;
  if (!user || !account) {
    trackSignInFailed(user ? "account_not_found" : "wrong_email_or_password", 401);
    res.status(401).json({ error: "wrong email or password" });
    return;
  }
  const session: SessionResponse = { token: sessionStore.start(user.id), user, account };
  // The password checked out and a session started: record the successful sign-in.
  trackPendoEvent({
    event: "user_signed_in",
    visitorId: user.id,
    accountId: account.id,
    properties: { role: user.role, account_plan: account.plan },
  });
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
