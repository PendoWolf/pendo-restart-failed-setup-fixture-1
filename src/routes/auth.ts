import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import { requireAuth, type AuthLocals } from "../auth/require-auth.js";
import { accountStore } from "../store/accounts.js";
import { sessionStore } from "../store/sessions.js";
import { userStore } from "../store/users.js";
import type { SessionResponse, SignInRequest } from "../types.js";

export const authRouter = Router();

// Signs a user in with their email and password, and returns a bearer token with the user and their account.
authRouter.post("/login", (req, res) => {
  const body = req.body as Partial<SignInRequest> | undefined;
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    // Track Event: the sign-in failed before the credentials could be checked.
    trackEvent({
      event: "sign_in_completed",
      visitorId: "system",
      accountId: "system",
      properties: { outcome: "failure", failureReason: "missing_fields" },
    });
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const user = userStore.verifyPassword(body.email, body.password);
  const account = user ? accountStore.get(user.accountId) : undefined;
  if (!user || !account) {
    // Track Event: the credentials were rejected. Attribute the attempt to the user the email belongs to, if any.
    const attemptedUser = user ?? userStore.findByEmail(body.email);
    trackEvent({
      event: "sign_in_completed",
      visitorId: attemptedUser?.id ?? "system",
      accountId: attemptedUser?.accountId ?? "system",
      properties: {
        outcome: "failure",
        failureReason: user ? "account_not_found" : "wrong_email_or_password",
        role: attemptedUser?.role,
      },
    });
    res.status(401).json({ error: "wrong email or password" });
    return;
  }
  const session: SessionResponse = { token: sessionStore.start(user.id), user, account };
  // Track Event: the credentials were accepted and a session started.
  trackEvent({
    event: "sign_in_completed",
    visitorId: user.id,
    accountId: account.id,
    properties: { outcome: "success", role: user.role, plan: account.plan },
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
