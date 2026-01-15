"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/regulation`;

interface Props {
  jobId?: string | null;
}

interface Clause {
  id: string;
  text: string;
  source_document?: string;
  regulations?: { filename: string };
  category: string;
  severity: string;
  extraction_method?: string;
  page_range?: string;
  actions?: string[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-status-error/20 text-status-error border-status-error",
  important: "bg-status-warning/20 text-status-warning border-status-warning",
  advisory: "bg-primary/20 text-primary border-primary",
  informational: "bg-border text-text-secondary border-border",
};

const CATEGORY_ICONS: Record<string, string> = {
  safety: "&#9888;",
  environmental: "&#127807;",
  documentation: "&#128196;",
  training: "&#127891;",
  inspection: "&#128269;",
  equipment: "&#128736;",
  operational: "&#9881;",
  personnel: "&#128100;",
  general: "&#9632;",
};

export function ClauseViewer({ jobId }: Props) {
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClauses() {
      setLoading(true);
      try {
        // Always fetch from stored clauses
        const res = await fetch(`${API_BASE}/clauses/all`);
        const data = await res.json();
        setClauses(data.clauses || []);
      } catch (error) {
        console.error("Failed to fetch clauses:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchClauses();
  }, []);

  const getSourceName = (clause: Clause): string => {
    return clause.source_document || clause.regulations?.filename || "Unknown";
  };

  const filteredClauses = clauses.filter((clause) => {
    const sourceName = getSourceName(clause);
    const matchesText = filter
      ? clause.text.toLowerCase().includes(filter.toLowerCase()) ||
        sourceName.toLowerCase().includes(filter.toLowerCase())
      : true;
    const matchesCategory = categoryFilter
      ? clause.category === categoryFilter
      : true;
    const matchesSeverity = severityFilter
      ? clause.severity === severityFilter
      : true;
    return matchesText && matchesCategory && matchesSeverity;
  });

  const categories = [...new Set(clauses.map((c) => c.category))];
  const severities = [...new Set(clauses.map((c) => c.severity))];

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-text-muted"
          >
            LOADING_CLAUSES...
          </motion.span>
        </CardContent>
      </Card>
    );
  }

  if (clauses.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-text-muted mb-2">No clauses stored yet</p>
          <p className="text-2xs text-text-muted">
            Upload and process regulation documents to extract clauses
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-primary">{clauses.length}</div>
            <div className="text-2xs text-text-muted uppercase">Total Clauses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-status-error">
              {clauses.filter((c) => c.severity === "critical").length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Critical</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-status-warning">
              {clauses.filter((c) => c.severity === "important").length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Important</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-text-secondary">
              {categories.length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Categories</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-center">
            <Input
              placeholder="Search clauses..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-xs"
            />

            <div className="flex flex-wrap gap-2">
              <span className="text-2xs text-text-muted uppercase">Category:</span>
              <button
                onClick={() => setCategoryFilter(null)}
                className={cn(
                  "text-2xs px-2 py-1 rounded-sm transition-colors",
                  !categoryFilter
                    ? "bg-primary text-background"
                    : "bg-border text-text-secondary hover:bg-primary/20"
                )}
              >
                ALL
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                  className={cn(
                    "text-2xs px-2 py-1 rounded-sm transition-colors",
                    categoryFilter === cat
                      ? "bg-primary text-background"
                      : "bg-border text-text-secondary hover:bg-primary/20"
                  )}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-2xs text-text-muted uppercase">Severity:</span>
              {severities.map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev === severityFilter ? null : sev)}
                  className={cn(
                    "text-2xs px-2 py-1 rounded-sm border transition-colors",
                    severityFilter === sev
                      ? SEVERITY_COLORS[sev]
                      : "border-border text-text-secondary hover:bg-primary/10"
                  )}
                >
                  {sev.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clauses List */}
      <Card>
        <CardHeader>
          <CardTitle>
            STORED_CLAUSES ({filteredClauses.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 max-h-[600px] overflow-y-auto">
          <div className="divide-y divide-border">
            {filteredClauses.map((clause, index) => (
              <motion.div
                key={clause.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index * 0.01, 0.5) }}
                className="p-4 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="text-lg text-primary mt-0.5"
                    dangerouslySetInnerHTML={{
                      __html: CATEGORY_ICONS[clause.category] || CATEGORY_ICONS.general,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline" className="text-2xs">
                        {getSourceName(clause)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn("text-2xs border", SEVERITY_COLORS[clause.severity])}
                      >
                        {clause.severity.toUpperCase()}
                      </Badge>
                      <span className="text-2xs text-text-muted">
                        {clause.category}
                      </span>
                      {clause.page_range && (
                        <span className="text-2xs text-text-muted">
                          Pages {clause.page_range}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {clause.text}
                    </p>
                    {clause.actions && clause.actions.length > 0 && (
                      <div className="mt-2 text-2xs text-text-muted">
                        <span className="font-medium">Actions: </span>
                        {clause.actions.join(" | ")}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
