const { createServer } = require("http");
const { Server: SocketIOServer } = require("socket.io");

const PORT = process.env.PORT || 3001;

// CORS origins - add your Vercel domain here
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://localhost:3000",
  process.env.FRONTEND_URL, // Set this to your Vercel URL
].filter(Boolean);

const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Store state per organization
const orgStates = new Map();

function getOrCreateOrgState(orgId) {
  if (!orgStates.has(orgId)) {
    orgStates.set(orgId, {
      revision: {
        status: "pending",
        rating: 5,
        content: "",
        comment: "",
        lastUpdatedBy: "",
        lastUpdatedAt: new Date().toISOString(),
      },
      history: [],
      connections: new Map(),
    });
  }
  return orgStates.get(orgId);
}

function getActiveUsers(connections) {
  const users = new Set();
  connections.forEach((conn) => users.add(conn.userId));
  return Array.from(users);
}

io.on("connection", (socket) => {
  const { userId, orgId } = socket.handshake.auth;

  if (!userId || !orgId) {
    console.log("[Socket] Connection rejected: Missing userId or orgId");
    socket.disconnect();
    return;
  }

  console.log(`[Socket] User ${userId} from org ${orgId} connected (${socket.id})`);

  // Join organization room for isolation
  socket.join(orgId);

  // Get or create org state
  const orgState = getOrCreateOrgState(orgId);

  // Track this connection by socketId
  orgState.connections.set(socket.id, {
    socketId: socket.id,
    userId,
    joinedAt: new Date().toISOString(),
  });

  const activeUsers = getActiveUsers(orgState.connections);

  // Send current state to newly connected user
  socket.emit("state:sync", {
    revision: orgState.revision,
    history: orgState.history,
    activeUsers,
  });

  // Notify others in the org about new user
  socket.to(orgId).emit("user:joined", {
    userId,
    activeUsers,
  });

  // Handle state updates (status, rating changes)
  socket.on("state:update", (data) => {
    const state = getOrCreateOrgState(orgId);

    // Record history
    const historyEntry = {
      userId,
      action: "update",
      timestamp: new Date().toISOString(),
      previousValue: { ...state.revision },
      newValue: data,
    };
    state.history.unshift(historyEntry);

    // Keep only last 50 history entries
    if (state.history.length > 50) {
      state.history = state.history.slice(0, 50);
    }

    // Update state
    state.revision = {
      ...state.revision,
      ...data,
      lastUpdatedBy: userId,
      lastUpdatedAt: new Date().toISOString(),
    };

    // Broadcast to all users in the organization
    io.to(orgId).emit("state:updated", {
      revision: state.revision,
      historyEntry,
      updatedBy: userId,
    });

    console.log(`[Socket] State updated by ${userId} in org ${orgId}:`, data);
  });

  // Handle content editing (collaborative text)
  socket.on("content:update", (data) => {
    const state = getOrCreateOrgState(orgId);

    state.revision.content = data.content;
    state.revision.lastUpdatedBy = userId;
    state.revision.lastUpdatedAt = new Date().toISOString();

    // Broadcast to others (not sender)
    socket.to(orgId).emit("content:updated", {
      content: data.content,
      cursorPosition: data.cursorPosition,
      updatedBy: userId,
    });
  });

  // Handle cursor position updates
  socket.on("cursor:update", (data) => {
    socket.to(orgId).emit("cursor:moved", {
      userId,
      position: data.position,
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`[Socket] User ${userId} from org ${orgId} disconnected (${socket.id})`);

    const state = getOrCreateOrgState(orgId);
    // Remove this specific connection
    state.connections.delete(socket.id);

    const remainingUsers = getActiveUsers(state.connections);

    // Only emit user:left if this user has no other active connections
    if (!remainingUsers.includes(userId)) {
      socket.to(orgId).emit("user:left", {
        userId,
        activeUsers: remainingUsers,
      });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`> WebSocket server running on port ${PORT}`);
  console.log(`> Allowed origins: ${ALLOWED_ORIGINS.join(", ") || "*"}`);
});
