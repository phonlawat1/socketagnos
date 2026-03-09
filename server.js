require("dotenv").config();

import express, { json } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = createServer(app);

/*
========================
CONFIG
========================
*/

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL;

/*
========================
MIDDLEWARE
========================
*/

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(json());

/*
========================
SOCKET.IO SETUP
========================
*/

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

/*
========================
STATE
========================
*/

const typingUsers = new Map();

/*
========================
ROUTES
========================
*/

app.get("/", (req, res) => {
  res.send("Socket.io server running 🚀");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    socketConnections: io.engine.clientsCount,
  });
});

/*
========================
SOCKET EVENTS
========================
*/

io.on("connection", (socket) => {
  console.log(`✅ Connected: ${socket.id}`);

  /*
  ========================
  NEW PATIENT
  ========================
  */

  socket.on("new-patient", (patient) => {
    console.log("📝 New patient:", patient);

    io.emit("patient-added", {
      ...patient,
      timestamp: new Date(),
    });
  });

  /*
  ========================
  PATIENT TYPING
  ========================
  */

  socket.on("patient-typing", ({ patientId }) => {
    typingUsers.set(patientId, {
      socketId: socket.id,
      timestamp: Date.now(),
    });

    io.emit("patient-typing", { patientId });
  });

  /*
  ========================
  STOP TYPING
  ========================
  */

  socket.on("patient-stopped-typing", ({ patientId }) => {
    typingUsers.delete(patientId);

    io.emit("patient-stopped-typing", { patientId });
  });

  /*
  ========================
  DISCONNECT
  ========================
  */

  socket.on("disconnect", () => {
    console.log(`❌ Disconnected: ${socket.id}`);

    for (const [patientId, user] of typingUsers.entries()) {
      if (user.socketId === socket.id) {
        typingUsers.delete(patientId);

        io.emit("patient-stopped-typing", { patientId });
      }
    }
  });

  /*
  ========================
  ERROR
  ========================
  */

  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });
});

/*
========================
CLEANUP STALE TYPING
========================
*/

setInterval(() => {
  const now = Date.now();

  for (const [patientId, user] of typingUsers.entries()) {
    if (now - user.timestamp > 5000) {
      typingUsers.delete(patientId);
      io.emit("patient-stopped-typing", { patientId });
    }
  }
}, 2000);

/*
========================
START SERVER
========================
*/

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Allowed client: ${CLIENT_URL}`);
});

/*
========================
GRACEFUL SHUTDOWN
========================
*/

const shutdown = () => {
  console.log("Shutting down server...");

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
