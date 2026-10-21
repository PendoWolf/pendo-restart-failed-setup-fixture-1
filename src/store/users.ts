import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { NewUser, User, UserUpdate } from "../types.js";

interface StoredUser extends User {
  passwordSalt: string;
  passwordHash: string;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

function withPassword(user: User, password: string): StoredUser {
  const passwordSalt = randomBytes(16).toString("hex");
  return { ...user, passwordSalt, passwordHash: hashPassword(password, passwordSalt) };
}

/** The user without their password fields, as the API returns it. */
function publicUser({ passwordSalt: _salt, passwordHash: _hash, ...user }: StoredUser): User {
  return user;
}

// Users live in memory: they reset whenever the API restarts.
const users = new Map<string, StoredUser>();

// Demo users for local development. Every one signs in with the password "tripwise-demo".
const seedUsers: User[] = [
  { id: "usr_maya", email: "maya@northwind.example", name: "Maya Chen", role: "admin", accountId: "acct_northwind" },
  { id: "usr_omar", email: "omar@northwind.example", name: "Omar Haddad", role: "member", accountId: "acct_northwind" },
  { id: "usr_lena", email: "lena@globex.example", name: "Lena Vogel", role: "admin", accountId: "acct_globex" },
];
for (const user of seedUsers) {
  users.set(user.id, withPassword(user, "tripwise-demo"));
}

export const userStore = {
  list(accountId?: string): User[] {
    return [...users.values()]
      .filter((user) => accountId === undefined || user.accountId === accountId)
      .map(publicUser)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  get(id: string): User | undefined {
    const user = users.get(id);
    return user ? publicUser(user) : undefined;
  },
  findByEmail(email: string): User | undefined {
    const wanted = email.trim().toLowerCase();
    const user = [...users.values()].find((candidate) => candidate.email === wanted);
    return user ? publicUser(user) : undefined;
  },
  /** Returns the user when `password` is theirs, or undefined. */
  verifyPassword(email: string, password: string): User | undefined {
    const wanted = email.trim().toLowerCase();
    const user = [...users.values()].find((candidate) => candidate.email === wanted);
    if (!user) return undefined;
    const given = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
    const stored = Buffer.from(user.passwordHash, "hex");
    return timingSafeEqual(given, stored) ? publicUser(user) : undefined;
  },
  create({ password, ...user }: NewUser): User {
    const created = withPassword(
      { ...user, id: `usr_${randomUUID()}`, email: user.email.trim().toLowerCase() },
      password,
    );
    users.set(created.id, created);
    return publicUser(created);
  },
  /** Updates the user, and returns undefined when there's none with that id. */
  update(id: string, changes: UserUpdate): User | undefined {
    const current = users.get(id);
    if (!current) return undefined;
    const updated: StoredUser = {
      ...current,
      ...changes,
      email: (changes.email ?? current.email).trim().toLowerCase(),
      id,
    };
    users.set(id, updated);
    return publicUser(updated);
  },
  /** Deletes the user, and returns false when there was none with that id. */
  remove(id: string): boolean {
    return users.delete(id);
  },
};
