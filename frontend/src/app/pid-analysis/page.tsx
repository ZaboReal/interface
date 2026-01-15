"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PIDUploader } from "./components/PIDUploader";
import { GraphViewer } from "./components/GraphViewer";
import { ComponentList } from "./components/ComponentList";
import { DiscrepancyReport } from "./components/DiscrepancyReport";
import { LogViewer } from "./components/LogViewer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tab = "upload" | "graph" | "components" | "discrepancies";

export default function PIDAnalysisPage() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string>("idle");

  const tabs: { id: Tab; label: string; disabled: boolean }[] = [
    { id: "upload", label: "UPLOAD", disabled: false },
    { id: "graph", label: "GRAPH", disabled: analysisStatus !== "completed" },
    { id: "components", label: "COMPONENTS", disabled: analysisStatus !== "completed" },
    { id: "discrepancies", label: "DISCREPANCIES", disabled: analysisStatus !== "completed" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-primary uppercase tracking-[0.15em]">
            &gt;_ PID_DIAGRAM_ANALYZER
          </h1>
          <p className="text-2xs text-text-muted mt-1">
            Process P&ID diagrams and cross-reference with SOP documents
          </p>
        </div>

        {analysisStatus !== "idle" && (
          <Badge
            variant={
              analysisStatus === "completed"
                ? "success"
                : analysisStatus === "failed"
                ? "destructive"
                : "default"
            }
            pulse={analysisStatus === "processing"}
          >
            {analysisStatus.toUpperCase()}
          </Badge>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={cn(
              "px-4 py-2 text-2xs font-bold uppercase tracking-[0.1em] transition-all",
              "border-b-2 -mb-[2px]",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary",
              tab.disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            [{tab.label}]
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "upload" && (
            <>
              <PIDUploader
                onAnalysisStart={(jobId) => {
                  setCurrentJobId(jobId);
                  setAnalysisStatus("processing");
                }}
                onAnalysisComplete={() => {
                  setAnalysisStatus("completed");
                  setActiveTab("graph");
                }}
                onAnalysisError={() => setAnalysisStatus("failed")}
              />
              <LogViewer
                jobId={currentJobId}
                isRunning={analysisStatus === "processing"}
              />
            </>
          )}

          {activeTab === "graph" && currentJobId && analysisStatus === "completed" && (
            <GraphViewer jobId={currentJobId} />
          )}

          {activeTab === "components" && currentJobId && analysisStatus === "completed" && (
            <ComponentList jobId={currentJobId} />
          )}

          {activeTab === "discrepancies" && currentJobId && analysisStatus === "completed" && (
            <DiscrepancyReport jobId={currentJobId} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
