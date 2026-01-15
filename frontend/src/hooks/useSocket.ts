"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Socket } from "socket.io-client";
import { useOrganization } from "./useOrganization";
import { getSocketManager } from "@/lib/socketManager";

export function useSocket() {
  const { userId, orgId, isAuthenticated, setConnected } = useOrganization();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnectedState, setIsConnectedState] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const credentialsRef = useRef({ userId, orgId });

  // Keep credentials ref updated
  useEffect(() => {
    credentialsRef.current = { userId, orgId };
  }, [userId, orgId]);

  useEffect(() => {
    if (!isAuthenticated || !userId || !orgId) {
      setSocket(null);
      socketRef.current = null;
      setIsConnectedState(false);
      return;
    }

    const newSocket = getSocketManager().connect(
      userId,
      orgId,
      () => {
        setIsConnectedState(true);
        setConnected(true);
      },
      () => {
        setIsConnectedState(false);
        setConnected(false);
      },
      () => {
        setIsConnectedState(false);
        setConnected(false);
      }
    );

    setSocket(newSocket);
    socketRef.current = newSocket;

    // Check if already connected
    if (newSocket.connected) {
      setIsConnectedState(true);
      setConnected(true);
    }

    // Don't disconnect on cleanup - the socket is managed by the singleton
    // Only disconnect if credentials change (handled by the manager's connect logic)
  }, [isAuthenticated, userId, orgId, setConnected]);

  // Use refs in emit to always have current values
  const emit = useCallback(<T>(event: string, data?: T) => {
    const currentSocket = socketRef.current;
    if (currentSocket?.connected) {
      console.log("[Socket] Emitting", event, data);
      currentSocket.emit(event, data);
    } else {
      console.warn("[Socket] Cannot emit - not connected", event);
    }
  }, []);

  return {
    socket,
    isConnected: isConnectedState,
    emit,
  };
}
