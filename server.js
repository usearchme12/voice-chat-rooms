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

io.on('connection', (socket) => {
  if (onlineUsers >= MAX_USERS) {
    socket.emit('error-msg', 'Room is full. Scanning for a new frequency...');
    socket.disconnect();
    return;
  }

  onlineUsers++;
  console.log('a user connected:', socket.id, 'Total:', onlineUsers);
  io.emit('user-count', onlineUsers);

  // Register callsings (nicknames)
  socket.on('register-callsign', (callsign) => {
    users.set(socket.id, callsign || 'GUEST-' + socket.id.substring(0, 4));
  });

  // When a user sends an audio chunk
  socket.on('audio-chunk', (data) => {
    socket.broadcast.emit('audio-stream', {
      userId: users.get(socket.id) || 'ANONYMOUS',
      blob: data.blob,
      mimeType: data.mimeType,
      msgId: data.msgId
    });
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
