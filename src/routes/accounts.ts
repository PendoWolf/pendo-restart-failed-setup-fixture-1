import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { trackEvent } from "../pendo/track-event.js";
import { accountStore } from "../store/accounts.js";
import { userStore } from "../store/users.js";
import type { Account, NewAccount } from "../types.js";

// From the cheapest plan to the most expensive, so moving later in the list is an upgrade.
const PLANS: Account["plan"][] = ["Starter", "Business", "Enterprise"];

/** Returns why `body` isn't a valid account, or null when it is. Fields may be left out only when `partial`. */
function validateAccount(body: Partial<NewAccount> | undefined, partial: boolean): string | null {
  if (!body) return "a JSON body is required";
  if ((!partial || body.name !== undefined) && (typeof body.name !== "string" || body.name.trim() === "")) {
    return "name is required";
  }
  if ((!partial || body.plan !== undefined) && !PLANS.includes(body.plan as Account["plan"])) {
    return `plan must be one of ${PLANS.join(", ")}`;
  }
  return null;
}

export const accountsRouter = Router();

accountsRouter.get("/", (_req, res) => {
  res.json(accountStore.list());
});

accountsRouter.get("/:id", (req, res) => {
  const account = accountStore.get(req.params.id);
  if (!account) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  res.json(account);
});

// Lists the users who belong to the account.
accountsRouter.get("/:id/users", (req, res) => {
  if (!accountStore.get(req.params.id)) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  res.json(userStore.list(req.params.id));
});

accountsRouter.post("/", (req, res) => {
  const body = req.body as Partial<NewAccount> | undefined;
  const problem = validateAccount(body, false);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const account = accountStore.create({ name: body!.name!.trim(), plan: body!.plan! });
  // Tells Pendo an account was created, and on which plan. The new account has no users yet, so the event goes to
  // the signed-in user who created it, and their own account.
  trackEvent("account_created", res.locals as AuthLocals, { newAccountId: account.id, plan: account.plan });
  res.status(201).json(account);
});

accountsRouter.put("/:id", (req, res) => {
  const body = req.body as Partial<NewAccount> | undefined;
  const problem = validateAccount(body, true);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  // Read before updating, so a plan change can be told apart from a rename.
  const previous = accountStore.get(req.params.id);
  const updated = accountStore.update(req.params.id, {
    ...(body!.name !== undefined && { name: body!.name.trim() }),
    ...(body!.plan !== undefined && { plan: body!.plan }),
  });
  if (!updated) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  // Tells Pendo the account moved to a different plan, only when it really did.
  if (previous && body!.plan !== undefined && body!.plan !== previous.plan) {
    trackEvent("account_plan_changed", res.locals as AuthLocals, {
      accountId: updated.id,
      previousPlan: previous.plan,
      newPlan: updated.plan,
      changeDirection: PLANS.indexOf(updated.plan) > PLANS.indexOf(previous.plan) ? "upgrade" : "downgrade",
      accountUserCount: userStore.list(updated.id).length,
    });
  }
  res.json(updated);
});

accountsRouter.delete("/:id", (req, res) => {
  if (userStore.list(req.params.id).length > 0) {
    res.status(409).json({ error: "the account still has users" });
    return;
  }
  // Read before it's removed, so the Track Event can say which plan the account was on.
  const account = accountStore.get(req.params.id);
  if (!accountStore.remove(req.params.id)) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  // Tells Pendo the account is gone: only now, after the checks above, is that known.
  trackEvent("account_deleted", res.locals as AuthLocals, { deletedAccountId: req.params.id, plan: account?.plan });
  res.status(204).end();
});
