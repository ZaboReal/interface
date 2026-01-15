"use client";

import { io, Socket } from "socket.io-client";

interface SocketConnection {
  socket: Socket;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
}

// Singleton socket manager - one socket per userId+orgId combination
class SocketManager {
  private connections: Map<string, SocketConnection> = new Map();

  private getKey(userId: string, orgId: string): string {
    return `${userId}:${orgId}`;
  }

  getSocket(userId: string, orgId: string): Socket | null {
    const key = this.getKey(userId, orgId);
    return this.connections.get(key)?.socket || null;
  }

  connect(
    userId: string,
    orgId: string,
    onConnect: () => void,
    onDisconnect: () => void,
    onError: (error: Error) => void
  ): Socket {
    const key = this.getKey(userId, orgId);
    const existing = this.connections.get(key);

    // If socket exists and is connected or connecting, update callbacks and return it
    if (existing?.socket) {
      const { socket } = existing;

      // Update callbacks
      existing.onConnect = onConnect;
      existing.onDisconnect = onDisconnect;
      existing.onError = onError;

      if (socket.connected) {
        console.log("[SocketManager] Reusing connected socket for", key);
        onConnect();
        return socket;
      }

      // Socket exists but not connected - might be connecting
      console.log("[SocketManager] Socket exists for", key, "- connected:", socket.connected);
      return socket;
    }

    console.log("[SocketManager] Creating new socket for", key);

    // Use environment variable for WebSocket URL, fallback to same origin for local dev
    const wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL || window.location.origin;
    console.log("[SocketManager] Connecting to WebSocket at:", wsUrl);

    const socket = io(wsUrl, {
      auth: { userId, orgId },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 60000,
    });

    const connection: SocketConnection = {
      socket,
      onConnect,
      onDisconnect,
      onError,
    };

    // Use wrapper functions that call the current callbacks
    socket.on("connect", () => {
      console.log("[SocketManager] Connected:", socket.id);
      connection.onConnect();
    });

    socket.on("disconnect", (reason) => {
      console.log("[SocketManager] Disconnected:", reason);
      connection.onDisconnect();
    });

    socket.on("connect_error", (error) => {
      console.error("[SocketManager] Connection error:", error.message);
      connection.onError(error);
    });

    this.connections.set(key, connection);
    return socket;
  }

  disconnect(userId: string, orgId: string): void {
    const key = this.getKey(userId, orgId);
    const connection = this.connections.get(key);
    if (connection) {
      console.log("[SocketManager] Disconnecting socket for", key);
      connection.socket.removeAllListeners();
      connection.socket.disconnect();
      this.connections.delete(key);
    }
  }
}

// Export singleton instance - only created on client
let socketManager: SocketManager | null = null;

export function getSocketManager(): SocketManager {
  if (!socketManager) {
    socketManager = new SocketManager();
  }
  return socketManager;
}
