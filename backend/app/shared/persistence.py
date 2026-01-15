# Persistence layer for Supabase storage of regulations, clauses, and jobs
from typing import List, Dict, Optional
import json
from datetime import datetime
from app.config import settings


class SupabasePersistence:
    """Handles persistent storage in Supabase for regulations, clauses, and analysis jobs."""

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
                print("Persistence: Connected to Supabase")
            except Exception as e:
                print(f"Persistence: Failed to connect to Supabase: {e}")
                self._client = None

        self._initialized = True
        return self._client is not None

    def is_configured(self) -> bool:
        """Check if persistence is available."""
        return self._lazy_init()

    # ==================== REGULATIONS ====================

    async def get_all_regulations(self) -> List[Dict]:
        """Get all stored regulations."""
        if not self._lazy_init():
            return []

        try:
            response = self._client.table("regulations").select("*").order("created_at", desc=True).execute()
            return response.data or []
        except Exception as e:
            print(f"Error fetching regulations: {e}")
            return []

    async def get_regulation_by_filename(self, filename: str) -> Optional[Dict]:
        """Get a regulation by filename."""
        if not self._lazy_init():
            return None

        try:
            response = self._client.table("regulations").select("*").eq("filename", filename).single().execute()
            return response.data
        except Exception as e:
            # Not found is expected sometimes
            return None

    async def save_regulation(self, regulation: Dict) -> Optional[str]:
        """Save a regulation document. Returns the regulation ID."""
        if not self._lazy_init():
            return None

        try:
            # Check if already exists
            existing = await self.get_regulation_by_filename(regulation["filename"])
            if existing:
                # Update existing
                self._client.table("regulations").update({
                    "page_count": regulation.get("page_count", 0),
                    "full_text": regulation.get("full_text", ""),
                    "parsed_data": regulation.get("parsed_data", {}),
                    "clause_count": regulation.get("clause_count", 0),
                    "updated_at": datetime.utcnow().isoformat(),
                }).eq("id", existing["id"]).execute()
                return existing["id"]
            else:
                # Insert new
                response = self._client.table("regulations").insert({
                    "filename": regulation["filename"],
                    "file_hash": regulation.get("file_hash"),
                    "page_count": regulation.get("page_count", 0),
                    "full_text": regulation.get("full_text", ""),
                    "parsed_data": regulation.get("parsed_data", {}),
                    "clause_count": regulation.get("clause_count", 0),
                }).execute()
                return response.data[0]["id"] if response.data else None
        except Exception as e:
            print(f"Error saving regulation: {e}")
            return None

    async def delete_regulation(self, regulation_id: str) -> bool:
        """Delete a regulation and its clauses."""
        if not self._lazy_init():
            return False

        try:
            self._client.table("regulations").delete().eq("id", regulation_id).execute()
            return True
        except Exception as e:
            print(f"Error deleting regulation: {e}")
            return False

    # ==================== CLAUSES ====================

    async def get_clauses_by_regulation(self, regulation_id: str) -> List[Dict]:
        """Get all clauses for a regulation, including the regulation filename."""
        if not self._lazy_init():
            return []

        try:
            response = self._client.table("clauses").select("*, regulations(filename)").eq("regulation_id", regulation_id).execute()
            # Add source_document from joined regulation
            clauses = response.data or []
            for clause in clauses:
                if clause.get("regulations"):
                    clause["source_document"] = clause["regulations"].get("filename", "Unknown")
            return clauses
        except Exception as e:
            print(f"Error fetching clauses: {e}")
            return []

    async def get_all_clauses(self) -> List[Dict]:
        """Get all stored clauses."""
        if not self._lazy_init():
            return []

        try:
            response = self._client.table("clauses").select("*, regulations(filename)").execute()
            return response.data or []
        except Exception as e:
            print(f"Error fetching all clauses: {e}")
            return []

    async def save_clauses(self, regulation_id: str, clauses: List[Dict]) -> bool:
        """Save clauses for a regulation."""
        if not self._lazy_init():
            return False

        try:
            # Delete existing clauses for this regulation
            self._client.table("clauses").delete().eq("regulation_id", regulation_id).execute()

            # Insert new clauses
            records = []
            for clause in clauses:
                records.append({
                    "id": clause["id"],
                    "regulation_id": regulation_id,
                    "text": clause["text"],
                    "category": clause.get("category", "general"),
                    "severity": clause.get("severity", "informational"),
                    "extraction_method": clause.get("extraction_method", "llm"),
                    "metadata": {
                        "type": clause.get("type"),
                        "actions": clause.get("actions", []),
                        "page_range": clause.get("page_range"),
                        "reference": clause.get("reference"),
                    },
                })

            if records:
                self._client.table("clauses").insert(records).execute()

            # Update clause count on regulation
            self._client.table("regulations").update({
                "clause_count": len(clauses),
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", regulation_id).execute()

            return True
        except Exception as e:
            print(f"Error saving clauses: {e}")
            return False

    # ==================== ANALYSIS JOBS ====================

    async def get_job(self, job_id: str) -> Optional[Dict]:
        """Get an analysis job by ID."""
        if not self._lazy_init():
            return None

        try:
            response = self._client.table("analysis_jobs").select("*").eq("job_id", job_id).single().execute()
            return response.data
        except Exception as e:
            return None

    async def get_recent_jobs(self, limit: int = 10) -> List[Dict]:
        """Get recent analysis jobs."""
        if not self._lazy_init():
            return []

        try:
            response = self._client.table("analysis_jobs").select("*").order("created_at", desc=True).limit(limit).execute()
            return response.data or []
        except Exception as e:
            print(f"Error fetching jobs: {e}")
            return []

    async def create_job(self, job_id: str, sop_filename: str = None, regulation_ids: List[str] = None) -> bool:
        """Create a new analysis job."""
        if not self._lazy_init():
            return False

        try:
            self._client.table("analysis_jobs").insert({
                "job_id": job_id,
                "status": "pending",
                "progress": 0,
                "sop_filename": sop_filename,
                "regulation_ids": regulation_ids or [],
            }).execute()
            return True
        except Exception as e:
            print(f"Error creating job: {e}")
            return False

    async def update_job(self, job_id: str, updates: Dict) -> bool:
        """Update an analysis job."""
        if not self._lazy_init():
            return False

        try:
            updates["updated_at"] = datetime.utcnow().isoformat()
            self._client.table("analysis_jobs").update(updates).eq("job_id", job_id).execute()
            return True
        except Exception as e:
            print(f"Error updating job: {e}")
            return False


# Singleton instance
persistence = SupabasePersistence()
