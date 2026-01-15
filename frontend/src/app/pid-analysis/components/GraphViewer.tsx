"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/cv`;

interface AnnotatedPage {
  annotated_image: string; // base64
  page_number: number;
  component_count: number;
  text_count: number;
  width: number;
  height: number;
}

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
  page_number: number;
  pressure?: string;
  temperature?: string;
}

interface GraphStats {
  node_count: number;
  edge_count: number;
  components: Record<string, number>;
}

interface Props {
  jobId: string;
}

// Component type to color mapping for sidebar
const TYPE_COLORS: Record<string, string> = {
  valve: "#ef4444",
  "gate-valve": "#ef4444",
  "needle-valve": "#dc2626",
  "bleed-valve": "#b91c1c",
  pump: "#3b82f6",
  tank: "#22c55e",
  sensor: "#eab308",
  heat_exchanger: "#f97316",
  exchanger: "#f97316",
  filter: "#06b6d4",
  compressor: "#8b5cf6",
  cooler: "#0ea5e9",
  coil: "#14b8a6",
  tundish: "#fbbf24",
  motor: "#ec4899",
  unknown: "#9ca3af",
};

export function GraphViewer({ jobId }: Props) {
  const [annotatedPages, setAnnotatedPages] = useState<AnnotatedPage[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load annotated images, components, and graph stats in parallel
      const [imagesRes, componentsRes, graphRes] = await Promise.all([
        fetch(`${API_BASE}/annotated-images/${jobId}`),
        fetch(`${API_BASE}/components/${jobId}`),
        fetch(`${API_BASE}/graph/${jobId}`),
      ]);

      if (!imagesRes.ok) {
        throw new Error("Failed to load annotated images");
      }

      const imagesData = await imagesRes.json();
      setAnnotatedPages(imagesData.pages || []);

      if (componentsRes.ok) {
        const componentsData = await componentsRes.json();
        setComponents(componentsData.components || []);
      }

      if (graphRes.ok) {
        const graphData = await graphRes.json();
        setGraphStats(graphData.stats || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleReset = () => setZoom(1);

  // Get components for current page
  const pageComponents = components.filter((c) => c.page_number === currentPage);

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
            <span className="text-text-muted">Loading annotated images...</span>
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
            <Button onClick={loadData} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (annotatedPages.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-text-muted">No annotated images available</p>
        </CardContent>
      </Card>
    );
  }

  const currentPageData = annotatedPages[currentPage - 1];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {annotatedPages.length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Pages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {components.length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Components</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {graphStats?.edge_count || 0}
            </div>
            <div className="text-2xs text-text-muted uppercase">Connections</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {components.filter((c) => c.tag).length}
            </div>
            <div className="text-2xs text-text-muted uppercase">Tagged</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-bold text-primary">
              {currentPageData?.text_count || 0}
            </div>
            <div className="text-2xs text-text-muted uppercase">Text Elements</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content: Image + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Annotated Image */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <CardTitle>ANNOTATED_DIAGRAM</CardTitle>
                  {/* Page Navigation */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      ←
                    </Button>
                    <span className="text-sm font-mono">
                      Page {currentPage} / {annotatedPages.length}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.min(annotatedPages.length, p + 1))}
                      disabled={currentPage === annotatedPages.length}
                    >
                      →
                    </Button>
                  </div>
                </div>
                {/* Zoom Controls */}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleZoomOut}>
                    −
                  </Button>
                  <span className="text-2xs text-text-muted w-12 text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button size="sm" variant="outline" onClick={handleZoomIn}>
                    +
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleReset}>
                    Reset
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative bg-background-dark rounded-sm border border-border overflow-auto max-h-[700px]">
                {currentPageData && (
                  <img
                    src={`data:image/jpeg;base64,${currentPageData.annotated_image}`}
                    alt={`P&ID Page ${currentPage} with annotations`}
                    className="transition-transform duration-200"
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "top left",
                    }}
                  />
                )}
              </div>
              {/* Image Info */}
              <div className="mt-3 flex items-center gap-4 text-2xs text-text-muted">
                <span>Size: {currentPageData?.width} x {currentPageData?.height}</span>
                <span>Components: {currentPageData?.component_count}</span>
                <span>Text: {currentPageData?.text_count}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Components List */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-sm">DETECTED_COMPONENTS</CardTitle>
              <p className="text-2xs text-text-muted">Page {currentPage}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {pageComponents.length === 0 ? (
                  <p className="text-center text-text-muted text-sm py-4">
                    No components on this page
                  </p>
                ) : (
                  pageComponents.map((comp) => (
                    <div
                      key={comp.id}
                      className={cn(
                        "p-2 rounded-sm border border-border cursor-pointer transition-all",
                        selectedComponent?.id === comp.id
                          ? "border-primary bg-primary/10"
                          : "hover:border-primary/50"
                      )}
                      onClick={() =>
                        setSelectedComponent(
                          selectedComponent?.id === comp.id ? null : comp
                        )
                      }
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              TYPE_COLORS[comp.component_type] ||
                              TYPE_COLORS.unknown,
                          }}
                        />
                        <span className="font-mono text-sm text-primary truncate">
                          {comp.tag || `${comp.component_type}`}
                        </span>
                      </div>
                      <div className="text-2xs text-text-muted mt-1">
                        {comp.component_type} • {(comp.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Component Type Legend */}
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-2xs text-text-muted uppercase mb-2">Legend</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(graphStats?.components || {}).slice(0, 8).map(
                    ([type, count]) => (
                      <div key={type} className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor:
                              TYPE_COLORS[type] || TYPE_COLORS.unknown,
                          }}
                        />
                        <span className="text-2xs text-text-muted truncate">
                          {type} ({count})
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Selected Component Details */}
      {selectedComponent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>COMPONENT_DETAILS</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedComponent(null)}
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xs text-text-muted uppercase">Tag</div>
                  <div className="font-mono text-primary">
                    {selectedComponent.tag || "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-text-muted uppercase">Type</div>
                  <Badge
                    style={{
                      backgroundColor:
                        TYPE_COLORS[selectedComponent.component_type] ||
                        TYPE_COLORS.unknown,
                    }}
                  >
                    {selectedComponent.component_type}
                  </Badge>
                </div>
                <div>
                  <div className="text-2xs text-text-muted uppercase">Confidence</div>
                  <div>{(selectedComponent.confidence * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-2xs text-text-muted uppercase">Page</div>
                  <div>{selectedComponent.page_number}</div>
                </div>
                {selectedComponent.label && (
                  <div className="col-span-2">
                    <div className="text-2xs text-text-muted uppercase">Label</div>
                    <div className="font-mono text-sm">{selectedComponent.label}</div>
                  </div>
                )}
                <div>
                  <div className="text-2xs text-text-muted uppercase">Position</div>
                  <div className="font-mono text-2xs">
                    [{selectedComponent.bbox_x}, {selectedComponent.bbox_y}]
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-text-muted uppercase">Size</div>
                  <div className="font-mono text-2xs">
                    {selectedComponent.bbox_width} x {selectedComponent.bbox_height}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
