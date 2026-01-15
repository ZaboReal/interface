# Pydantic schemas for regulation task API
from pydantic import BaseModel
from typing import List, Dict, Optional, Any


class AnalysisRequest(BaseModel):
    """Request model for starting compliance analysis."""
    sop_data: Dict[str, Any]
    regulation_data: List[Dict[str, Any]] = []
    regulation_ids: List[str] = []  # Filter to specific regulation IDs (if using stored clauses)
    use_stored_clauses: bool = False  # If true, use clauses from database instead of extracting


class AnalysisResponse(BaseModel):
    """Response model for analysis job creation."""
    job_id: str
    status: str
    message: str


class ClauseResponse(BaseModel):
    """Response model for a single regulatory clause."""
    id: str
    text: str
    source_document: str
    category: str
    severity: str
    extraction_method: Optional[str] = None


class ComplianceItem(BaseModel):
    """A single compliance check result."""
    clause_id: str
    clause_text: str
    sop_section: str
    status: str
    explanation: str
    adjustments_needed: Optional[List[str]] = None
    confidence: float
    similarity_score: float
    category: Optional[str] = "general"
    severity: Optional[str] = "informational"


class ComplianceSummary(BaseModel):
    """Summary statistics for compliance analysis."""
    total_checks: int
    compliant_count: int
    non_compliant_count: int
    partial_count: int
    compliance_rate: float
    critical_issues: int
    by_category: Dict[str, Dict[str, int]]


class ComplianceReport(BaseModel):
    """Full compliance analysis report."""
    job_id: str
    summary: ComplianceSummary
    compliant_items: List[ComplianceItem]
    non_compliant_items: List[ComplianceItem]
    partial_items: List[ComplianceItem]
    recommendations: List[str]


class SearchQuery(BaseModel):
    """Request model for semantic search."""
    text: str
    limit: int = 10


class SearchResult(BaseModel):
    """Response model for semantic search result."""
    clause_id: str
    text: str
    source: str
    similarity: float


class DocumentUploadResponse(BaseModel):
    """Response model for document upload."""
    id: str
    filename: str
    sections: Optional[int] = None
    page_count: Optional[int] = None
    preview: Optional[str] = None
    parsed_data: Dict[str, Any]


class RegulationsUploadResponse(BaseModel):
    """Response model for multiple regulations upload."""
    uploaded: int
    documents: List[DocumentUploadResponse]


class JobStatus(BaseModel):
    """Response model for job status."""
    status: str
    progress: int
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
