# P&ID Repository - Supabase operations for Task 3
from typing import List, Dict, Optional
import json
from datetime import datetime
from app.config import settings


class PIDRepository:
    """Repository for P&ID data operations with Supabase."""

    def __init__(self):
        self._client = None
        self._initialized = False

    def _lazy_init(self):
        """Lazy initialization of Supabase client."""
        if self._initialized:
            return self._client is not None

        if (settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY and
            settings.SUPABASE_URL != "your-supabase-url-here" and
            settings.SUPABASE_SECRET_KEY != "your-sb-secret-key-here"):
            try:
                from supabase import create_client
                self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
                print("[PIDRepository] Connected to Supabase")
            except Exception as e:
                print(f"[PIDRepository] Failed to connect to Supabase: {e}")
                self._client = None

        self._initialized = True
        return self._client is not None

    def is_configured(self) -> bool:
        """Check if persistence is available."""
        return self._lazy_init()

    # ==================== JOBS ====================

    async def create_job(
        self,
        pid_filename: Optional[str] = None,
        sop_filename: Optional[str] = None,
    ) -> Optional[Dict]:
        """Create a new P&ID analysis job."""
        if not self._lazy_init():
            return None

        try:
            result = self._client.table("pid_jobs").insert({
                "status": "pending",
                "progress": 0,
                "pid_filename": pid_filename,
                "sop_filename": sop_filename,
            }).execute()

            return result.data[0] if result.data else None
        except Exception as e:
            print(f"[PIDRepository] Error creating job: {e}")
            return None

    async def update_job_status(
        self,
        job_id: str,
        status: str,
        progress: int = None,
        error_message: str = None,
    ) -> Optional[Dict]:
        """Update job status and progress."""
        if not self._lazy_init():
            return None

        try:
            update_data = {"status": status, "updated_at": datetime.utcnow().isoformat()}
            if progress is not None:
                update_data["progress"] = progress
            if error_message:
                update_data["error_message"] = error_message
            if status == "completed":
                update_data["completed_at"] = datetime.utcnow().isoformat()

            result = self._client.table("pid_jobs").update(
                update_data
            ).eq("id", job_id).execute()

            return result.data[0] if result.data else None
        except Exception as e:
            print(f"[PIDRepository] Error updating job: {e}")
            return None

    async def get_job(self, job_id: str) -> Optional[Dict]:
        """Get job by ID."""
        if not self._lazy_init():
            return None

        try:
            result = self._client.table("pid_jobs").select("*").eq(
                "id", job_id
            ).single().execute()

            return result.data
        except Exception as e:
            return None

    async def get_recent_jobs(self, limit: int = 50) -> List[Dict]:
        """Get recent jobs."""
        if not self._lazy_init():
            return []

        try:
            result = self._client.table("pid_jobs").select("*").order(
                "created_at", desc=True
            ).limit(limit).execute()

            return result.data or []
        except Exception as e:
            print(f"[PIDRepository] Error fetching jobs: {e}")
            return []

    # ==================== COMPONENTS ====================

    async def create_components(
        self,
        job_id: str,
        components: List[Dict],
        page_number: int = 1
    ) -> List[Dict]:
        """Create multiple detected components."""
        if not self._lazy_init():
            return []

        try:
            records = []
            for comp in components:
                bbox = comp.get("bbox", (0, 0, 0, 0))
                center = comp.get("center", (0, 0))

                records.append({
                    "job_id": job_id,
                    "component_type": comp.get("type", "unknown"),
                    "tag": comp.get("tag"),
                    "label": comp.get("label"),
                    "confidence": comp.get("confidence", 0.0),
                    "bbox_x": bbox[0],
                    "bbox_y": bbox[1],
                    "bbox_width": bbox[2],
                    "bbox_height": bbox[3],
                    "center_x": center[0],
                    "center_y": center[1],
                    "detection_method": comp.get("detection_method", "yolo"),
                    "page_number": page_number,
                    "attributes": comp.get("attributes", {}),
                })

            if records:
                result = self._client.table("pid_components").insert(records).execute()
                return result.data or []
            return []
        except Exception as e:
            print(f"[PIDRepository] Error creating components: {e}")
            return []

    async def get_components(
        self,
        job_id: str,
        component_type: Optional[str] = None
    ) -> List[Dict]:
        """Get components for a job with optional type filter."""
        if not self._lazy_init():
            return []

        try:
            query = self._client.table("pid_components").select("*").eq("job_id", job_id)

            if component_type:
                query = query.eq("component_type", component_type)

            result = query.execute()
            return result.data or []
        except Exception as e:
            print(f"[PIDRepository] Error fetching components: {e}")
            return []

    # ==================== EDGES ====================

    async def create_edges(
        self,
        job_id: str,
        edges: List[Dict],
        component_id_map: Dict[str, str]  # Maps node_id -> component UUID
    ) -> List[Dict]:
        """Create graph edges."""
        if not self._lazy_init():
            return []

        try:
            records = []
            for edge in edges:
                source_id = component_id_map.get(edge["source"])
                target_id = component_id_map.get(edge["target"])

                if source_id and target_id:
                    records.append({
                        "job_id": job_id,
                        "source_component_id": source_id,
                        "target_component_id": target_id,
                        "edge_type": edge.get("type", "pipe"),
                        "line_type": edge.get("line_type"),
                        "length": edge.get("length"),
                        "attributes": edge.get("attributes", {}),
                    })

            if records:
                result = self._client.table("pid_edges").insert(records).execute()
                return result.data or []
            return []
        except Exception as e:
            print(f"[PIDRepository] Error creating edges: {e}")
            return []

    async def get_edges(self, job_id: str) -> List[Dict]:
        """Get edges for a job."""
        if not self._lazy_init():
            return []

        try:
            result = self._client.table("pid_edges").select(
                "*, source:source_component_id(id, tag, component_type), target:target_component_id(id, tag, component_type)"
            ).eq("job_id", job_id).execute()

            return result.data or []
        except Exception as e:
            print(f"[PIDRepository] Error fetching edges: {e}")
            return []

    # ==================== GRAPH ====================

    async def save_graph(
        self,
        job_id: str,
        graph_data: Dict,
    ) -> Optional[Dict]:
        """Save graph summary."""
        if not self._lazy_init():
            return None

        try:
            stats = graph_data.get("stats", {})

            result = self._client.table("pid_graphs").upsert({
                "job_id": job_id,
                "node_count": stats.get("node_count", 0),
                "edge_count": stats.get("edge_count", 0),
                "component_counts": stats.get("components", {}),
                "graph_data": graph_data,
            }, on_conflict="job_id").execute()

            return result.data[0] if result.data else None
        except Exception as e:
            print(f"[PIDRepository] Error saving graph: {e}")
            return None

    async def get_graph(self, job_id: str) -> Optional[Dict]:
        """Get graph data for a job."""
        if not self._lazy_init():
            return None

        try:
            result = self._client.table("pid_graphs").select("*").eq(
                "job_id", job_id
            ).single().execute()

            return result.data
        except Exception as e:
            return None

    # ==================== SOP COMPONENTS ====================

    async def create_sop_components(
        self,
        job_id: str,
        sop_components: List[Dict]
    ) -> List[Dict]:
        """Create SOP component references."""
        if not self._lazy_init():
            return []

        try:
            records = []
            for comp in sop_components:
                records.append({
                    "job_id": job_id,
                    "tag": comp.get("tag", ""),
                    "component_type": comp.get("type"),
                    "description": comp.get("description"),
                    "pressure": comp.get("pressure"),
                    "temperature": comp.get("temperature"),
                    "section_title": comp.get("section_title"),
                    "context": comp.get("context"),
                })

            if records:
                result = self._client.table("pid_sop_components").insert(records).execute()
                return result.data or []
            return []
        except Exception as e:
            print(f"[PIDRepository] Error creating SOP components: {e}")
            return []

    async def get_sop_components(self, job_id: str) -> List[Dict]:
        """Get SOP components for a job."""
        if not self._lazy_init():
            return []

        try:
            result = self._client.table("pid_sop_components").select("*").eq(
                "job_id", job_id
            ).execute()

            return result.data or []
        except Exception as e:
            print(f"[PIDRepository] Error fetching SOP components: {e}")
            return []

    # ==================== DISCREPANCIES ====================

    async def save_discrepancies(
        self,
        job_id: str,
        discrepancies: Dict,
        component_id_map: Dict[str, str] = None
    ) -> Dict:
        """Save discrepancy report with full comparison data."""
        if not self._lazy_init():
            return {}

        try:
            # Save the full discrepancy data as JSON (preserves all comparison details)
            summary = discrepancies.get("summary", {})
            self._client.table("pid_discrepancy_summaries").upsert({
                "job_id": job_id,
                "total_sop_components": summary.get("total_components_compared", 0),
                "total_pid_components": summary.get("total_components_compared", 0),
                "matched_count": summary.get("matches", 0),
                "missing_in_pid_count": summary.get("missing_in_pid", 0),
                "missing_in_sop_count": summary.get("missing_in_sop", 0),
                "type_mismatch_count": summary.get("pressure_discrepancies", 0) + summary.get("temperature_discrepancies", 0),
                "connection_issue_count": 0,
                "match_rate": summary.get("match_rate", 0.0),
                # Store full comparison data as JSON
                "full_data": discrepancies,
            }, on_conflict="job_id").execute()

            return summary
        except Exception as e:
            print(f"[PIDRepository] Error saving discrepancies: {e}")
            return {}

    async def get_discrepancies(self, job_id: str) -> Dict:
        """Get discrepancies for a job."""
        if not self._lazy_init():
            return {}

        try:
            # Get summary with full data
            summary_result = self._client.table("pid_discrepancy_summaries").select("*").eq(
                "job_id", job_id
            ).single().execute()

            if not summary_result.data:
                return {}

            # Return full_data if available (new format with all comparison details)
            full_data = summary_result.data.get("full_data")
            if full_data:
                return full_data

            # Fallback to legacy format if full_data not present
            summary = summary_result.data
            return {
                "matches": [],
                "missing_in_pid": [],
                "missing_in_sop": [],
                "pressure_discrepancies": [],
                "temperature_discrepancies": [],
                "summary": {
                    "total_components_compared": summary.get("total_sop_components", 0),
                    "matches": summary.get("matched_count", 0),
                    "missing_in_pid": summary.get("missing_in_pid_count", 0),
                    "missing_in_sop": summary.get("missing_in_sop_count", 0),
                    "match_rate": summary.get("match_rate", 0),
                }
            }
        except Exception as e:
            print(f"[PIDRepository] Error fetching discrepancies: {e}")
            return {}


# Singleton instance
pid_repository = PIDRepository()
