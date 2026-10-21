# Tripwise API

The backend for **Tripwise**, a trip-planning web app with an AI travel assistant. This repo
is the **API only**: a Node + Express + TypeScript service that serves JSON. It has no web
pages of its own.

The web app that calls it lives in its own repo, `PendoWolf/qawolf-pendo-ai-chat-frontend`
(a Vite + React app). Run the two side by side:

| Repo | Runs on | Talks to |
| --- | --- | --- |
| `qawolf-pendo-ai-chat-frontend` (`web/`) | http://localhost:5173 | this API at its `VITE_API_URL` |
| `qawolf-pendo-ai-chat-api` (this repo) | http://localhost:3001 | the Anthropic API, for the assistant's replies |

The web app's `VITE_API_URL` defaults to `http://localhost:3001`, this API's default port, and
this API allows the web app's origin (`CORS_ORIGIN`, default `http://localhost:5173`).

## Users and accounts

Every **user** belongs to one **account**, the company they travel for. Signing in returns a
bearer token with the user and their account; every route except `/health` and
`POST /api/auth/login` needs `Authorization: Bearer <token>`.

The API starts with two demo accounts and three demo users, who all sign in with the password
`tripwise-demo`:

| User | Email | Role | Account |
| --- | --- | --- | --- |
| Maya Chen (`usr_maya`) | `maya@northwind.example` | admin | Northwind Travel (`acct_northwind`) |
| Omar Haddad (`usr_omar`) | `omar@northwind.example` | member | Northwind Travel (`acct_northwind`) |
| Lena Vogel (`usr_lena`) | `lena@globex.example` | admin | Globex Corporation (`acct_globex`) |

## Endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ token, user, account }`, or `401` |
| `GET` | `/api/auth/me` | | `{ token, user, account }` for the signed-in session |
| `POST` | `/api/auth/logout` | | `204`; the token stops working |
| `GET` | `/api/trips` | | `Trip[]` |
| `GET` | `/api/trips/:id` | | `Trip`, or `404` |
| `POST` | `/api/trips` | `{ destination, startDate, endDate, travelers }` | `201` and the `Trip` |
| `PUT` | `/api/trips/:id` | `{ destination, startDate, endDate, travelers }` | the updated `Trip`, or `404` |
| `DELETE` | `/api/trips/:id` | | `204`, or `404` when there's no such trip |
| `GET` | `/api/users` | `?accountId=` to filter | `User[]` |
| `GET` | `/api/users/:id` | | `User`, or `404` |
| `POST` | `/api/users` | `{ email, name, role?, accountId, password }` | `201` and the `User` |
| `PUT` | `/api/users/:id` | any of `{ email, name, role }` | the updated `User` |
| `DELETE` | `/api/users/:id` | | `204`, or `404` |
| `GET` | `/api/accounts` | | `Account[]` |
| `GET` | `/api/accounts/:id` | | `Account`, or `404` |
| `GET` | `/api/accounts/:id/users` | | the account's `User[]` |
| `POST` | `/api/accounts` | `{ name, plan }` | `201` and the `Account` |
| `PUT` | `/api/accounts/:id` | any of `{ name, plan }` | the updated `Account` |
| `DELETE` | `/api/accounts/:id` | | `204`, `404`, or `409` while it still has users |
| `POST` | `/api/assistant/chat` | `{ conversationId, messages: [{ role, content }] }` | `{ conversationId, message: { id, role: "assistant", content } }` |
| `GET` | `/health` | | `{ status: "ok" }` |

`Trip` is `{ id, destination, startDate, endDate, travelers }`, with dates like `2026-11-03`.
`User` is `{ id, email, name, role, accountId }` (never with a password). `Account` is
`{ id, name, plan }`, where `plan` is `Starter`, `Business` or `Enterprise`. A bad request gets
`400` and `{ error }`.

## Tripwise Assistant

`POST /api/assistant/chat` answers the web app's "Tripwise Assistant" chat panel. The web app
sends the whole conversation each time, so the API keeps no chat state. The reply comes from a
Claude model through the Anthropic SDK (`src/assistant/reply.ts`), which reads its key from
`ANTHROPIC_API_KEY`. The model is told who the signed-in user is, their account, and their
upcoming trips.

## Pendo Track Events

Some outcomes are only known here, such as whether a trip was saved or the assistant's model call
failed, so the API sends them to Pendo itself, through Pendo's server-side Track Event API
(`src/pendo/track.ts`):

| Event | Sent when |
| --- | --- |
| `trip_created` | `POST /api/trips` saved a trip |
| `trip_updated` | `PUT /api/trips/:id` changed a trip's details |
| `assistant_reply_generated` | the assistant's reply came back from the model |
| `assistant_reply_failed` | the model call failed, so the user got a `500` |
| `team_member_added` | `POST /api/users` added a user |
| `team_member_role_changed` | `PUT /api/users/:id` changed a user's role |
| `account_created` | `POST /api/accounts` created an account |
| `account_plan_changed` | `PUT /api/accounts/:id` changed an account's plan |

Each event is for the signed-in user and their account, except that `account_plan_changed` is for
the account whose plan changed. Events are sent in the background, so they never slow down or
change a response. Their properties are ids, counts, dates, destinations, roles and plans: never
chat text, emails, names or passwords. Pendo matches events by name, so renaming one starts a new
event in Pendo. Nothing is sent until `PENDO_TRACK_EVENT_SECRET` is set.

## Structure

- `src/index.ts` starts the server
- `src/app.ts` builds the Express app (CORS, JSON, routes, sign-in check)
- `src/auth/require-auth.ts` the bearer-token check every protected route runs
- `src/routes/` the auth, trips, users, accounts and assistant routes
- `src/store/` in-memory stores for trips, users, accounts and sessions
- `src/assistant/reply.ts` the assistant's replies, from the language model
- `src/pendo/track.ts` the Pendo Track Events the API sends

## Run

```bash
npm install
npm run dev     # http://localhost:3001
npm run build && npm start
```

## Configuration

| Var | Purpose | Default |
| --- | --- | --- |
| `PORT` | Port the API listens on | `3001` |
| `CORS_ORIGIN` | Origin of the Tripwise web app | `http://localhost:5173` |
| `ANTHROPIC_API_KEY` | Key for the Anthropic API, used by the assistant | none |
| `PENDO_TRACK_EVENT_SECRET` | Pendo's Track Event shared secret; no Track Events are sent without it | none |
| `PENDO_DATA_HOST` | Host of Pendo's data API, which the Track Events are sent to | `data.pendo-dev.pendo-dev.com` |
