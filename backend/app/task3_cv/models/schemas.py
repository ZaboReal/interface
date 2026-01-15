# Pydantic schemas for Task 3 P&ID Analysis
from pydantic import BaseModel
from typing import List, Dict, Optional, Tuple
from datetime import datetime


class AnalysisResponse(BaseModel):
    """Response for starting P&ID analysis."""
    job_id: str
    status: str
    message: Optional[str] = None


class JobStatus(BaseModel):
    """Job status response."""
    job_id: str
    status: str
    progress: int
    pid_filename: Optional[str] = None
    sop_filename: Optional[str] = None
    error: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class ComponentInfo(BaseModel):
    """Detected component information."""
    id: Optional[str] = None
    type: str
    bbox: List[int]  # [x, y, width, height]
    center: List[int]  # [x, y]
    confidence: float
    label: Optional[str] = None
    tag: Optional[str] = None
    detection_method: Optional[str] = None


class EdgeInfo(BaseModel):
    """Graph edge information."""
    source: str
    target: str
    type: str
    line_type: Optional[str] = None
    length: Optional[float] = None


class GraphStats(BaseModel):
    """Graph statistics."""
    node_count: int
    edge_count: int
    components: Dict[str, int]


class GraphData(BaseModel):
    """Full graph data response."""
    nodes: List[Dict]
    edges: List[Dict]
    stats: GraphStats


class DiscrepancyItem(BaseModel):
    """Single discrepancy item."""
    tag: Optional[str] = None
    type: Optional[str] = None
    issue: Optional[str] = None
    source: Optional[str] = None
    target: Optional[str] = None
    sop_section: Optional[str] = None
    context: Optional[str] = None
    severity: Optional[str] = None


class DiscrepancySummary(BaseModel):
    """Discrepancy summary statistics."""
    total_sop_components: int
    total_pid_components: int
    matched: int
    missing_in_pid: int
    missing_in_sop: int
    type_mismatches: int
    connection_issues: int
    match_rate: float


class DiscrepancyReport(BaseModel):
    """Full discrepancy report."""
    matches: List[Dict]
    missing_in_pid: List[Dict]
    missing_in_sop: List[Dict]
    type_mismatches: List[Dict]
    connection_issues: List[Dict]
    summary: DiscrepancySummary


class SOPComponent(BaseModel):
    """SOP component reference."""
    tag: str
    type: Optional[str] = None
    section_title: Optional[str] = None
    context: Optional[str] = None
