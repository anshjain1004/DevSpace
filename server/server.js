const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const Room = require('./models/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use('/api/auth', require('./routes/auth'));

// DB Connection
mongoose.connect('mongodb://localhost:27017/devspace')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Connection Error:', err));

// Socket Logic
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, username }) => {
        socket.join(roomId);
        
        // Fetch persistent state from DB
        let room = await Room.findOne({ roomId });
        if (!room) {
            room = new Room({ roomId, name: `Room ${roomId}` });
            await room.save();
        }
        
        // Send current code state to the newly joined user
        socket.emit('sync-code', room.codeState);
        socket.to(roomId).emit('user-joined', { username, socketId: socket.id });
    });

    socket.on('code-change', ({ roomId, code }) => {
        // Broadcast code changes to others in the room
        socket.to(roomId).emit('code-change', code);
    });

    // Save to DB periodically or on explicit save to avoid bottlenecking
    socket.on('save-code', async ({ roomId, code }) => {
        await Room.findOneAndUpdate({ roomId }, { codeState: code });
    });

    socket.on('cursor-move', ({ roomId, cursorData }) => {
        socket.to(roomId).emit('cursor-move', { socketId: socket.id, cursorData });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));