import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as Y from "yjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const DB_FILE = process.env.DB_FILE || "devspace.db";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
// In production the server also serves the built React app (single service).
const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, "..", "client", "dist");

// ---------- Database ----------
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    doc BLOB,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------- Auth helpers ----------
const sign = (user) =>
  jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or missing token" });
  }
}

// ---------- REST API ----------
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Liveness probe (used by the host's health checks).
app.get("/api/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6)
    return res.status(400).json({ error: "Username and password (min 6 chars) required" });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, hash);
    const user = { id: Number(info.lastInsertRowid), username };
    res.json({ token: sign(user), user });
  } catch {
    res.status(409).json({ error: "Username already taken" });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username || "");
  if (!row || !bcrypt.compareSync(password || "", row.password_hash))
    return res.status(401).json({ error: "Wrong username or password" });
  const user = { id: row.id, username: row.username };
  res.json({ token: sign(user), user });
});

app.post("/api/rooms", requireAuth, (req, res) => {
  const name = (req.body?.name || "").trim() || "Untitled room";
  const id = crypto.randomBytes(4).toString("hex");
  db.prepare("INSERT INTO rooms (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, req.user.id);
  res.json({ id, name });
});

app.get("/api/rooms/:id", requireAuth, (req, res) => {
  const room = db.prepare("SELECT id, name, owner_id FROM rooms WHERE id = ?").get(req.params.id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(room);
});

app.get("/api/rooms", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT id, name, updated_at FROM rooms WHERE owner_id = ? ORDER BY updated_at DESC")
    .all(req.user.id);
  res.json(rows);
});

// ---------- Static client (production single-service deploy) ----------
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback for any non-API route.
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
}

// ---------- Realtime: Socket.io + Yjs (CRDT) ----------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

// One in-memory Y.Doc per active room; persisted to SQLite (debounced).
const docs = new Map(); // roomId -> { doc, timer }

function getDoc(roomId) {
  if (docs.has(roomId)) return docs.get(roomId).doc;
  const doc = new Y.Doc();
  const row = db.prepare("SELECT doc FROM rooms WHERE id = ?").get(roomId);
  if (row?.doc) Y.applyUpdate(doc, new Uint8Array(row.doc));
  docs.set(roomId, { doc, timer: null });
  return doc;
}

function schedulePersist(roomId) {
  const entry = docs.get(roomId);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => persist(roomId), 1000);
}

function persist(roomId) {
  const entry = docs.get(roomId);
  if (!entry) return;
  const state = Y.encodeStateAsUpdate(entry.doc);
  db.prepare("UPDATE rooms SET doc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    state,
    roomId
  );
}

// Reject sockets without a valid JWT
io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth?.token || "", JWT_SECRET);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.on("join", (roomId, ack) => {
    const exists = db.prepare("SELECT id FROM rooms WHERE id = ?").get(roomId);
    if (!exists) return ack?.({ error: "Room not found" });
    socket.join(roomId);
    socket.data.roomId = roomId;
    const doc = getDoc(roomId);
    ack?.({ ok: true, state: Y.encodeStateAsUpdate(doc) });
  });

  // Client edits arrive as Yjs updates; merge into server doc, relay to others.
  socket.on("update", (update) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    Y.applyUpdate(getDoc(roomId), new Uint8Array(update), "client");
    socket.to(roomId).emit("update", update);
    schedulePersist(roomId);
  });

  // Cursor / presence info is relayed, never stored.
  socket.on("awareness", (payload) => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit("awareness", payload);
  });

  socket.on("disconnect", async () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const left = (await io.in(roomId).fetchSockets()).length;
    if (left === 0) {
      persist(roomId);
      clearTimeout(docs.get(roomId)?.timer);
      docs.delete(roomId); // free memory when room is empty
    }
  });
});

server.listen(PORT, () => console.log(`DevSpace server on :${PORT}`));
export { server, io, db };
