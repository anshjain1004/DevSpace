# DevSpace — Real-Time Collaborative Workspace

DevSpace is a full-stack, real-time collaborative code editing workspace built with the **MERN Stack** and **Socket.io**. It enables multiple developers to edit code simultaneously in custom rooms with sub-100ms latency, persistent database storage, and a VS Code-style interface powered by the Monaco Editor.

---

## 🌟 Key Features

- **Real-Time Code Synchronization:** Bi-directional event broadcasting via Socket.io for instant editor state sync.
- **VS Code Editor Experience:** Integrated `@monaco-editor/react` for syntax highlighting, auto-completion, and line numbers.
- **Room-Based Collaboration:** Create or join isolated rooms using dynamic Room IDs.
- **Persistent Storage:** Saves room states, code snippets, and active sessions directly to MongoDB.
- **Authentication & Security:** JWT-based user authentication with `bcryptjs` password hashing and role-based access logic.
- **Responsive Dark UI:** Sleek, modern developer-centric workspace styled with a dark theme.

---

## 🛠️ Tech Stack

**Frontend:**
- ReactJS
- `@monaco-editor/react` (Monaco Editor)
- Socket.io Client
- CSS3 (Custom Dark Theme)

**Backend:**
- Node.js & Express.js
- Socket.io
- MongoDB & Mongoose ORM
- JSON Web Tokens (JWT) & BcryptJS

---

## 📁 Project Structure

```text
devspace/
├── client/                 # React Frontend
│   ├── public/
│   └── src/
│       ├── App.js          # Main Collaborative Workspace Component
│       ├── App.css         # Dark UI Stylesheet
│       └── index.js
│
└── server/                 # Node.js Express Backend
    ├── models/             # Mongoose Schemas (User, Room)
    ├── routes/             # Authentication & Room REST API Endpoints
    ├── middleware/         # JWT Auth Verification Middleware
    └── server.js           # Express App & Socket.io Server Entry Point
