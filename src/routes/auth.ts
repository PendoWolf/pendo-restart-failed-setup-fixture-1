import { Router } from "express";
import { ANONYMOUS_ID, trackEvent, truncate } from "../analytics/pendo.js";
import { requireAuth, type AuthLocals } from "../auth/require-auth.js";
import { accountStore } from "../store/accounts.js";
import { sessionStore } from "../store/sessions.js";
import { userStore } from "../store/users.js";
import type { SessionResponse, SignInRequest } from "../types.js";

export const authRouter = Router();

/**
 * Pendo Track Event for a rejected sign-in. Sent anonymously: never with the password or the raw email, only
 * the email's domain.
 */
function trackSignInFailed(
  failureReason: "missing_credentials" | "wrong_credentials" | "no_account",
  statusCode: 400 | 401,
  email: unknown,
): void {
  const domain = typeof email === "string" && email.includes("@") ? email.trim().split("@").pop() : undefined;
  trackEvent({
    event: "sign_in_failed",
    visitorId: ANONYMOUS_ID,
    accountId: ANONYMOUS_ID,
    properties: {
      failureReason,
      statusCode,
      emailDomain: domain ? truncate(domain.toLowerCase()) : null,
    },
  });
}

// Signs a user in with their email and password, and returns a bearer token with the user and their account.
authRouter.post("/login", (req, res) => {
  const body = req.body as Partial<SignInRequest> | undefined;
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    trackSignInFailed("missing_credentials", 400, body?.email);
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const user = userStore.verifyPassword(body.email, body.password);
  const account = user ? accountStore.get(user.accountId) : undefined;
  if (!user || !account) {
    trackSignInFailed(user ? "no_account" : "wrong_credentials", 401, body.email);
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
