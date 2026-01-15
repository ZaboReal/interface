import { create } from "zustand";

export interface RevisionState {
  status: "pending" | "approved" | "rejected" | "in_review";
  rating: number;
  content: string;
  comment: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
}

export interface RevisionHistory {
  userId: string;
  action: string;
  timestamp: string;
  previousValue?: unknown;
  newValue?: unknown;
}

interface CursorPosition {
  userId: string;
  position: number;
  color: string;
}

interface RevisionStore {
  // State
  revision: RevisionState;
  history: RevisionHistory[];
  activeUsers: string[];
  cursors: Map<string, CursorPosition>;
  isConnected: boolean;

  // Actions
  setRevision: (revision: RevisionState) => void;
  updateRevision: (partial: Partial<RevisionState>) => void;
  setHistory: (history: RevisionHistory[]) => void;
  addHistoryEntry: (entry: RevisionHistory) => void;
  setActiveUsers: (users: string[]) => void;
  addUser: (userId: string) => void;
  removeUser: (userId: string) => void;
  setCursor: (userId: string, position: number) => void;
  removeCursor: (userId: string) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

const initialState: RevisionState = {
  status: "pending",
  rating: 5,
  content: "",
  comment: "",
  lastUpdatedBy: "",
  lastUpdatedAt: new Date().toISOString(),
};

const userColors = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

let colorIndex = 0;
function getNextColor(): string {
  const color = userColors[colorIndex % userColors.length];
  colorIndex++;
  return color;
}

export const useRevisionStore = create<RevisionStore>((set) => ({
  revision: initialState,
  history: [],
  activeUsers: [],
  cursors: new Map(),
  isConnected: false,

  setRevision: (revision) => set({ revision }),

  updateRevision: (partial) =>
    set((state) => ({
      revision: { ...state.revision, ...partial },
    })),

  setHistory: (history) => set({ history }),

  addHistoryEntry: (entry) =>
    set((state) => {
      // Prevent duplicate entries (same timestamp and userId)
      const isDuplicate = state.history.some(
        (h) => h.timestamp === entry.timestamp && h.userId === entry.userId
      );
      if (isDuplicate) return state;
      return {
        history: [entry, ...state.history].slice(0, 50),
      };
    }),

  setActiveUsers: (users) => set({ activeUsers: users }),

  addUser: (userId) =>
    set((state) => ({
      activeUsers: state.activeUsers.includes(userId)
        ? state.activeUsers
        : [...state.activeUsers, userId],
    })),

  removeUser: (userId) =>
    set((state) => ({
      activeUsers: state.activeUsers.filter((u) => u !== userId),
      cursors: (() => {
        const newCursors = new Map(state.cursors);
        newCursors.delete(userId);
        return newCursors;
      })(),
    })),

  setCursor: (userId, position) =>
    set((state) => {
      const newCursors = new Map(state.cursors);
      const existing = newCursors.get(userId);
      newCursors.set(userId, {
        userId,
        position,
        color: existing?.color || getNextColor(),
      });
      return { cursors: newCursors };
    }),

  removeCursor: (userId) =>
    set((state) => {
      const newCursors = new Map(state.cursors);
      newCursors.delete(userId);
      return { cursors: newCursors };
    }),

  setConnected: (isConnected) => set({ isConnected }),

  reset: () =>
    set({
      revision: initialState,
      history: [],
      activeUsers: [],
      cursors: new Map(),
      isConnected: false,
    }),
}));
