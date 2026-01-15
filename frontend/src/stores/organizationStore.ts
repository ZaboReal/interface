import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import Cookies from "js-cookie";

interface OrganizationStore {
  userId: string | null;
  orgId: string | null;
  isAuthenticated: boolean;
  isConnected: boolean;
  _hasHydrated: boolean;
  setCredentials: (userId: string, orgId: string) => void;
  clearCredentials: () => void;
  setConnected: (connected: boolean) => void;
  setHasHydrated: (hydrated: boolean) => void;
}

// Helper to get URL params
function getUrlParams(): { userId?: string; orgId?: string } {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    userId: params.get("userId") || undefined,
    orgId: params.get("orgId") || undefined,
  };
}

// Tab Counting Logic
const TAB_COUNT_KEY = "app_tab_count";

const TabManager = {
  init: () => {
    if (typeof window === "undefined") return;

    // Increment on load
    const count = parseInt(localStorage.getItem(TAB_COUNT_KEY) || "0", 10);
    localStorage.setItem(TAB_COUNT_KEY, (count + 1).toString());

    // Decrement on unload
    window.addEventListener("beforeunload", () => {
      const current = parseInt(localStorage.getItem(TAB_COUNT_KEY) || "0", 10);
      localStorage.setItem(TAB_COUNT_KEY, Math.max(0, current - 1).toString());
    });
  },
  getCount: () => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem(TAB_COUNT_KEY) || "0", 10);
  }
};

// Initialize tab counter
TabManager.init();

export const useOrganizationStore = create<OrganizationStore>()(
  persist(
    (set) => ({
      userId: null,
      orgId: null,
      isAuthenticated: false,
      isConnected: false,
      _hasHydrated: false,

      setCredentials: (userId: string, orgId: string) => {
        // Set cookies for persistence across tabs/refreshes
        Cookies.set("userId", userId, { expires: 7 }); // 7 days
        Cookies.set("orgId", orgId, { expires: 7 });

        set({
          userId,
          orgId,
          isAuthenticated: true,
        });
      },

      clearCredentials: () => {
        // Clear cookies
        Cookies.remove("userId");
        Cookies.remove("orgId");

        // Clear sessionStorage for this tab
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("organization-storage");
        }
        set({
          userId: null,
          orgId: null,
          isAuthenticated: false,
          isConnected: false,
        });
      },

      setConnected: (isConnected: boolean) => {
        set({ isConnected });
      },

      setHasHydrated: (hydrated: boolean) => {
        set({ _hasHydrated: hydrated });
      },
    }),
    {
      name: "organization-storage",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        userId: state.userId,
        orgId: state.orgId,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("[OrgStore] Rehydration error:", error);
          return;
        }

        if (state) {
          // Check URL params and cookies first - they take priority
          const urlParams = getUrlParams();
          const cookieUserId = Cookies.get("userId");
          const cookieOrgId = Cookies.get("orgId");

          // Helper to validate credentials
          const isValid = (val: string | null | undefined) =>
            val && val !== "[object Object]" && val.trim().length > 0;

          const tabCount = TabManager.getCount();
          // Check if this is a refresh (visited before) or a fresh tab
          const hasVisited = sessionStorage.getItem("app_has_visited") === "true";
          console.log("[OrgStore] Tab count:", tabCount, "Has visited:", hasVisited);

          // 1. URL Params (Highest Priority - Explicit Override)
          if (urlParams.userId && urlParams.orgId && isValid(urlParams.userId) && isValid(urlParams.orgId)) {
            console.log("[OrgStore] Loading from URL params:", urlParams.userId);
            state.userId = urlParams.userId;
            state.orgId = urlParams.orgId;
            state.isAuthenticated = true;

            // Likely want to update cookies if explicit URL override
            Cookies.set("userId", urlParams.userId, { expires: 7 });
            Cookies.set("orgId", urlParams.orgId, { expires: 7 });
          }
          // 2. Existing Session State (Medium Priority - Keep current session logic)
          else if (isValid(state.userId) && isValid(state.orgId) && state.isAuthenticated) {
            // No new credentials from URL/cookies, but sessionStorage has valid credentials - keep them
            console.log("[OrgStore] Using stored credentials:", state.userId);
          }
          // 3. Cookies (Low Priority - Auto-login)
          else if (isValid(cookieUserId) && isValid(cookieOrgId)) {
            // Allow auto-login if:
            // A. It's the first tab (Principal tab)
            // B. OR we have visited this tab before (Meaning it's a refresh of an existing tab, so user likely manually set cookies)
            if (tabCount <= 1 || hasVisited) {
              console.log("[OrgStore] Valid auto-login condition. Loading from cookies:", cookieUserId);
              state.userId = cookieUserId!;
              state.orgId = cookieOrgId!;
              state.isAuthenticated = true;
            } else {
              console.log("[OrgStore] Fresh new tab (count > 1). Ignoring cookies to allow multi-user.");
              // Ensure state is clean
              state.userId = null;
              state.orgId = null;
              state.isAuthenticated = false;
            }
          } else {
            console.log("[OrgStore] No valid credentials found");
            // Validation failed or no credentials found - clear potentially corrupt state
            state.userId = null;
            state.orgId = null;
            state.isAuthenticated = false;
            // Also clear cookies if they were invalid
            Cookies.remove("userId");
            Cookies.remove("orgId");
          }

          // Mark as hydrated and visited
          state._hasHydrated = true;
          sessionStorage.setItem("app_has_visited", "true");
        }
      },
    }
  )
);

// Hook to wait for hydration
export const useHasHydrated = () => {
  return useOrganizationStore((state) => state._hasHydrated);
};
