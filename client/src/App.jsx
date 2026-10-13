import { useEffect, useState } from "react";
import { api } from "./api.js";
import Editor from "./Editor.jsx";

const load = () => {
  try { return JSON.parse(localStorage.getItem("session")); } catch { return null; }
};

export default function App() {
  const [session, setSession] = useState(load); // { token, user }
  const [room, setRoom] = useState(null); // { id, name }

  const save = (s) => {
    try { s ? localStorage.setItem("session", JSON.stringify(s)) : localStorage.removeItem("session"); } catch {}
    setSession(s);
  };

  if (!session) return <Auth onAuth={save} />;
  if (room)
    return <Editor roomId={room.id} roomName={room.name} user={session.user} token={session.token} onLeave={() => setRoom(null)} />;
  return <Rooms session={session} onOpen={setRoom} onLogout={() => save(null)} />;
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      onAuth(await api(`/api/${mode}`, { method: "POST", body: { username, password } }));
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <h1>DevSpace</h1>
      <p className="muted">Real-time collaborative code editor</p>
      <form onSubmit={submit}>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Password (min 6)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button type="submit">{mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <button className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "New here? Register" : "Have an account? Log in"}
      </button>
    </div>
  );
}

function Rooms({ session, onOpen, onLogout }) {
  const { token, user } = session;
  const [rooms, setRooms] = useState([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const refresh = () => api("/api/rooms", { token }).then(setRooms).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    try { onOpen(await api("/api/rooms", { method: "POST", body: { name }, token })); }
    catch (e) { setError(e.message); }
  };
  const join = async () => {
    try { onOpen(await api(`/api/rooms/${code.trim()}`, { token })); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="card wide">
      <div className="row"><h2>Hi, {user.username}</h2><button className="link" onClick={onLogout}>Log out</button></div>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <input placeholder="New room name" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={create}>Create room</button>
      </div>
      <div className="row">
        <input placeholder="Join with room code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button onClick={join}>Join</button>
      </div>
      <h3>Your rooms</h3>
      {rooms.length === 0 && <p className="muted">No rooms yet.</p>}
      {rooms.map((r) => (
        <div key={r.id} className="room" onClick={() => onOpen(r)}>
          <span>{r.name}</span><span className="muted">{r.id}</span>
        </div>
      ))}
    </div>
  );
}
