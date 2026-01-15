"use client";

import { useCallback, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/cv`;

interface Props {
  onAnalysisStart: (jobId: string) => void;
  onAnalysisComplete: () => void;
  onAnalysisError: () => void;
}

interface RecentJob {
  id: string;
  status: string;
  progress: number;
  pid_filename: string;
  sop_filename: string;
  created_at: string;
}

export function PIDUploader({
  onAnalysisStart,
  onAnalysisComplete,
  onAnalysisError,
}: Props) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // File state
  const [pidFile, setPidFile] = useState<File | null>(null);
  const [sopFile, setSopFile] = useState<File | null>(null);

  // Recent jobs
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Load recent jobs on mount
  useEffect(() => {
    loadRecentJobs();
  }, []);

  const loadRecentJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch(`${API_BASE}/jobs?limit=5`);
      if (res.ok) {
        const data = await res.json();
        setRecentJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to load recent jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handlePidUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPidFile(file);
    }
  }, []);

  const handleSopUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSopFile(file);
    }
  }, []);

  const startAnalysis = useCallback(async () => {
    if (!pidFile || !sopFile) return;

    setIsAnalyzing(true);
    setProgress(0);
    setProgressMessage("Uploading files...");

    try {
      const formData = new FormData();
      formData.append("pid_file", pidFile);
      formData.append("sop_file", sopFile);

      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to start analysis");
      }

      const { job_id } = await res.json();
      setCurrentJobId(job_id);
      onAnalysisStart(job_id);

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/status/${job_id}`);
          const status = await statusRes.json();

          setProgress(status.progress || 0);

          if (status.progress < 20) {
            setProgressMessage("Converting PDF to images...");
          } else if (status.progress < 40) {
            setProgressMessage("Preprocessing images...");
          } else if (status.progress < 60) {
            setProgressMessage("Detecting components with YOLO...");
          } else if (status.progress < 80) {
            setProgressMessage("Building graph...");
          } else if (status.progress < 90) {
            setProgressMessage("Cross-referencing with SOP...");
          } else {
            setProgressMessage("Generating report...");
          }

          if (status.status === "completed") {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            await loadRecentJobs();
            onAnalysisComplete();
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            setProgressMessage(`Error: ${status.error || "Unknown error"}`);
            onAnalysisError();
          }
        } catch (error) {
          clearInterval(pollInterval);
          setIsAnalyzing(false);
          onAnalysisError();
        }
      }, 1000);
    } catch (error) {
      console.error("Analysis failed:", error);
      setIsAnalyzing(false);
      onAnalysisError();
    }
  }, [pidFile, sopFile, onAnalysisStart, onAnalysisComplete, onAnalysisError]);

  const loadExistingJob = useCallback(async (jobId: string) => {
    setCurrentJobId(jobId);
    onAnalysisStart(jobId);
    onAnalysisComplete();
  }, [onAnalysisStart, onAnalysisComplete]);

  const canAnalyze = pidFile && sopFile && !isAnalyzing;

  return (
    <div className="space-y-6">
      {/* Step 1: P&ID Document */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <span className="text-primary">1.</span> PID_DOCUMENT
            </CardTitle>
            {pidFile && <Badge variant="success">LOADED</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {pidFile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-status-success">
                <span className="text-lg">✓</span>
                <span className="font-medium text-sm">{pidFile.name}</span>
              </div>
              <p className="text-2xs text-text-muted">
                {(pidFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <Button
                onClick={() => setPidFile(null)}
                variant="ghost"
                size="sm"
                className="text-text-muted"
              >
                Change File
              </Button>
            </div>
          ) : (
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-2 px-4 py-8",
                "border-2 border-dashed border-border rounded-sm cursor-pointer",
                "hover:border-primary hover:bg-primary/5 transition-colors"
              )}
            >
              <span className="text-3xl">📐</span>
              <span className="text-sm">Drop P&ID diagram here or click to upload</span>
              <span className="text-2xs text-text-muted">PDF files only</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf"
                onChange={handlePidUpload}
              />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Step 2: SOP Document */}
      <Card className={cn(!pidFile && "opacity-50")}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <span className="text-primary">2.</span> SOP_DOCUMENT
            </CardTitle>
            {sopFile && <Badge variant="success">LOADED</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {!pidFile ? (
            <p className="text-text-muted text-sm">↑ First, upload a P&ID diagram</p>
          ) : sopFile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-status-success">
                <span className="text-lg">✓</span>
                <span className="font-medium text-sm">{sopFile.name}</span>
              </div>
              <p className="text-2xs text-text-muted">
                {(sopFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <Button
                onClick={() => setSopFile(null)}
                variant="ghost"
                size="sm"
                className="text-text-muted"
              >
                Change File
              </Button>
            </div>
          ) : (
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-2 px-4 py-8",
                "border-2 border-dashed border-border rounded-sm cursor-pointer",
                "hover:border-primary hover:bg-primary/5 transition-colors"
              )}
            >
              <span className="text-3xl">📄</span>
              <span className="text-sm">Drop SOP document here or click to upload</span>
              <span className="text-2xs text-text-muted">PDF or DOCX files</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc"
                onChange={handleSopUpload}
              />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Analyze */}
      <Card className={cn(!canAnalyze && !isAnalyzing && "opacity-50")}>
        <CardHeader>
          <CardTitle>
            <span className="text-primary">3.</span> ANALYZE_PID
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
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={startAnalysis}
                disabled={!canAnalyze}
                size="lg"
                className="w-full"
              >
                ▶ START_PID_ANALYSIS
              </Button>
              {!canAnalyze && (
                <p className="text-2xs text-text-muted">
                  {!pidFile
                    ? "Upload a P&ID diagram first"
                    : "Upload an SOP document to analyze"}
                </p>
              )}
              {canAnalyze && (
                <p className="text-2xs text-status-success">
                  Ready to analyze P&ID and cross-reference with SOP
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      {!isAnalyzing && recentJobs.length > 0 && (
        <Card variant="ascii">
          <CardHeader>
            <CardTitle>RECENT_ANALYSES</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-sm border border-border",
                    "hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all",
                    job.status === "completed" && "border-status-success/30"
                  )}
                  onClick={() => job.status === "completed" && loadExistingJob(job.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {job.pid_filename || "Unknown P&ID"}
                      </span>
                      <Badge
                        variant={
                          job.status === "completed"
                            ? "success"
                            : job.status === "failed"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-2xs"
                      >
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-2xs text-text-muted">
                      {job.sop_filename || "Unknown SOP"} •{" "}
                      {new Date(job.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {job.status === "completed" && (
                    <span className="text-primary text-sm">→</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
