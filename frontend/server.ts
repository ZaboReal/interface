import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface RevisionState {
  status: "pending" | "approved" | "rejected" | "in_review";
  rating: number;
  content: string;
  comment: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
}

interface RevisionHistory {
  userId: string;
  action: string;
  timestamp: string;
  previousValue?: unknown;
  newValue?: unknown;
}

interface Connection {
  socketId: string;
  userId: string;
  joinedAt: string;
}

interface OrgState {
  revision: RevisionState;
  history: RevisionHistory[];
  // Track by socketId to support multiple tabs/connections per user
  connections: Map<string, Connection>;
}

// Helper to get unique userIds from connections
function getActiveUsers(connections: Map<string, Connection>): string[] {
  const users = new Set<string>();
  connections.forEach((conn) => users.add(conn.userId));
  return Array.from(users);
}

// Store state per organization
const orgStates = new Map<string, OrgState>();

function getOrCreateOrgState(orgId: string): OrgState {
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
  return orgStates.get(orgId)!;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

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
    socket.on("state:update", (data: Partial<RevisionState>) => {
      const state = getOrCreateOrgState(orgId);

      // Record history
      const historyEntry: RevisionHistory = {
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
    socket.on("content:update", (data: { content: string; cursorPosition: number }) => {
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
    socket.on("cursor:update", (data: { position: number }) => {
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

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO server running`);
  });
});
