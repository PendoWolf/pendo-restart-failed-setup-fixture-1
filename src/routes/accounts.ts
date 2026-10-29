import { Router } from "express";
import { trackServerEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { accountStore } from "../store/accounts.js";
import { userStore } from "../store/users.js";
import type { Account, NewAccount } from "../types.js";

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
  const created = accountStore.create({ name: body!.name!.trim(), plan: body!.plan! });
  // A new company account exists, on the plan it was created with.
  const { user, account } = res.locals as AuthLocals;
  trackServerEvent("account_created", {
    visitorId: user.id,
    accountId: account.id,
    properties: { accountId: created.id, plan: created.plan },
  });
  res.status(201).json(created);
});

accountsRouter.put("/:id", (req, res) => {
  const body = req.body as Partial<NewAccount> | undefined;
  const problem = validateAccount(body, true);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  // Read before the update, to know which plan the account had.
  const previousPlan = accountStore.get(req.params.id)?.plan;
  const updated = accountStore.update(req.params.id, {
    ...(body!.name !== undefined && { name: body!.name.trim() }),
    ...(body!.plan !== undefined && { plan: body!.plan }),
  });
  if (!updated) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  // Only a real plan change counts, not a name-only edit or saving the same plan again.
  if (previousPlan !== undefined && previousPlan !== updated.plan) {
    const { user, account } = res.locals as AuthLocals;
    trackServerEvent("account_plan_changed", {
      visitorId: user.id,
      accountId: account.id,
      properties: {
        accountId: updated.id,
        previousPlan,
        newPlan: updated.plan,
        changeDirection: PLANS.indexOf(updated.plan) > PLANS.indexOf(previousPlan) ? "upgrade" : "downgrade",
      },
    });
  }
  res.json(updated);
});

accountsRouter.delete("/:id", (req, res) => {
  if (userStore.list(req.params.id).length > 0) {
    res.status(409).json({ error: "the account still has users" });
    return;
  }
  if (!accountStore.remove(req.params.id)) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  res.status(204).end();
});
