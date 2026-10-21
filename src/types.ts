/** A planned trip, as the Tripwise web app lists it. */
export interface Trip {
  id: string;
  destination: string;
  /** ISO date, such as "2026-11-03". */
  startDate: string;
  /** ISO date, on or after startDate. */
  endDate: string;
  travelers: number;
}

/** The body of POST /api/trips and PUT /api/trips/:id. */
export type NewTrip = Omit<Trip, "id">;

/** A company that uses Tripwise. Every user belongs to one account. */
export interface Account {
  id: string;
  name: string;
  plan: "Starter" | "Business" | "Enterprise";
}

/** The body of POST /api/accounts and PUT /api/accounts/:id. */
export type NewAccount = Omit<Account, "id">;

export type UserRole = "admin" | "member";

/** A person who signs in to Tripwise, as the API returns them (never with a password). */
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** The id of the account (company) the user belongs to. */
  accountId: string;
}

/** The body of POST /api/users. */
export type NewUser = Omit<User, "id"> & { password: string };

/** The body of PUT /api/users/:id: any of the user's own fields. */
export type UserUpdate = Partial<Pick<User, "email" | "name" | "role">>;

/** The body of POST /api/auth/login. */
export interface SignInRequest {
  email: string;
  password: string;
}

/** What POST /api/auth/login and GET /api/auth/me return. */
export interface SessionResponse {
  token: string;
  user: User;
  account: Account;
}

export type ChatRole = "user" | "assistant";

/** One message of a conversation, as the web app sends it. */
export interface IncomingChatMessage {
  role: ChatRole;
  content: string;
}

/** The body of POST /api/assistant/chat. */
export interface ChatRequest {
  conversationId: string;
  messages: IncomingChatMessage[];
}

/** The assistant's reply, as POST /api/assistant/chat returns it. */
export interface ChatReply {
  conversationId: string;
  message: { id: string; role: "assistant"; content: string };
}
