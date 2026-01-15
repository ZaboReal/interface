"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/regulation`;

interface Props {
  jobId: string;
}

interface SOPEvidence {
  text: string;
  section: string;
  score: number;
}

interface ComplianceItem {
  clause_id: string;
  clause_text: string;
  status: string;
  explanation: string;
  category?: string;
  severity?: string;
  evidence_quality?: number;
  sop_evidence?: SOPEvidence[];
  missing_actions?: string[];
  patch_suggestion?: string | null;
  // Legacy fields for backwards compatibility
  sop_section?: string;
  adjustments_needed?: string[];
  confidence?: number;
  similarity_score?: number;
}

interface Report {
  job_id: string;
  summary: {
    total_clauses: number;
    compliant_count: number;
    partial_count: number;
    non_compliant_count: number;
    not_addressed_count: number;
    compliance_rate: number;
    coverage_rate: number;
    critical_gaps: number;
    by_category: Record<string, Record<string, number>>;
    by_severity: Record<string, Record<string, number>>;
  };
  compliant_items: ComplianceItem[];
  partial_items: ComplianceItem[];
  non_compliant_items: ComplianceItem[];
  not_addressed_items: ComplianceItem[];
  recommendations: string[];
}

export function ComplianceReport({ jobId }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>("not_addressed");

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch(`${API_BASE}/report/${jobId}`);
        const data = await res.json();
        setReport(data);
      } catch (error) {
        console.error("Failed to fetch report:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [jobId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-text-muted"
          >
            GENERATING_REPORT...
          </motion.span>
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-status-error">
          Failed to load report
        </CardContent>
      </Card>
    );
  }

  const { summary } = report;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <div
                className={cn(
                  "text-3xl font-bold",
                  summary.compliance_rate >= 70
                    ? "text-status-success"
                    : summary.compliance_rate >= 40
                    ? "text-status-warning"
                    : "text-status-error"
                )}
              >
                {summary.compliance_rate}%
              </div>
              <div className="text-2xs text-text-muted uppercase mt-1">
                Compliance
              </div>
            </div>
            <Progress
              value={summary.compliance_rate}
              max={100}
              className="mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-status-success">
              {summary.compliant_count}
            </div>
            <div className="text-2xs text-text-muted uppercase mt-1">
              Compliant
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-status-warning">
              {summary.partial_count}
            </div>
            <div className="text-2xs text-text-muted uppercase mt-1">
              Partial
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-status-error">
              {summary.non_compliant_count}
            </div>
            <div className="text-2xs text-text-muted uppercase mt-1">
              Conflicts
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-bold text-text-muted">
              {summary.not_addressed_count}
            </div>
            <div className="text-2xs text-text-muted uppercase mt-1">
              Not Addressed
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coverage vs Compliance */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-2xs text-text-muted uppercase">Coverage Rate</span>
                <span className="text-sm font-bold">{summary.coverage_rate}%</span>
              </div>
              <Progress value={summary.coverage_rate} max={100} />
              <p className="text-2xs text-text-muted mt-1">
                {summary.total_clauses - summary.not_addressed_count} of {summary.total_clauses} requirements addressed in SOP
              </p>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-2xs text-text-muted uppercase">Critical Gaps</span>
                <span className={cn(
                  "text-sm font-bold",
                  summary.critical_gaps > 0 ? "text-status-error" : "text-status-success"
                )}>
                  {summary.critical_gaps}
                </span>
              </div>
              <p className="text-2xs text-text-muted mt-1">
                {summary.critical_gaps > 0
                  ? `${summary.critical_gaps} critical requirements missing or conflicting`
                  : "No critical gaps found"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>&#9888; RECOMMENDATIONS</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.recommendations.map((rec, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="text-status-warning">&#9679;</span>
                  <span className="text-text-secondary">{rec}</span>
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown */}
      {Object.keys(summary.by_category).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>COMPLIANCE_BY_CATEGORY</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(summary.by_category).map(([category, counts]) => {
                const total =
                  (counts.compliant || 0) + (counts.non_compliant || 0) + (counts.partial || 0) + (counts.not_addressed || 0);
                const rate =
                  total > 0
                    ? ((counts.compliant || 0) / total) * 100
                    : 0;

                return (
                  <div
                    key={category}
                    className="p-3 border border-border rounded-sm"
                  >
                    <div className="text-xs font-medium text-primary uppercase mb-2">
                      {category}
                    </div>
                    <Progress value={rate} max={100} className="mb-2" />
                    <div className="flex justify-between text-2xs text-text-muted">
                      <span className="text-status-success">
                        {counts.compliant || 0}&#10003;
                      </span>
                      <span className="text-status-warning">
                        {counts.partial || 0}~
                      </span>
                      <span className="text-status-error">
                        {counts.non_compliant || 0}&#10007;
                      </span>
                      <span className="text-text-muted">
                        {counts.not_addressed || 0}?
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not Addressed Items - Show first as highest priority */}
      {report.not_addressed_items && report.not_addressed_items.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() =>
              setExpandedSection(
                expandedSection === "not_addressed" ? null : "not_addressed"
              )
            }
          >
            <CardTitle className="flex items-center justify-between text-text-muted">
              <span>
                &#9744; NOT_ADDRESSED ({report.not_addressed_items.length})
              </span>
              <span className="text-lg">
                {expandedSection === "not_addressed" ? "▲" : "▼"}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "not_addressed" && (
            <CardContent className="p-0 divide-y divide-border max-h-[500px] overflow-y-auto">
              {report.not_addressed_items.map((item, i) => (
                <ComplianceItemCard key={i} item={item} status="not_addressed" />
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Non-Compliant Items */}
      {report.non_compliant_items.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() =>
              setExpandedSection(
                expandedSection === "non_compliant" ? null : "non_compliant"
              )
            }
          >
            <CardTitle className="flex items-center justify-between text-status-error">
              <span>
                &#10007; CONFLICTS ({report.non_compliant_items.length})
              </span>
              <span className="text-lg">
                {expandedSection === "non_compliant" ? "▲" : "▼"}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "non_compliant" && (
            <CardContent className="p-0 divide-y divide-border max-h-[500px] overflow-y-auto">
              {report.non_compliant_items.map((item, i) => (
                <ComplianceItemCard key={i} item={item} status="non_compliant" />
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Partial Items */}
      {report.partial_items.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() =>
              setExpandedSection(
                expandedSection === "partial" ? null : "partial"
              )
            }
          >
            <CardTitle className="flex items-center justify-between text-status-warning">
              <span>~ PARTIAL ({report.partial_items.length})</span>
              <span className="text-lg">
                {expandedSection === "partial" ? "▲" : "▼"}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "partial" && (
            <CardContent className="p-0 divide-y divide-border max-h-[500px] overflow-y-auto">
              {report.partial_items.map((item, i) => (
                <ComplianceItemCard key={i} item={item} status="partial" />
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Compliant Items */}
      {report.compliant_items.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() =>
              setExpandedSection(
                expandedSection === "compliant" ? null : "compliant"
              )
            }
          >
            <CardTitle className="flex items-center justify-between text-status-success">
              <span>&#10003; COMPLIANT ({report.compliant_items.length})</span>
              <span className="text-lg">
                {expandedSection === "compliant" ? "▲" : "▼"}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedSection === "compliant" && (
            <CardContent className="p-0 divide-y divide-border max-h-[500px] overflow-y-auto">
              {report.compliant_items.map((item, i) => (
                <ComplianceItemCard key={i} item={item} status="compliant" />
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Export */}
      <Card>
        <CardContent className="py-4 flex justify-end">
          <Button variant="outline" size="sm">
            &#8681; EXPORT_REPORT
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function EvidenceText({ text, maxLength = 200 }: { text: string; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > maxLength;

  if (!needsTruncation) {
    return <span>{text}</span>;
  }

  return (
    <span>
      {expanded ? text : `${text.slice(0, maxLength)}...`}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="ml-1 text-primary hover:text-primary/80 underline"
      >
        {expanded ? "[collapse]" : "[show full]"}
      </button>
    </span>
  );
}

function ComplianceItemCard({
  item,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  status,
}: {
  item: ComplianceItem;
  status: string;
}) {
  const severityColors: Record<string, string> = {
    critical: "bg-status-error/20 text-status-error border-status-error",
    important: "bg-status-warning/20 text-status-warning border-status-warning",
    advisory: "bg-primary/20 text-primary border-primary",
  };

  return (
    <div className="p-4 hover:bg-primary/5 transition-colors">
      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-2xs">
            {item.clause_id}
          </Badge>
          {item.category && (
            <Badge variant="outline" className="text-2xs">
              {item.category}
            </Badge>
          )}
          {item.severity && (
            <Badge
              variant="outline"
              className={cn("text-2xs border", severityColors[item.severity] || "")}
            >
              {item.severity.toUpperCase()}
            </Badge>
          )}
        </div>
        {item.evidence_quality !== undefined && (
          <span className="text-2xs text-text-muted">
            Evidence: {Math.round(item.evidence_quality * 100)}%
          </span>
        )}
      </div>

      <p className="text-sm text-text-secondary mb-2">{item.clause_text}</p>

      <div className="text-2xs text-text-muted mb-2">
        <strong className="text-primary">Analysis:</strong> {item.explanation}
      </div>

      {/* SOP Evidence */}
      {item.sop_evidence && item.sop_evidence.length > 0 && (
        <div className="mt-2 p-2 bg-background border border-border rounded-sm">
          <strong className="text-2xs text-primary uppercase">
            SOP Evidence:
          </strong>
          <ul className="mt-1 space-y-2">
            {item.sop_evidence.map((ev, j) => (
              <li key={j} className="text-2xs text-text-secondary">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-text-muted font-medium">[{ev.section}]</span>
                  <span className="text-text-muted">({Math.round(ev.score * 100)}% match)</span>
                </div>
                <div className="pl-2 border-l-2 border-primary/30">
                  <EvidenceText text={ev.text} maxLength={300} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing Actions */}
      {item.missing_actions && item.missing_actions.length > 0 && (
        <div className="mt-2 p-2 bg-status-warning/10 border border-status-warning/30 rounded-sm">
          <strong className="text-2xs text-status-warning uppercase">
            Missing Actions:
          </strong>
          <ul className="list-disc list-inside text-2xs text-text-secondary mt-1">
            {item.missing_actions.map((action, j) => (
              <li key={j}>{action}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Patch Suggestion */}
      {item.patch_suggestion && (
        <div className="mt-2 p-2 bg-primary/10 border border-primary/30 rounded-sm">
          <strong className="text-2xs text-primary uppercase">
            Suggested Addition to SOP:
          </strong>
          <p className="text-2xs text-text-secondary mt-1 font-mono">
            {item.patch_suggestion}
          </p>
        </div>
      )}

      {/* Legacy: adjustments_needed fallback */}
      {!item.missing_actions && item.adjustments_needed && item.adjustments_needed.length > 0 && (
        <div className="mt-2 p-2 bg-status-warning/10 border border-status-warning/30 rounded-sm">
          <strong className="text-2xs text-status-warning uppercase">
            Required Adjustments:
          </strong>
          <ul className="list-disc list-inside text-2xs text-text-secondary mt-1">
            {item.adjustments_needed.map((adj, j) => (
              <li key={j}>{adj}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
