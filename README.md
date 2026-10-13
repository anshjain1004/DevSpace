# DevSpace — Real-Time Collaborative Code Editor

A Google-Docs-style editor for code. Multiple people open the same room and edit the
same file at once; every keystroke syncs live and concurrent edits **merge instead of
overwriting each other**, powered by a CRDT (Conflict-free Replicated Data Type).

Built as a full-stack project: Node.js + Socket.io backend, a React + CodeMirror 6
frontend, JWT auth, and SQLite persistence — all in one deployable service.

```
 Client A ─┐                                  ┌─ Client B
 (CodeMirror + Y.Doc)                        (CodeMirror + Y.Doc)
           │  Yjs update (binary delta)               │
           ▼                                          ▼
      ┌──────────────────── Socket.io (WSS) ────────────────────┐
      │  JWT verified on every handshake                        │
      │  server Y.Doc per room  →  merge  →  relay to peers     │
      │  awareness (cursors/presence) relayed, never stored     │
      │  debounced save → SQLite                                │
      └─────────────────────────────────────────────────────────┘
```

## Features

- **Conflict-free real-time sync** — Yjs CRDTs merge concurrent edits; no last-writer-wins data loss.
- **Live presence** — see who else is in the room, with per-user colored cursors and selections.
- **Rooms** — create a room (8-char code) or join one by code; document state is reloaded from the DB.
- **Auth everywhere** — register/login with bcrypt-hashed passwords; JWTs are verified on REST routes *and* the WebSocket handshake.
- **Offline-tolerant** — keep editing while disconnected; the client pushes its state and CRDT-merge reconciles it on reconnect.
- **Efficient** — edits travel as small binary Yjs updates; the server keeps one in-memory `Y.Doc` per active room and frees it when the room empties.
- **Single-service deploy** — the Node server serves the built React app, so frontend + API + WebSockets live on one origin.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite, CodeMirror 6 (`y-codemirror.next`) |
| Real-time sync | Yjs (CRDT), `y-protocols` awareness |
| Transport | Socket.io (WebSocket with polling fallback) |
| Backend | Node.js, Express |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Storage | SQLite via built-in `node:sqlite` |
| Tests | Node's built-in `assert`, `socket.io-client` integration test |

## Quickstart (Node 22.13+)

```bash
# 1. install everything (server + client)
npm install
npm run setup

# 2. run both in dev (hot reload), server on :4000, client on :5173
npm run dev
```

Open <http://localhost:5173> in two browser windows, register two users, create a room
in one, and join with the code in the other. Type in both — the text merges.

Prefer separate terminals?

```bash
npm start --prefix server     # http://localhost:4000
npm run dev --prefix client   # http://localhost:5173
```

Copy `server/.env.example` to `server/.env` and set a real `JWT_SECRET` outside local dev.

## Tests

```bash
npm test
```

An end-to-end integration test that boots the real server and asserts:
registration/login, protected routes, rejected unauthenticated sockets,
**two clients editing concurrently converge with no lost text**, and
**persistence after every client leaves**.

```
converged to: BBBAAA
persisted + restored OK
ALL TESTS PASSED
```

## Production

```bash
npm run build   # build the React client into client/dist
npm start       # server serves the built app + API + WebSockets on one port
```

The server exposes `GET /api/health` for liveness checks.

### One-command deploy (Render)

`render.yaml` is a ready blueprint. Push the repo, then in Render choose
**New → Blueprint** and point it at the repo. It installs, builds, and starts with a
generated `JWT_SECRET`.

> Free-tier note: Render free web services sleep after ~15 min idle and have an
> ephemeral filesystem, so the SQLite file resets on redeploy/sleep. Attach a paid
> disk or swap to a managed Postgres for durable persistence.

### Docker

```bash
docker build -t devspace .
docker run -p 4000:4000 -e JWT_SECRET=change-me devspace
# open http://localhost:4000
```

## Project structure

```
devspace/
├── client/               # React + Vite + CodeMirror frontend
│   └── src/
│       ├── App.jsx       # auth + room list + routing between screens
│       ├── Editor.jsx    # Y.Doc <-> CodeMirror <-> Socket.io wiring
│       └── api.js        # fetch wrapper that attaches the JWT
├── server/
│   ├── index.js          # Express REST + Socket.io + Yjs + SQLite
│   ├── test.js           # end-to-end integration test
│   └── .env.example
├── Dockerfile
├── render.yaml           # Render deploy blueprint
└── package.json          # root scripts: dev / build / start / test
```

## How it works

1. The user registers/logs in and receives a JWT.
2. They create a room (8-char code) or join one by code.
3. Each keystroke becomes a small Yjs update, sent over Socket.io, merged into the
   server's `Y.Doc` for that room, and relayed to the other clients.
4. Cursors/presence travel as separate "awareness" messages and are never stored.
5. The server debounce-saves the document to SQLite and frees memory when a room empties.
6. A client that goes offline keeps editing and pushes its state on reconnect; the CRDT
   merge makes that safe.

## What this project demonstrates

- Designing a **stateful real-time system** with WebSockets, not just request/response CRUD.
- Applying **CRDTs (Yjs)** to get correct concurrent editing with zero coordination.
- **Security fundamentals**: hashed passwords, JWT verification on both HTTP and socket handshakes.
- **Persistence lifecycle**: debounced writes, restore-on-load, memory cleanup.
- **Shipping**: monorepo scripts, env config, integration tests, Docker and a deploy blueprint.

## Known limitations / roadmap

- Any logged-in user with the room code can join (no per-room roles/permissions yet).
- JavaScript syntax highlighting only.
- Single server instance — a multi-node deploy would need a Redis adapter and a shared DB.
- Not load-tested.

## License

MIT © Ansh Jain
