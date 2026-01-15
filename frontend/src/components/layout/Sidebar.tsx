"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: "&#9673;",
  },
  {
    name: "Collab_Review",
    href: "/review",
    icon: "&#9672;",
    description: "Real-time sync"
  },
  {
    name: "Compliance",
    href: "/compliance",
    icon: "&#9635;",
    description: "Regulatory analysis"
  },
  {
    name: "PID_Analysis",
    href: "/pid-analysis",
    icon: "&#9671;",
    description: "P&ID processing"
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-border bg-background-light/50 flex flex-col">
      {/* System Info */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-6 bg-primary" />
          <div>
            <h2 className="text-sm font-bold text-primary uppercase tracking-tight">
              ROOT@INTERFACE
            </h2>
            <p className="text-2xs text-text-muted font-mono">v1.0.0-STABLE</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-sm transition-all text-sm",
                isActive
                  ? "bg-primary text-background font-bold"
                  : "text-text-secondary hover:text-primary hover:bg-primary/10"
              )}
            >
              <span className="text-lg" dangerouslySetInnerHTML={{ __html: item.icon }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.name}</div>
                {item.description && (
                  <div className={cn(
                    "text-2xs truncate",
                    isActive ? "text-background/70" : "text-text-muted"
                  )}>
                    {item.description}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* System Status Panel */}
      <div className="p-3 border-t border-border">
        <div className="ascii-border p-3 bg-background">
          <h3 className="text-2xs font-bold text-primary uppercase tracking-[0.15em] mb-3">
            System_Status
          </h3>
          <div className="space-y-3">
            <Progress value={42} max={100} label="CPU_USAGE" showValue />
            <Progress value={68} max={100} label="MEM_USED" showValue />
          </div>
        </div>
      </div>
    </aside>
  );
}
