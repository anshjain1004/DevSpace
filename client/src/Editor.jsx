import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { yCollab } from "y-codemirror.next";

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

export default function Editor({ roomId, roomName, user, token, onLeave }) {
  const host = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [peers, setPeers] = useState(1);

  useEffect(() => {
    const doc = new Y.Doc();
    const ytext = doc.getText("code");
    const awareness = new Awareness(doc);
    const color = COLORS[user.id % COLORS.length];
    awareness.setLocalStateField("user", { name: user.username, color, colorLight: color + "33" });

    const socket = io({ auth: { token } });

    const join = () =>
      socket.emit("join", roomId, (res) => {
        if (res?.error) return setStatus("error: " + res.error);
        Y.applyUpdate(doc, new Uint8Array(res.state), "remote");
        // Push anything typed while offline; CRDT merge makes this safe.
        socket.emit("update", Y.encodeStateAsUpdate(doc));
        socket.emit("awareness", encodeAwarenessUpdate(awareness, [doc.clientID]));
        setStatus("live");
      });

    socket.on("connect", join);
    socket.on("disconnect", () => setStatus("offline - edits will sync on reconnect"));
    socket.on("connect_error", () => setStatus("auth failed"));

    // Local edit -> server. Remote edit -> local doc (tagged so we don't echo it back).
    doc.on("update", (update, origin) => {
      if (origin !== "remote") socket.emit("update", update);
    });
    socket.on("update", (u) => Y.applyUpdate(doc, new Uint8Array(u), "remote"));

    awareness.on("update", ({ added, updated, removed }, origin) => {
      setPeers(awareness.getStates().size);
      if (origin === "remote") return;
      socket.emit("awareness", encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]));
    });
    socket.on("awareness", (u) => applyAwarenessUpdate(awareness, new Uint8Array(u), "remote"));

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [basicSetup, javascript(), yCollab(ytext, awareness)],
      }),
    });

    return () => {
      removeAwarenessStates(awareness, [doc.clientID], "local");
      view.destroy();
      socket.close();
      doc.destroy();
    };
  }, [roomId, token, user]);

  return (
    <div className="editor-page">
      <header className="bar">
        <button onClick={onLeave}>&larr; Rooms</button>
        <strong>{roomName}</strong>
        <span className="code" title="Share this code">code: {roomId}</span>
        <span className={"status " + (status === "live" ? "ok" : "warn")}>{status}</span>
        <span>{peers} online</span>
      </header>
      <div ref={host} className="cm-host" />
    </div>
  );
}
