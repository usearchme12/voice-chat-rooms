const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7, // 10MB limit for audio blobs
  cors: {
    origin: "*", // Allow connections from worldofchat.co.uk and other external domains
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

let onlineUsers = 0;
const MAX_USERS = 20;
const users = new Map(); // socket.id -> callsign
const activeSpeakers = new Set(); // tracks unique senders
const recentMessages = []; // stores up to 25 recent voice messages for new joiners
const MAX_HISTORY = 25;

io.on('connection', (socket) => {
  if (onlineUsers >= MAX_USERS) {
    socket.emit('error-msg', 'Room is full. Scanning for a new frequency...');
    socket.disconnect();
    return;
  }

  onlineUsers++;
  console.log('a user connected:', socket.id, 'Total:', onlineUsers);
  io.emit('user-count', onlineUsers);
  socket.emit('speakers-count', activeSpeakers.size);

  // Send message history to the newly connected user so room isn't blank
  if (recentMessages.length > 0) {
    socket.emit('message-history', recentMessages);
  }

  // Register callsings (nicknames)
  socket.on('register-callsign', (callsign) => {
    users.set(socket.id, callsign || 'GUEST-' + socket.id.substring(0, 4));
  });

  // When a user sends an audio chunk
  socket.on('audio-chunk', (data) => {
    const sender = users.get(socket.id) || 'ANONYMOUS';
    activeSpeakers.add(sender);
    io.emit('speakers-count', activeSpeakers.size);

    const msgObj = {
      userId: sender,
      blob: data.blob,
      mimeType: data.mimeType,
      msgId: data.msgId,
      timestamp: Date.now()
    };

    recentMessages.push(msgObj);
    if (recentMessages.length > MAX_HISTORY) {
      recentMessages.shift();
    }

    socket.broadcast.emit('audio-stream', msgObj);
  });

  // Handle live transmission indicators
  socket.on('transmitting-start', () => {
    socket.broadcast.emit('transmitting-start', {
      userId: users.get(socket.id) || 'ANONYMOUS'
    });
  });

  socket.on('transmitting-stop', () => {
    socket.broadcast.emit('transmitting-stop');
  });

  // Handle deleting a sent message from the room
  socket.on('delete-msg', (data) => {
    if (data && data.msgId) {
      const idx = recentMessages.findIndex(m => m.msgId === data.msgId);
      if (idx !== -1) {
        recentMessages.splice(idx, 1);
      }
      activeSpeakers.clear();
      recentMessages.forEach(m => activeSpeakers.add(m.userId));
      io.emit('speakers-count', activeSpeakers.size);
      io.emit('delete-msg', { msgId: data.msgId });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers--;
    console.log('user disconnected:', socket.id, 'Total:', onlineUsers);
    users.delete(socket.id);
    io.emit('user-count', onlineUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Voice Room server running on http://localhost:${PORT}`);
});
