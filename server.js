const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Enable CORS for Socket.io
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Middleware
app.use(cors());
app.use(express.json());

// Store active typing users
const typingUsers = new Map();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "Socket.io server is running" });
});

// Socket.io event handlers
io.on("connection", (socket) => {
  console.log(`✓ User connected: ${socket.id}`);

  // Patient form events
  socket.on("new-patient", (patient) => {
    console.log(`📝 Patient submitted:`, patient.id);

    // Broadcast to all staff users
    io.emit("patient-added", {
      ...patient,
      timestamp: new Date(patient.timestamp),
    });
  });

  // Typing indicator - patient started typing
  socket.on("patient-typing", (data) => {
    const { patientId } = data;
    typingUsers.set(patientId, {
      socketId: socket.id,
      timestamp: Date.now(),
    });

    console.log(`⌨️  Patient typing: ${patientId}`);

    // Broadcast typing event to all staff
    io.emit("patient-typing", { patientId });
  });

  // Typing indicator - patient stopped typing
  socket.on("patient-stopped-typing", (data) => {
    const { patientId } = data;
    typingUsers.delete(patientId);

    console.log(`✋ Patient stopped typing: ${patientId}`);

    // Broadcast stopped typing event to all staff
    io.emit("patient-stopped-typing", { patientId });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`✗ User disconnected: ${socket.id}`);

    // Clean up typing users for this socket
    for (const [patientId, user] of typingUsers.entries()) {
      if (user.socketId === socket.id) {
        typingUsers.delete(patientId);
        io.emit("patient-stopped-typing", { patientId });
      }
    }
  });

  // Error handling
  socket.on("error", (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });
});

// Periodic cleanup of stale typing indicators (older than 5 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [patientId, user] of typingUsers.entries()) {
    if (now - user.timestamp > 5000) {
      typingUsers.delete(patientId);
      io.emit("patient-stopped-typing", { patientId });
    }
  }
}, 2000);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 Socket.io server running on http://localhost:${PORT}`);
  console.log(`📊 Listening for real-time patient events...\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
