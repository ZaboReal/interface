"use client";

import { useOrganization } from "@/hooks/useOrganization";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const { userId, orgId, isConnected } = useOrganization();

  return (
    <header className="h-10 border-b border-border bg-background/80 backdrop-blur-md px-4 flex items-center justify-between z-40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-primary text-lg">&#9656;</span>
          <h1 className="text-primary text-sm font-bold tracking-tighter uppercase">
            INTERFACE_SYS_v1.0
          </h1>
        </div>

        <div className="h-4 w-px bg-border mx-2" />

        <div className="flex gap-4 text-2xs font-medium tracking-[0.1em] uppercase text-text-muted">
          {isConnected ? (
            <Badge variant="success" pulse>SYSTEM: ONLINE</Badge>
          ) : (
            <Badge variant="error" pulse>SYSTEM: OFFLINE</Badge>
          )}
          {orgId && <span>ORG: {orgId}</span>}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex gap-6 text-2xs text-text-muted uppercase tracking-wider">
          <div className="flex flex-col items-end">
            <span className="opacity-50">User</span>
            <span className="text-primary font-bold">{userId || "ANONYMOUS"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
