import { Router } from "express";
import { accountStore } from "../store/accounts.js";
import { userStore } from "../store/users.js";
import type { NewUser, UserRole, UserUpdate } from "../types.js";

const ROLES: UserRole[] = ["admin", "member"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns why `body` isn't a valid user update, or null when it is. */
function validateUserUpdate(body: UserUpdate | undefined): string | null {
  if (!body) return "a JSON body is required";
  if (body.email !== undefined && (typeof body.email !== "string" || !EMAIL.test(body.email))) {
    return "email must be an email address";
  }
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "")) {
    return "name can't be empty";
  }
  if (body.role !== undefined && !ROLES.includes(body.role)) {
    return `role must be one of ${ROLES.join(", ")}`;
  }
  return null;
}

export const usersRouter = Router();

// Lists users, or only one account's users with ?accountId=.
usersRouter.get("/", (req, res) => {
  const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
  res.json(userStore.list(accountId));
});

usersRouter.get("/:id", (req, res) => {
  const user = userStore.get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json(user);
});

usersRouter.post("/", (req, res) => {
  const body = req.body as Partial<NewUser> | undefined;
  const problem =
    validateUserUpdate(body) ??
    (typeof body?.email !== "string" ? "email is required" : null) ??
    (typeof body?.name !== "string" ? "name is required" : null) ??
    (typeof body?.password !== "string" || body.password.length < 8
      ? "password must be at least 8 characters"
      : null) ??
    (typeof body?.accountId !== "string" || !accountStore.get(body.accountId) ? "accountId must be an account's id" : null);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  if (userStore.findByEmail(body!.email!)) {
    res.status(409).json({ error: "a user with that email already exists" });
    return;
  }
  const user = userStore.create({
    email: body!.email!,
    name: body!.name!.trim(),
    role: body!.role ?? "member",
    accountId: body!.accountId!,
    password: body!.password!,
  });
  res.status(201).json(user);
});

usersRouter.put("/:id", (req, res) => {
  const body = req.body as UserUpdate | undefined;
  const problem = validateUserUpdate(body);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const updated = userStore.update(req.params.id, {
    ...(body!.email !== undefined && { email: body!.email }),
    ...(body!.name !== undefined && { name: body!.name.trim() }),
    ...(body!.role !== undefined && { role: body!.role }),
  });
  if (!updated) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json(updated);
});

usersRouter.delete("/:id", (req, res) => {
  if (!userStore.remove(req.params.id)) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.status(204).end();
});
