// Integration test: auth, rooms, CRDT convergence, persistence.
process.env.PORT = "4100";
process.env.DB_FILE = ":memory:";
const assert = (await import("node:assert/strict")).default;
const { io: connect } = await import("socket.io-client");
const Y = await import("yjs");
await import("./index.js");

const base = "http://localhost:4100";
const post = (path, body, token) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- auth ---
const a = await post("/api/register", { username: "alice", password: "secret1" });
const b = await post("/api/register", { username: "bob", password: "secret2" });
assert.equal(a.status, 200);
assert.equal((await post("/api/register", { username: "alice", password: "x12345" })).status, 409);
assert.equal((await post("/api/login", { username: "alice", password: "wrong" })).status, 401);
assert.equal((await post("/api/rooms", { name: "x" })).status, 401);

// --- room ---
const room = await post("/api/rooms", { name: "demo" }, a.body.token);
assert.equal(room.status, 200);

// --- unauthenticated socket is rejected ---
const bad = connect(base, { auth: { token: "nope" } });
await new Promise((res) => bad.on("connect_error", (e) => { assert.equal(e.message, "unauthorized"); res(); }));
bad.close();

// --- two clients edit concurrently ---
async function client(token) {
  const doc = new Y.Doc();
  const s = connect(base, { auth: { token } });
  await new Promise((r) => s.on("connect", r));
  const { state } = await new Promise((r) => s.emit("join", room.body.id, r));
  Y.applyUpdate(doc, new Uint8Array(state));
  doc.on("update", (u, origin) => origin !== "remote" && s.emit("update", u));
  s.on("update", (u) => Y.applyUpdate(doc, new Uint8Array(u), "remote"));
  return { doc, s };
}
const c1 = await client(a.body.token);
const c2 = await client(b.body.token);

// concurrent edits at the same position, made before either sees the other's
c1.doc.getText("code").insert(0, "AAA");
c2.doc.getText("code").insert(0, "BBB");
await wait(300);
const t1 = c1.doc.getText("code").toString();
const t2 = c2.doc.getText("code").toString();
assert.equal(t1, t2, "documents must converge");
assert.equal(t1.length, 6, "no edit may be lost");
console.log("converged to:", t1);

// --- persistence: everyone leaves, new client still gets the text ---
await wait(100);
c1.s.close(); c2.s.close();
await wait(300);
const c3 = await client(a.body.token);
assert.equal(c3.doc.getText("code").toString(), t1);
console.log("persisted + restored OK");
c3.s.close();
console.log("ALL TESTS PASSED");
process.exit(0);
