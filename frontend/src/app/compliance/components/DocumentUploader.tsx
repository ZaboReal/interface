"use client";

import { useCallback, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LogViewer } from "./LogViewer";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/regulation`;

interface StoredRegulation {
  id: string;
  filename: string;
  clause_count: number;
  page_count: number;
  created_at: string;
}

interface Props {
  onAnalysisStart: (jobId: string) => void;
  onAnalysisComplete: () => void;
  onAnalysisError: () => void;
}

export function DocumentUploader({
  onAnalysisStart,
  onAnalysisComplete,
  onAnalysisError,
}: Props) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Stored regulations from DB
  const [storedRegulations, setStoredRegulations] = useState<StoredRegulation[]>([]);
  const [selectedRegulations, setSelectedRegulations] = useState<Set<string>>(new Set());
  const [loadingStored, setLoadingStored] = useState(true);

  // Upload state
  const [uploadingRegulations, setUploadingRegulations] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<{ current: number; total: number } | null>(null);

  // SOP state
  const [sopData, setSopData] = useState<{ filename: string; sections: number; preview: string } | null>(null);
  const [uploadingSop, setUploadingSop] = useState(false);

  // Mode: 'select' or 'upload'
  const [regulationMode, setRegulationMode] = useState<'select' | 'upload'>('select');

  // Load stored regulations on mount
  useEffect(() => {
    loadStoredRegulations();
  }, []);

  const loadStoredRegulations = async () => {
    setLoadingStored(true);
    try {
      const res = await fetch(`${API_BASE}/regulations/stored`);
      if (res.ok) {
        const data = await res.json();
        const regs = data.regulations || [];
        setStoredRegulations(regs);
        // Auto-select all by default
        setSelectedRegulations(new Set(regs.map((r: StoredRegulation) => r.id)));
      }
    } catch (error) {
      console.error("Failed to load stored regulations:", error);
    } finally {
      setLoadingStored(false);
    }
  };

  const toggleRegulation = (id: string) => {
    setSelectedRegulations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedRegulations(new Set(storedRegulations.map((r) => r.id)));
  };

  const selectNone = () => {
    setSelectedRegulations(new Set());
  };

  const handleRegulationsUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;

      setUploadingRegulations(true);
      setIngestProgress({ current: 0, total: files.length });

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setIngestProgress({ current: i + 1, total: files.length });

          // Upload and parse
          const uploadRes = await fetch(`${API_BASE}/upload/regulations`, {
            method: "POST",
            body: (() => {
              const fd = new FormData();
              fd.append("files", file);
              return fd;
            })(),
          });

          if (!uploadRes.ok) continue;

          const uploadData = await uploadRes.json();
          if (!uploadData.documents?.length) continue;

          // Ingest each document
          for (const doc of uploadData.documents) {
            await fetch(`${API_BASE}/regulations/ingest`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(doc),
            });
          }
        }

        // Reload stored regulations
        await loadStoredRegulations();
      } catch (error) {
        console.error("Failed to upload regulations:", error);
      } finally {
        setUploadingRegulations(false);
        setIngestProgress(null);
      }
    },
    []
  );

  const handleSopUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingSop(true);
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`${API_BASE}/upload/sop`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        setSopData(data);
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setUploadingSop(false);
      }
    },
    []
  );

  const loadPreloadedSop = useCallback(async () => {
    setUploadingSop(true);
    try {
      const sopRes = await fetch(`${API_BASE}/sop/preloaded`);
      if (sopRes.ok) {
        const data = await sopRes.json();
        setSopData(data);
      }
    } catch (error) {
      console.error("Failed to load preloaded SOP:", error);
    } finally {
      setUploadingSop(false);
    }
  }, []);

  const startAnalysis = useCallback(async () => {
    if (!sopData || selectedRegulations.size === 0) return;

    setIsAnalyzing(true);
    setProgress(0);
    setProgressMessage("Starting analysis...");

    try {
      // Get selected regulation IDs
      const selectedIds = Array.from(selectedRegulations);

      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sop_data: sopData,
          regulation_ids: selectedIds,  // Pass selected IDs
          use_stored_clauses: true,
        }),
      });
      const { job_id } = await res.json();
      setCurrentJobId(job_id);
      onAnalysisStart(job_id);

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/analyze/${job_id}`);
          const status = await statusRes.json();

          setProgress(status.progress || 0);

          if (status.progress < 50) {
            setProgressMessage("Loading selected clauses...");
          } else if (status.progress < 80) {
            setProgressMessage("Analyzing SOP compliance...");
          } else {
            setProgressMessage("Generating report...");
          }

          if (status.status === "completed") {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            onAnalysisComplete();
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            onAnalysisError();
          }
        } catch {
          clearInterval(pollInterval);
          setIsAnalyzing(false);
          onAnalysisError();
        }
      }, 1000);
    } catch (err) {
      console.error("Analysis failed:", err);
      setIsAnalyzing(false);
      onAnalysisError();
    }
  }, [sopData, selectedRegulations, onAnalysisStart, onAnalysisComplete, onAnalysisError]);

  const selectedClauseCount = storedRegulations
    .filter((r) => selectedRegulations.has(r.id))
    .reduce((sum, r) => sum + (r.clause_count || 0), 0);

  const canAnalyze = sopData && selectedRegulations.size > 0;

  return (
    <div className="space-y-6">
      {/* Step 1: Regulations - Two Column Layout */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <span className="text-primary">1.</span> SELECT_REGULATIONS
            </CardTitle>
            {selectedRegulations.size > 0 && (
              <Badge variant="success">
                {selectedRegulations.size} SELECTED | {selectedClauseCount} CLAUSES
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={regulationMode === 'select' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRegulationMode('select')}
              className="flex-1"
            >
              SELECT FROM DATABASE
            </Button>
            <Button
              variant={regulationMode === 'upload' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRegulationMode('upload')}
              className="flex-1"
            >
              UPLOAD NEW
            </Button>
          </div>

          {regulationMode === 'select' ? (
            /* Select from existing */
            <div className="space-y-3">
              {loadingStored ? (
                <div className="flex items-center gap-2 text-text-muted py-4 justify-center">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    ⚙
                  </motion.span>
                  Loading regulations...
                </div>
              ) : storedRegulations.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-text-muted mb-2">No regulations in database</p>
                  <p className="text-2xs text-text-muted">
                    Switch to &quot;Upload New&quot; to add regulations
                  </p>
                </div>
              ) : (
                <>
                  {/* Select controls */}
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="text-2xs text-text-muted">
                      {storedRegulations.length} regulations available
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="text-2xs text-primary hover:underline"
                      >
                        Select All
                      </button>
                      <span className="text-text-muted">|</span>
                      <button
                        onClick={selectNone}
                        className="text-2xs text-text-muted hover:text-primary"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Regulations list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                    {storedRegulations.map((reg) => {
                      const isSelected = selectedRegulations.has(reg.id);
                      return (
                        <div
                          key={reg.id}
                          onClick={() => toggleRegulation(reg.id)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-sm border cursor-pointer transition-all",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50 hover:bg-primary/5"
                          )}
                        >
                          <div
                            className={cn(
                              "w-5 h-5 rounded-sm border-2 flex items-center justify-center text-xs",
                              isSelected
                                ? "border-primary bg-primary text-background"
                                : "border-border"
                            )}
                          >
                            {isSelected && "✓"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {reg.filename.replace("REG-", "")}
                            </p>
                            <p className="text-2xs text-text-muted">
                              {reg.page_count} pages • {reg.clause_count} clauses
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Upload new */
            <div className="space-y-3">
              <p className="text-2xs text-text-muted">
                Upload new regulation PDFs. They will be processed and added to the database.
              </p>
              <label
                className={cn(
                  "flex flex-col items-center justify-center gap-2 px-4 py-8",
                  "border-2 border-dashed border-border rounded-sm cursor-pointer",
                  "hover:border-primary hover:bg-primary/5 transition-colors",
                  uploadingRegulations && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="text-2xl">📄</span>
                <span className="text-sm">
                  {uploadingRegulations
                    ? ingestProgress
                      ? `Processing ${ingestProgress.current}/${ingestProgress.total}...`
                      : "Processing..."
                    : "Drop PDFs here or click to upload"}
                </span>
                <span className="text-2xs text-text-muted">
                  PDF files only
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf"
                  multiple
                  onChange={handleRegulationsUpload}
                  disabled={uploadingRegulations}
                />
              </label>

              {uploadingRegulations && ingestProgress && (
                <Progress
                  value={(ingestProgress.current / ingestProgress.total) * 100}
                  max={100}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: SOP */}
      <Card className={cn(selectedRegulations.size === 0 && "opacity-50")}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <span className="text-primary">2.</span> SOP_DOCUMENT
            </CardTitle>
            {sopData && <Badge variant="success">LOADED</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {selectedRegulations.size === 0 ? (
            <p className="text-text-muted text-sm">
              ↑ First, select regulations above
            </p>
          ) : sopData ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-status-success">
                <span className="text-lg">✓</span>
                <span className="font-medium text-sm">{sopData.filename}</span>
              </div>
              <p className="text-2xs text-text-muted">
                {sopData.sections} sections detected
              </p>
              <div className="p-3 bg-background border border-border rounded-sm text-2xs text-text-secondary max-h-24 overflow-y-auto font-mono">
                {sopData.preview}
              </div>
              <Button
                onClick={() => setSopData(null)}
                variant="ghost"
                size="sm"
                className="text-text-muted"
              >
                Change SOP
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <label
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-6",
                  "border-2 border-dashed border-border rounded-sm cursor-pointer",
                  "hover:border-primary hover:bg-primary/5 transition-colors",
                  uploadingSop && "opacity-50 cursor-not-allowed"
                )}
              >
                <span>↑</span>
                <span className="text-sm">
                  {uploadingSop ? "Uploading..." : "Upload SOP (PDF/DOCX)"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx"
                  onChange={handleSopUpload}
                  disabled={uploadingSop}
                />
              </label>
              <Button
                onClick={loadPreloadedSop}
                disabled={uploadingSop}
                variant="outline"
                className="px-4"
              >
                DEMO_SOP
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Analyze */}
      <Card className={cn(!canAnalyze && "opacity-50")}>
        <CardHeader>
          <CardTitle>
            <span className="text-primary">3.</span> ANALYZE_COMPLIANCE
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAnalyzing ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="text-primary"
                >
                  ⚙
                </motion.span>
                <span className="text-sm text-primary font-medium">
                  {progressMessage}
                </span>
              </div>
              <Progress value={progress} max={100} showValue />
              <LogViewer jobId={currentJobId} isRunning={isAnalyzing} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={startAnalysis}
                disabled={!canAnalyze}
                size="lg"
                className="w-full"
              >
                ▶ START_COMPLIANCE_ANALYSIS
              </Button>
              {!canAnalyze && (
                <p className="text-2xs text-text-muted">
                  {selectedRegulations.size === 0
                    ? "Select at least one regulation"
                    : "Upload an SOP document to analyze"}
                </p>
              )}
              {canAnalyze && (
                <p className="text-2xs text-status-success">
                  Ready to analyze SOP against {selectedClauseCount} clauses from {selectedRegulations.size} regulations
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
