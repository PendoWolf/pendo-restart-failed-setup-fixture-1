import { randomUUID } from "node:crypto";
import type { Account, NewAccount } from "../types.js";

// Accounts live in memory: they reset whenever the API restarts. A real deployment
// would swap this module for a database without touching the routes.
const accounts = new Map<string, Account>();

const seedAccounts: Account[] = [
  { id: "acct_northwind", name: "Northwind Travel", plan: "Business" },
  { id: "acct_globex", name: "Globex Corporation", plan: "Starter" },
];
for (const account of seedAccounts) {
  accounts.set(account.id, account);
}

export const accountStore = {
  list(): Account[] {
    return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
  get(id: string): Account | undefined {
    return accounts.get(id);
  },
  create(account: NewAccount): Account {
    const created: Account = { id: `acct_${randomUUID()}`, ...account };
    accounts.set(created.id, created);
    return created;
  },
  /** Updates the account, and returns undefined when there's none with that id. */
  update(id: string, changes: Partial<NewAccount>): Account | undefined {
    const current = accounts.get(id);
    if (!current) return undefined;
    const updated: Account = { ...current, ...changes, id };
    accounts.set(id, updated);
    return updated;
  },
  /** Deletes the account, and returns false when there was none with that id. */
  remove(id: string): boolean {
    return accounts.delete(id);
  },
};
