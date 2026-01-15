"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/cv`;

interface Component {
  id: string;
  component_type: string;
  tag: string | null;
  label: string | null;
  confidence: number;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  detection_method: string;
  page_number: number;
}

interface SOPComponent {
  id: string;
  tag: string;
  component_type: string | null;
  section_title: string | null;
  context: string | null;
}

interface Props {
  jobId: string;
}

const TYPE_COLORS: Record<string, string> = {
  valve: "bg-red-500",
  pump: "bg-blue-500",
  tank: "bg-green-500",
  sensor: "bg-yellow-500",
  heat_exchanger: "bg-orange-500",
  compressor: "bg-purple-500",
  filter: "bg-cyan-500",
  motor: "bg-pink-500",
  meter: "bg-lime-500",
  panel: "bg-slate-500",
  unknown: "bg-gray-500",
};

export function ComponentList({ jobId }: Props) {
  const [pidComponents, setPidComponents] = useState<Component[]>([]);
  const [sopComponents, setSopComponents] = useState<SOPComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"pid" | "sop">("pid");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadComponents();
  }, [jobId]);

  const loadComponents = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pidRes, sopRes] = await Promise.all([
        fetch(`${API_BASE}/components/${jobId}`),
        fetch(`${API_BASE}/sop-components/${jobId}`),
      ]);

      if (!pidRes.ok || !sopRes.ok) {
        throw new Error("Failed to load components");
      }

      const pidData = await pidRes.json();
      const sopData = await sopRes.json();

      setPidComponents(pidData.components || []);
      setSopComponents(sopData.components || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Get unique types for filtering
  const uniqueTypes = Array.from(
    new Set(pidComponents.map((c) => c.component_type))
  ).sort();

  // Filter components
  const filteredPidComponents = pidComponents.filter((c) => {
    if (typeFilter && c.component_type !== typeFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        c.tag?.toLowerCase().includes(query) ||
        c.label?.toLowerCase().includes(query) ||
        c.component_type.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const filteredSopComponents = sopComponents.filter((c) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        c.tag.toLowerCase().includes(query) ||
        c.component_type?.toLowerCase().includes(query) ||
        c.section_title?.toLowerCase().includes(query)
      );
    }
    return true;
  });

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
            <span className="text-text-muted">Loading components...</span>
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
            <Button onClick={loadComponents} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {pidComponents.length}
            </div>
            <div className="text-2xs text-text-muted uppercase">P&ID Components</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {sopComponents.length}
            </div>
            <div className="text-2xs text-text-muted uppercase">SOP References</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {pidComponents.filter((c) => c.tag).length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Tagged (P&ID)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {(
                (pidComponents.reduce((sum, c) => sum + c.confidence, 0) /
                  pidComponents.length) *
                100
              ).toFixed(1)}
              %
            </div>
            <div className="text-2xs text-text-muted uppercase">Avg Confidence</div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle & Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-2">
              <Button
                variant={view === "pid" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("pid")}
              >
                P&ID ({pidComponents.length})
              </Button>
              <Button
                variant={view === "sop" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("sop")}
              >
                SOP ({sopComponents.length})
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1 text-sm bg-background border border-border rounded-sm focus:border-primary focus:outline-none"
              />
              {view === "pid" && (
                <select
                  value={typeFilter || ""}
                  onChange={(e) => setTypeFilter(e.target.value || null)}
                  className="px-3 py-1 text-sm bg-background border border-border rounded-sm focus:border-primary focus:outline-none"
                >
                  <option value="">All Types</option>
                  {uniqueTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === "pid" ? (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredPidComponents.length === 0 ? (
                <p className="text-center text-text-muted py-8">
                  No components found
                </p>
              ) : (
                filteredPidComponents.map((comp) => (
                  <div
                    key={comp.id}
                    className="flex items-center gap-4 p-3 rounded-sm border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-sm flex items-center justify-center text-white font-bold text-lg",
                        TYPE_COLORS[comp.component_type] || TYPE_COLORS.unknown
                      )}
                    >
                      {comp.component_type.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">
                          {comp.tag || `${comp.component_type}_${comp.id.slice(0, 8)}`}
                        </span>
                        <Badge variant="outline" className="text-2xs">
                          {comp.component_type}
                        </Badge>
                        <Badge
                          variant={comp.confidence > 0.7 ? "success" : "default"}
                          className="text-2xs"
                        >
                          {(comp.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <div className="text-2xs text-text-muted mt-1">
                        {comp.label && <span className="mr-2">{comp.label}</span>}
                        <span>
                          Detection: {comp.detection_method} • Page {comp.page_number}
                        </span>
                      </div>
                    </div>
                    <div className="text-2xs text-text-muted font-mono">
                      [{comp.bbox_x}, {comp.bbox_y}]
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredSopComponents.length === 0 ? (
                <p className="text-center text-text-muted py-8">
                  No SOP references found
                </p>
              ) : (
                filteredSopComponents.map((comp) => (
                  <div
                    key={comp.id}
                    className="flex items-center gap-4 p-3 rounded-sm border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                  >
                    <div className="w-10 h-10 rounded-sm bg-primary/20 flex items-center justify-center text-primary font-bold text-sm font-mono">
                      {comp.tag.split("-")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-primary">
                          {comp.tag}
                        </span>
                        {comp.component_type && (
                          <Badge variant="outline" className="text-2xs">
                            {comp.component_type}
                          </Badge>
                        )}
                      </div>
                      <div className="text-2xs text-text-muted mt-1">
                        {comp.section_title && (
                          <span>Section: {comp.section_title}</span>
                        )}
                      </div>
                      {comp.context && (
                        <p className="text-2xs text-text-secondary mt-1 truncate">
                          ...{comp.context}...
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type Distribution */}
      {view === "pid" && (
        <Card variant="ascii">
          <CardHeader>
            <CardTitle>TYPE_DISTRIBUTION</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {uniqueTypes.map((type) => {
                const count = pidComponents.filter(
                  (c) => c.component_type === type
                ).length;
                const percentage = ((count / pidComponents.length) * 100).toFixed(1);

                return (
                  <div
                    key={type}
                    className={cn(
                      "p-3 rounded-sm border border-border cursor-pointer transition-all",
                      typeFilter === type
                        ? "border-primary bg-primary/10"
                        : "hover:border-primary/50"
                    )}
                    onClick={() =>
                      setTypeFilter(typeFilter === type ? null : type)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-3 h-3 rounded-full",
                          TYPE_COLORS[type] || TYPE_COLORS.unknown
                        )}
                      />
                      <span className="text-sm font-medium">{type}</span>
                    </div>
                    <div className="text-2xs text-text-muted mt-1">
                      {count} ({percentage}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
