"use client";

import { useOrganizationStore, useHasHydrated } from "@/stores/organizationStore";

export function useOrganization() {
  const userId = useOrganizationStore((state) => state.userId);
  const orgId = useOrganizationStore((state) => state.orgId);
  const isAuthenticated = useOrganizationStore((state) => state.isAuthenticated);
  const isConnected = useOrganizationStore((state) => state.isConnected);
  const setCredentials = useOrganizationStore((state) => state.setCredentials);
  const clearCredentials = useOrganizationStore((state) => state.clearCredentials);
  const setConnected = useOrganizationStore((state) => state.setConnected);
  const hasHydrated = useHasHydrated();

  return {
    userId,
    orgId,
    isAuthenticated,
    isConnected,
    hasHydrated,
    setCredentials,
    clearCredentials,
    setConnected,
  };
}
