import type { NextFunction, Request, Response } from "express";
import { accountStore } from "../store/accounts.js";
import { sessionStore } from "../store/sessions.js";
import { userStore } from "../store/users.js";
import type { Account, User } from "../types.js";

/** What requireAuth puts on res.locals for the routes after it. */
export interface AuthLocals {
  token: string;
  user: User;
  account: Account;
}

/** Reads the bearer token from the Authorization header, or undefined. */
export function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;
}

/** Lets the request through only with a signed-in session, and puts its user and account on res.locals. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  const userId = token ? sessionStore.userIdFor(token) : undefined;
  const user = userId ? userStore.get(userId) : undefined;
  const account = user ? accountStore.get(user.accountId) : undefined;
  if (!token || !user || !account) {
    res.status(401).json({ error: "sign in first" });
    return;
  }
  const locals: AuthLocals = { token, user, account };
  Object.assign(res.locals, locals);
  next();
}
