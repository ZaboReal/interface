"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/cv`;

interface ComparisonItem {
  tag: string;
  sop_description?: string;
  pid_description?: string;
  sop_pressure?: number | string | null;
  pid_pressure?: number | string | null;
  sop_temperature?: number | string | null;
  pid_temperature?: number | string | null;
  status?: string;
  pressure_issue?: string | null;
  temperature_issue?: string | null;
  notes?: string;
}

interface MissingItem {
  tag: string;
  sop_description?: string;
  pid_description?: string;
  sop_pressure?: string;
  sop_temperature?: string;
  issue?: string;
}

interface ComparisonSummary {
  total_components_compared?: number;
  matches?: number;
  pressure_discrepancies?: number;
  temperature_discrepancies?: number;
  missing_in_pid?: number;
  missing_in_sop?: number;
  match_rate?: number;
  compliance_status?: string;
}

interface DiscrepancyData {
  comparisons?: ComparisonItem[];
  matches?: ComparisonItem[];
  pressure_discrepancies?: ComparisonItem[];
  temperature_discrepancies?: ComparisonItem[];
  missing_in_pid?: MissingItem[];
  missing_in_sop?: MissingItem[];
  summary?: ComparisonSummary;
}

interface Props {
  jobId: string;
}

export function DiscrepancyReport({ jobId }: Props) {
  const [data, setData] = useState<DiscrepancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDiscrepancies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/discrepancies/${jobId}`);
      if (!res.ok) {
        throw new Error("Failed to load discrepancies");
      }
      const responseData = await res.json();
      console.log("Discrepancy data:", responseData);
      setData(responseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadDiscrepancies();
  }, [loadDiscrepancies]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-3">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="text-primary text-xl"
            >
              ⚙
            </motion.span>
            <span className="text-text-muted">Loading compliance report...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-status-error">
            <p>Error: {error}</p>
            <Button onClick={loadDiscrepancies} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-text-muted">No comparison data available</p>
        </CardContent>
      </Card>
    );
  }

  const matches = data.matches || [];
  const missingInPid = data.missing_in_pid || [];
  const totalSopItems = matches.length + missingInPid.length;
  const matchRate = totalSopItems > 0 ? (matches.length / totalSopItems) * 100 : 0;
  const isPassing = missingInPid.length === 0;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <Card className={cn(
        "border-2",
        isPassing ? "border-status-success bg-status-success/5" : "border-yellow-500 bg-yellow-500/5"
      )}>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={cn(
                "text-4xl",
                isPassing ? "text-status-success" : "text-yellow-500"
              )}>
                {isPassing ? "✓" : "⚠"}
              </span>
              <div>
                <h2 className={cn(
                  "text-2xl font-bold",
                  isPassing ? "text-status-success" : "text-yellow-500"
                )}>
                  {isPassing ? "ALL SOP ITEMS FOUND" : "SOME SOP ITEMS MISSING"}
                </h2>
                <p className="text-text-muted">
                  {isPassing
                    ? "All SOP equipment found in P&ID diagram"
                    : `${missingInPid.length} SOP item(s) not found in P&ID diagram`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-3xl font-bold",
                matchRate >= 80 ? "text-status-success" :
                matchRate >= 50 ? "text-yellow-500" : "text-status-error"
              )}>
                {matchRate.toFixed(0)}%
              </div>
              <div className="text-2xs text-text-muted uppercase">Match Rate</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {totalSopItems}
            </div>
            <div className="text-2xs text-text-muted uppercase">SOP Items</div>
          </CardContent>
        </Card>
        <Card className="border-status-success/50">
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-status-success">
              {matches.length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Found in P&ID</div>
          </CardContent>
        </Card>
        <Card className={missingInPid.length > 0 ? "border-status-error/50" : ""}>
          <CardContent className="py-4">
            <div className={cn(
              "text-2xl font-bold",
              missingInPid.length > 0 ? "text-status-error" : "text-text-muted"
            )}>
              {missingInPid.length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Missing from P&ID</div>
          </CardContent>
        </Card>
      </div>

      {/* Matches Section */}
      {matches.length > 0 && (
        <Card className="border-status-success/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="text-status-success text-xl">✓</span>
              <CardTitle>SOP_ITEMS_FOUND_IN_DIAGRAM</CardTitle>
              <Badge className="bg-status-success">{matches.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-text-muted">Equipment Tag</th>
                    <th className="text-left py-2 px-3 text-text-muted">Description</th>
                    <th className="text-center py-2 px-3 text-text-muted">SOP Pressure</th>
                    <th className="text-center py-2 px-3 text-text-muted">P&ID Pressure</th>
                    <th className="text-center py-2 px-3 text-text-muted">SOP Temp</th>
                    <th className="text-center py-2 px-3 text-text-muted">P&ID Temp</th>
                    <th className="text-center py-2 px-3 text-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match, idx) => {
                    const hasIssue = match.pressure_issue || match.temperature_issue;
                    return (
                      <tr key={idx} className="border-b border-border/50 hover:bg-background-dark/50">
                        <td className="py-3 px-3 font-mono text-primary font-bold">
                          {match.tag || "-"}
                        </td>
                        <td className="py-3 px-3 text-text-secondary">
                          {match.sop_description || match.pid_description || "-"}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {match.sop_pressure != null ? `${match.sop_pressure} psig` : "-"}
                        </td>
                        <td className={cn(
                          "py-3 px-3 text-center font-mono",
                          match.pressure_issue ? "text-status-error" : "text-status-success"
                        )}>
                          {match.pid_pressure != null ? `${match.pid_pressure} psig` : "-"}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {match.sop_temperature != null ? `${match.sop_temperature}°F` : "-"}
                        </td>
                        <td className={cn(
                          "py-3 px-3 text-center font-mono",
                          match.temperature_issue ? "text-orange-500" : "text-status-success"
                        )}>
                          {match.pid_temperature != null ? `${match.pid_temperature}°F` : "-"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {hasIssue ? (
                            <Badge variant="destructive" className="text-2xs">MISMATCH</Badge>
                          ) : (
                            <Badge className="bg-status-success text-2xs">OK</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missing in P&ID Section */}
      {missingInPid.length > 0 && (
        <Card className="border-status-error">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="text-status-error text-xl">✗</span>
              <CardTitle className="text-status-error">SOP_ITEMS_NOT_FOUND_IN_DIAGRAM</CardTitle>
              <Badge variant="destructive">{missingInPid.length}</Badge>
            </div>
            <p className="text-sm text-text-muted mt-2">
              These items are mentioned in the SOP but were not found in the P&ID diagram
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {missingInPid.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-sm border border-status-error/50 bg-status-error/5"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-primary font-bold text-lg">
                      {item.tag || "Unknown"}
                    </span>
                    <Badge variant="destructive">NOT FOUND</Badge>
                  </div>
                  {item.sop_description && (
                    <p className="text-text-secondary mb-2">{item.sop_description}</p>
                  )}
                  <div className="flex gap-4 text-sm text-text-muted">
                    {item.sop_pressure && (
                      <span>SOP Pressure: <span className="font-mono">{item.sop_pressure} psig</span></span>
                    )}
                    {item.sop_temperature && (
                      <span>SOP Temp: <span className="font-mono">{item.sop_temperature}°F</span></span>
                    )}
                  </div>
                  {item.issue && (
                    <p className="text-status-error text-sm mt-2">{item.issue}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export */}
      <Card variant="ascii">
        <CardHeader>
          <CardTitle>EXPORT_REPORT</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `sop-verification-${jobId}.json`;
                a.click();
              }}
            >
              Download JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const lines = [
                  "SOP vs P&ID VERIFICATION REPORT",
                  "=".repeat(50),
                  "",
                  `Status: ${isPassing ? "PASS - All SOP items found" : "REVIEW - Some items missing"}`,
                  `Match Rate: ${matchRate.toFixed(0)}%`,
                  `SOP Items: ${totalSopItems}`,
                  `Found in P&ID: ${matches.length}`,
                  `Missing: ${missingInPid.length}`,
                  "",
                ];

                if (matches.length > 0) {
                  lines.push("MATCHED ITEMS", "-".repeat(50));
                  matches.forEach((m) => {
                    lines.push(`✓ ${m.tag} - ${m.sop_description || m.pid_description || ""}`);
                    lines.push(`  SOP: ${m.sop_pressure || "-"} psig, ${m.sop_temperature || "-"}°F`);
                    lines.push(`  P&ID: ${m.pid_pressure || "-"} psig, ${m.pid_temperature || "-"}°F`);
                  });
                  lines.push("");
                }

                if (missingInPid.length > 0) {
                  lines.push("MISSING FROM P&ID", "-".repeat(50));
                  missingInPid.forEach((m) => {
                    lines.push(`✗ ${m.tag} - ${m.sop_description || ""}`);
                    if (m.sop_pressure || m.sop_temperature) {
                      lines.push(`  SOP requires: ${m.sop_pressure || "-"} psig, ${m.sop_temperature || "-"}°F`);
                    }
                  });
                }

                const blob = new Blob([lines.join("\n")], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `sop-verification-${jobId}.txt`;
                a.click();
              }}
            >
              Download TXT
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
