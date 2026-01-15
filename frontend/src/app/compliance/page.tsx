"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DocumentUploader } from "./components/DocumentUploader";
import { RegulationsViewer } from "./components/RegulationsViewer";
import { ClauseViewer } from "./components/ClauseViewer";
import { ComplianceReport } from "./components/ComplianceReport";
import { SemanticSearch } from "./components/SemanticSearch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tab = "upload" | "regulations" | "clauses" | "report" | "search";

export default function CompliancePage() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [analysisJob, setAnalysisJob] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string>("idle");

  const tabs: { id: Tab; label: string; disabled: boolean }[] = [
    { id: "upload", label: "UPLOAD", disabled: false },
    { id: "regulations", label: "REGULATIONS", disabled: false },  // Shows stored docs with clauses
    { id: "clauses", label: "ALL_CLAUSES", disabled: false },  // Shows all clauses flat list
    { id: "report", label: "REPORT", disabled: analysisStatus !== "completed" },
    { id: "search", label: "SEARCH", disabled: false },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-primary uppercase tracking-[0.15em]">
            &gt;_ REGULATORY_COMPLIANCE_ANALYZER
          </h1>
          <p className="text-2xs text-text-muted mt-1">
            Analyze SOP documents against regulatory requirements
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
            <DocumentUploader
              onAnalysisStart={(jobId) => {
                setAnalysisJob(jobId);
                setAnalysisStatus("processing");
              }}
              onAnalysisComplete={() => {
                setAnalysisStatus("completed");
                setActiveTab("report");
              }}
              onAnalysisError={() => setAnalysisStatus("failed")}
            />
          )}

          {activeTab === "regulations" && <RegulationsViewer />}

          {activeTab === "clauses" && <ClauseViewer jobId={analysisJob} />}

          {activeTab === "report" && analysisJob && analysisStatus === "completed" && (
            <ComplianceReport jobId={analysisJob} />
          )}

          {activeTab === "search" && <SemanticSearch />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
