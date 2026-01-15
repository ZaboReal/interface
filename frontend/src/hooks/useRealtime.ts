"use client";

import { useEffect, useCallback, useRef } from "react";
import { useSocket } from "./useSocket";
import { useRevisionStore, RevisionState, RevisionHistory } from "@/stores/revisionStore";
import { useToast } from "@/stores/toastStore";
import { useOrganization } from "./useOrganization";

export function useRealtime() {
  const { socket, isConnected, emit } = useSocket();
  const { userId } = useOrganization();
  const { toast } = useToast();

  // Use refs for ALL values needed in listeners to avoid effect re-runs
  const userIdRef = useRef(userId);
  const toastRef = useRef(toast);
  const storeRef = useRef({
    setRevision: useRevisionStore.getState().setRevision,
    setHistory: useRevisionStore.getState().setHistory,
    setActiveUsers: useRevisionStore.getState().setActiveUsers,
    addHistoryEntry: useRevisionStore.getState().addHistoryEntry,
    updateRevision: useRevisionStore.getState().updateRevision,
    setCursor: useRevisionStore.getState().setCursor,
    removeCursor: useRevisionStore.getState().removeCursor,
    setConnected: useRevisionStore.getState().setConnected,
  });

  // Get state values for return
  const revision = useRevisionStore((state) => state.revision);
  const history = useRevisionStore((state) => state.history);
  const activeUsers = useRevisionStore((state) => state.activeUsers);
  const cursors = useRevisionStore((state) => state.cursors);

  // Keep refs updated
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // Sync connection state
  useEffect(() => {
    storeRef.current.setConnected(isConnected);
  }, [isConnected]);

  // Set up event listeners - ONLY depend on socket
  useEffect(() => {
    if (!socket) return;

    console.log("[Realtime] Setting up listeners on socket", socket.id);

    const handleStateSync = (data: {
      revision: RevisionState;
      history: RevisionHistory[];
      activeUsers: string[];
    }) => {
      console.log("[Realtime] state:sync received");
      storeRef.current.setRevision(data.revision);
      storeRef.current.setHistory(data.history);
      storeRef.current.setActiveUsers(data.activeUsers);
    };

    const handleStateUpdated = (data: {
      revision: RevisionState;
      historyEntry: RevisionHistory;
      updatedBy: string;
    }) => {
      console.log("[Realtime] state:updated received from", data.updatedBy);
      storeRef.current.setRevision(data.revision);
      storeRef.current.addHistoryEntry(data.historyEntry);

      if (data.updatedBy !== userIdRef.current) {
        toastRef.current({
          title: "Document Updated",
          description: `${data.updatedBy} made changes`,
          variant: "info",
        });
      }
    };

    const handleContentUpdated = (data: {
      content: string;
      cursorPosition: number;
      updatedBy: string;
    }) => {
      if (data.updatedBy !== userIdRef.current) {
        storeRef.current.updateRevision({ content: data.content });
      }
    };

    const handleCursorMoved = (data: { userId: string; position: number }) => {
      if (data.userId !== userIdRef.current) {
        storeRef.current.setCursor(data.userId, data.position);
      }
    };

    const handleUserJoined = (data: { userId: string; activeUsers: string[] }) => {
      console.log("[Realtime] user:joined received:", data.userId);
      storeRef.current.setActiveUsers(data.activeUsers);
      if (data.userId !== userIdRef.current) {
        toastRef.current({
          title: "User Joined",
          description: `${data.userId} is now viewing`,
          variant: "success",
        });
      }
    };

    const handleUserLeft = (data: { userId: string; activeUsers: string[] }) => {
      console.log("[Realtime] user:left received:", data.userId);
      storeRef.current.setActiveUsers(data.activeUsers);
      storeRef.current.removeCursor(data.userId);
    };

    // Register listeners
    socket.on("state:sync", handleStateSync);
    socket.on("state:updated", handleStateUpdated);
    socket.on("content:updated", handleContentUpdated);
    socket.on("cursor:moved", handleCursorMoved);
    socket.on("user:joined", handleUserJoined);
    socket.on("user:left", handleUserLeft);

    return () => {
      console.log("[Realtime] Removing listeners from socket", socket.id);
      socket.off("state:sync", handleStateSync);
      socket.off("state:updated", handleStateUpdated);
      socket.off("content:updated", handleContentUpdated);
      socket.off("cursor:moved", handleCursorMoved);
      socket.off("user:joined", handleUserJoined);
      socket.off("user:left", handleUserLeft);
    };
  }, [socket]); // Only depend on socket!

  // Actions
  const handleUpdateState = useCallback(
    (partial: Partial<RevisionState>) => {
      emit("state:update", partial);
      storeRef.current.updateRevision(partial);
    },
    [emit]
  );

  const handleUpdateContent = useCallback(
    (content: string, cursorPosition: number) => {
      emit("content:update", { content, cursorPosition });
      storeRef.current.updateRevision({ content });
    },
    [emit]
  );

  const handleUpdateCursor = useCallback(
    (position: number) => {
      emit("cursor:update", { position });
    },
    [emit]
  );

  return {
    isConnected,
    revision,
    history,
    activeUsers,
    cursors,
    updateState: handleUpdateState,
    updateContent: handleUpdateContent,
    updateCursor: handleUpdateCursor,
  };
}
