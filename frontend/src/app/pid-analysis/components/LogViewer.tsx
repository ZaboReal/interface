"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/cv`;

interface Props {
  jobId: string | null;
  isRunning: boolean;
}

export function LogViewer({ jobId, isRunning }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastLogCount = useRef(0);

  useEffect(() => {
    if (!jobId || !isRunning) return;

    const fetchLogs = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/logs/${jobId}?since=${lastLogCount.current}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.logs && data.logs.length > 0) {
            setLogs((prev) => [...prev, ...data.logs]);
            lastLogCount.current = data.total;
          }
        }
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };

    // Poll for logs every 500ms while running
    const interval = setInterval(fetchLogs, 500);
    fetchLogs(); // Initial fetch

    return () => clearInterval(interval);
  }, [jobId, isRunning]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current && expanded) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  // Reset logs when job changes
  useEffect(() => {
    setLogs([]);
    lastLogCount.current = 0;
  }, [jobId]);

  if (!jobId) return null;

  const getLogStyle = (log: string) => {
    if (log.includes("FAILED") || log.includes("Error")) {
      return "text-status-error";
    }
    if (log.includes("COMPLETE") || log.includes("Compliance status: PASS")) {
      return "text-status-success";
    }
    if (log.includes("===") || log.includes("---")) {
      return "text-primary font-bold";
    }
    if (log.startsWith("  Step") || log.startsWith("Step")) {
      return "text-text-secondary font-medium";
    }
    if (log.startsWith("    ->") || log.startsWith("  ->")) {
      return "text-status-success";
    }
    if (log.startsWith("Processing Page")) {
      return "text-primary";
    }
    return "text-text-muted";
  };

  return (
    <Card className="mt-4">
      <CardHeader
        className="py-2 cursor-pointer hover:bg-primary/5"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-primary">$</span>
            <span>PID_ANALYSIS_LOG</span>
            {isRunning && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="text-status-success"
              >
                ●
              </motion.span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-2xs">
              {logs.length} lines
            </span>
            <span>{expanded ? "▲" : "▼"}</span>
          </div>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className={cn(
              "bg-background font-mono text-2xs p-3 overflow-y-auto",
              "border-t border-border",
              isRunning ? "max-h-48" : "max-h-64"
            )}
          >
            {logs.length === 0 ? (
              <span className="text-text-muted">Waiting for logs...</span>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "py-0.5 leading-tight",
                    getLogStyle(log)
                  )}
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
