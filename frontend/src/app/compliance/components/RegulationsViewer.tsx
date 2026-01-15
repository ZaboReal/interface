"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/regulation`;

interface Clause {
  id: string;
  text: string;
  category: string;
  severity: string;
  extraction_method?: string;
  metadata?: {
    type?: string;
    actions?: string[];
  };
}

interface Regulation {
  id: string;
  filename: string;
  clause_count: number;
  page_count: number;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-status-error/20 text-status-error border-status-error",
  important: "bg-status-warning/20 text-status-warning border-status-warning",
  advisory: "bg-primary/20 text-primary border-primary",
  informational: "bg-border text-text-secondary border-border",
};

const CATEGORY_ICONS: Record<string, string> = {
  safety: "⚠",
  environmental: "🌿",
  documentation: "📄",
  training: "🎓",
  inspection: "🔍",
  equipment: "⚙",
  operational: "⚡",
  personnel: "👤",
  general: "■",
};

export function RegulationsViewer() {
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReg, setExpandedReg] = useState<string | null>(null);
  const [clauses, setClauses] = useState<Record<string, Clause[]>>({});
  const [loadingClauses, setLoadingClauses] = useState<string | null>(null);

  useEffect(() => {
    loadRegulations();
  }, []);

  const loadRegulations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/regulations/stored`);
      if (res.ok) {
        const data = await res.json();
        setRegulations(data.regulations || []);
      }
    } catch (error) {
      console.error("Failed to load regulations:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadClauses = async (regulationId: string) => {
    if (clauses[regulationId]) {
      // Already loaded
      return;
    }

    setLoadingClauses(regulationId);
    try {
      const res = await fetch(`${API_BASE}/regulations/stored/${regulationId}/clauses`);
      if (res.ok) {
        const data = await res.json();
        setClauses((prev) => ({
          ...prev,
          [regulationId]: data.clauses || [],
        }));
      }
    } catch (error) {
      console.error("Failed to load clauses:", error);
    } finally {
      setLoadingClauses(null);
    }
  };

  const toggleRegulation = async (regulationId: string) => {
    if (expandedReg === regulationId) {
      setExpandedReg(null);
    } else {
      setExpandedReg(regulationId);
      await loadClauses(regulationId);
    }
  };

  const getClauseStats = (regClauses: Clause[]) => {
    const stats = {
      critical: 0,
      important: 0,
      advisory: 0,
      categories: {} as Record<string, number>,
    };

    for (const clause of regClauses) {
      if (clause.severity === "critical") stats.critical++;
      else if (clause.severity === "important") stats.important++;
      else stats.advisory++;

      const cat = clause.category || "general";
      stats.categories[cat] = (stats.categories[cat] || 0) + 1;
    }

    return stats;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-text-muted"
          >
            LOADING_REGULATIONS...
          </motion.span>
        </CardContent>
      </Card>
    );
  }

  if (regulations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-text-muted mb-2">No regulations stored yet</p>
          <p className="text-2xs text-text-muted">
            Go to DOCUMENTS tab to upload and process regulation PDFs
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalClauses = regulations.reduce((sum, r) => sum + (r.clause_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-primary">{regulations.length}</div>
            <div className="text-2xs text-text-muted uppercase">Documents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-primary">{totalClauses}</div>
            <div className="text-2xs text-text-muted uppercase">Total Clauses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {regulations.reduce((sum, r) => sum + (r.page_count || 0), 0)}
            </div>
            <div className="text-2xs text-text-muted uppercase">Total Pages</div>
          </CardContent>
        </Card>
      </div>

      {/* Regulations List */}
      <div className="space-y-3">
        {regulations.map((reg) => {
          const isExpanded = expandedReg === reg.id;
          const regClauses = clauses[reg.id] || [];
          const stats = regClauses.length > 0 ? getClauseStats(regClauses) : null;

          return (
            <Card key={reg.id} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer hover:bg-primary/5 transition-colors"
                onClick={() => toggleRegulation(reg.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📋</span>
                    <div>
                      <CardTitle className="text-sm">{reg.filename}</CardTitle>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-2xs text-text-muted">
                          {reg.page_count} pages
                        </span>
                        <Badge variant="outline" className="text-2xs">
                          {reg.clause_count} clauses
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stats && (
                      <div className="flex gap-1">
                        {stats.critical > 0 && (
                          <Badge className="bg-status-error/20 text-status-error text-2xs">
                            {stats.critical} critical
                          </Badge>
                        )}
                        {stats.important > 0 && (
                          <Badge className="bg-status-warning/20 text-status-warning text-2xs">
                            {stats.important} important
                          </Badge>
                        )}
                      </div>
                    )}
                    <span className="text-lg text-text-muted">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CardContent className="border-t border-border pt-4">
                      {loadingClauses === reg.id ? (
                        <div className="text-center py-4">
                          <motion.span
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="text-text-muted"
                          >
                            Loading clauses...
                          </motion.span>
                        </div>
                      ) : regClauses.length === 0 ? (
                        <p className="text-text-muted text-sm text-center py-4">
                          No clauses found
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {/* Category breakdown */}
                          {stats && (
                            <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
                              {Object.entries(stats.categories).map(([cat, count]) => (
                                <Badge
                                  key={cat}
                                  variant="outline"
                                  className="text-2xs"
                                >
                                  {CATEGORY_ICONS[cat] || "■"} {cat}: {count}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Clauses list */}
                          <div className="max-h-[400px] overflow-y-auto space-y-2">
                            {regClauses.map((clause, i) => (
                              <motion.div
                                key={clause.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(i * 0.02, 0.5) }}
                                className="p-3 bg-background border border-border rounded-sm"
                              >
                                <div className="flex items-start gap-2">
                                  <span className="text-sm mt-0.5">
                                    {CATEGORY_ICONS[clause.category] || "■"}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "text-2xs border",
                                          SEVERITY_COLORS[clause.severity]
                                        )}
                                      >
                                        {clause.severity?.toUpperCase()}
                                      </Badge>
                                      <span className="text-2xs text-text-muted">
                                        {clause.category}
                                      </span>
                                      {clause.metadata?.type && (
                                        <span className="text-2xs text-text-muted">
                                          • {clause.metadata.type}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-text-secondary">
                                      {clause.text}
                                    </p>
                                    {clause.metadata?.actions && clause.metadata.actions.length > 0 && (
                                      <div className="mt-2 text-2xs text-text-muted">
                                        <span className="font-medium">Actions: </span>
                                        {clause.metadata.actions.join(" | ")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
