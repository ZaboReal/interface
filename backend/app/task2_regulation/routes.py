# API routes for regulation task
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from typing import List, Optional
from pathlib import Path
import shutil
import uuid
import os
import hashlib

from .services.pdf_parser import document_parser
from .services.clause_extractor import clause_extractor
from .services.sop_analyzer import sop_analyzer
from .models.schemas import (
    AnalysisRequest,
    AnalysisResponse,
    ClauseResponse,
    ComplianceReport,
    ComplianceSummary,
    ComplianceItem,
    SearchQuery,
    SearchResult,
    JobStatus,
)
from app.shared.persistence import persistence

router = APIRouter()

# In-memory fallback storage (used when Supabase is not configured)
analysis_jobs = {}
clauses_store = {}

# In-memory log storage per job
job_logs: dict[str, list[str]] = {}


def add_log(job_id: str, message: str):
    """Add a log message for a job."""
    if job_id not in job_logs:
        job_logs[job_id] = []
    # Keep last 200 logs per job
    if len(job_logs[job_id]) >= 200:
        job_logs[job_id] = job_logs[job_id][-100:]
    job_logs[job_id].append(message)
    print(message)  # Also print to console


@router.post("/upload/sop")
async def upload_sop(file: UploadFile = File(...)):
    """Upload and parse SOP document."""
    # Validate file type
    if not file.filename.lower().endswith(('.pdf', '.docx')):
        raise HTTPException(400, "Only PDF and DOCX files supported")

    # Save file temporarily
    file_id = str(uuid.uuid4())
    extension = Path(file.filename).suffix
    temp_path = Path(f"/tmp/sop_{file_id}{extension}")

    try:
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Parse document (use async for Unstructured.io)
        parsed = await document_parser.parse_async(str(temp_path))

        return {
            "id": file_id,
            "filename": file.filename,
            "sections": len(parsed.get("sections", [])),
            "preview": parsed.get("full_text", "")[:500] + "...",
            "parsed_data": parsed,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to parse document: {str(e)}")
    finally:
        if temp_path.exists():
            temp_path.unlink()


@router.post("/upload/regulations")
async def upload_regulations(files: List[UploadFile] = File(...)):
    """Upload and parse regulation documents."""
    results = []

    for file in files:
        if not file.filename.lower().endswith('.pdf'):
            continue

        file_id = str(uuid.uuid4())
        temp_path = Path(f"/tmp/reg_{file_id}.pdf")

        try:
            with open(temp_path, "wb") as f:
                content = await file.read()
                f.write(content)

            # Calculate file hash
            file_hash = hashlib.md5(content).hexdigest()

            # Use async parser for Unstructured.io
            parsed = await document_parser.parse_async(str(temp_path))
            results.append({
                "id": file_id,
                "filename": file.filename,
                "file_hash": file_hash,
                "page_count": parsed.get("page_count", 0),
                "parsed_data": parsed,
            })
        except Exception as e:
            print(f"Failed to parse {file.filename}: {e}")
        finally:
            if temp_path.exists():
                temp_path.unlink()

    return {"uploaded": len(results), "documents": results}


@router.get("/regulations/preloaded")
async def get_preloaded_regulations():
    """Get list of preloaded regulation documents."""
    from app.config import settings

    regulations_dir = Path(settings.REGULATIONS_DIR)
    if not regulations_dir.exists():
        # Try relative to backend directory
        regulations_dir = Path(__file__).parent.parent.parent.parent / "data" / "regulations"

    if not regulations_dir.exists():
        return {"regulations": [], "message": "No regulations directory found"}

    regulations = []
    for pdf_file in regulations_dir.glob("*.pdf"):
        regulations.append({
            "filename": pdf_file.name,
            "path": str(pdf_file),
            "size": pdf_file.stat().st_size,
        })

    return {"regulations": regulations}


@router.post("/regulations/load-preloaded")
async def load_preloaded_regulations():
    """Load and parse all preloaded regulation documents."""
    from app.config import settings

    regulations_dir = Path(settings.REGULATIONS_DIR)
    if not regulations_dir.exists():
        regulations_dir = Path(__file__).parent.parent.parent.parent / "data" / "regulations"

    if not regulations_dir.exists():
        raise HTTPException(404, "Regulations directory not found")

    results = []
    for pdf_file in regulations_dir.glob("*.pdf"):
        try:
            # Use async parser for Unstructured.io
            parsed = await document_parser.parse_async(str(pdf_file))

            # Calculate file hash
            with open(pdf_file, "rb") as f:
                file_hash = hashlib.md5(f.read()).hexdigest()

            results.append({
                "id": str(uuid.uuid4()),
                "filename": pdf_file.name,
                "file_hash": file_hash,
                "page_count": parsed.get("page_count", 0),
                "parsed_data": parsed,
            })
        except Exception as e:
            print(f"Failed to parse {pdf_file.name}: {e}")

    return {"uploaded": len(results), "documents": results}


@router.get("/sop/preloaded")
async def get_preloaded_sop():
    """Load and parse preloaded SOP document."""
    from app.config import settings

    sop_dir = Path(settings.SOP_DIR)
    if not sop_dir.exists():
        sop_dir = Path(__file__).parent.parent.parent.parent / "data" / "sop"

    if not sop_dir.exists():
        raise HTTPException(404, "SOP directory not found")

    # Look for SOP file
    sop_file = sop_dir / "original.docx"
    if not sop_file.exists():
        # Try any docx file
        docx_files = list(sop_dir.glob("*.docx"))
        if docx_files:
            sop_file = docx_files[0]
        else:
            raise HTTPException(404, "No SOP document found")

    try:
        # Use async parser for Unstructured.io
        parsed = await document_parser.parse_async(str(sop_file))
        return {
            "id": str(uuid.uuid4()),
            "filename": sop_file.name,
            "sections": len(parsed.get("sections", [])),
            "preview": parsed.get("full_text", "")[:500] + "...",
            "parsed_data": parsed,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to parse SOP: {str(e)}")


# ==================== STORED REGULATIONS ====================

@router.get("/regulations/stored")
async def get_stored_regulations():
    """Get all regulations stored in the database."""
    regulations = await persistence.get_all_regulations()
    return {
        "count": len(regulations),
        "regulations": regulations,
    }


@router.post("/regulations/ingest")
async def ingest_regulation(regulation_data: dict):
    """Ingest a regulation and extract its clauses, storing permanently."""
    from app.shared.vector_db import vector_store

    filename = regulation_data.get("filename")
    parsed_data = regulation_data.get("parsed_data", {})

    if not filename:
        raise HTTPException(400, "Filename is required")

    print(f"\n[INGEST] Processing regulation: {filename}")

    # Save regulation to database
    regulation_id = await persistence.save_regulation({
        "filename": filename,
        "file_hash": regulation_data.get("file_hash"),
        "page_count": parsed_data.get("page_count", 0),
        "full_text": parsed_data.get("full_text", ""),
        "parsed_data": parsed_data,
    })

    if not regulation_id:
        # Fallback: return without persistence
        print(f"[INGEST] Warning: Could not persist to database, continuing without storage")
        clauses = await clause_extractor.extract_clauses(parsed_data, filename)
        return {
            "regulation_id": None,
            "filename": filename,
            "clause_count": len(clauses),
            "clauses": clauses,
            "persisted": False,
            "indexed": False,
        }

    # Extract clauses
    print(f"[INGEST] Extracting clauses...")
    clauses = await clause_extractor.extract_clauses(parsed_data, filename)
    print(f"[INGEST] Extracted {len(clauses)} clauses")

    # Save clauses to database
    await persistence.save_clauses(regulation_id, clauses)
    print(f"[INGEST] Saved clauses to database")

    # Index clauses in vector store for semantic search
    print(f"[INGEST] Indexing clauses in vector store...")
    if clauses:
        documents = [clause["text"] for clause in clauses]
        metadatas = [
            {
                "id": clause["id"],
                "source": filename,
                "category": clause.get("category", "general"),
                "severity": clause.get("severity", "informational"),
                "regulation_id": regulation_id,
            }
            for clause in clauses
        ]
        ids = [clause["id"] for clause in clauses]

        await vector_store.add_documents(
            collection_name="regulation_clauses",
            documents=documents,
            metadatas=metadatas,
            ids=ids,
        )
        print(f"[INGEST] Indexed {len(clauses)} clauses in vector store")

    return {
        "regulation_id": regulation_id,
        "filename": filename,
        "clause_count": len(clauses),
        "clauses": clauses,
        "persisted": True,
        "indexed": True,
    }


@router.delete("/regulations/stored/{regulation_id}")
async def delete_stored_regulation(regulation_id: str):
    """Delete a stored regulation, its clauses, and vector embeddings."""
    from app.shared.vector_db import vector_store

    # Get clauses first to know which vectors to delete
    clauses = await persistence.get_clauses_by_regulation(regulation_id)
    clause_ids = [c["id"] for c in clauses]

    # Delete from database
    success = await persistence.delete_regulation(regulation_id)
    if not success:
        raise HTTPException(404, "Regulation not found or could not be deleted")

    # Note: Vector store doesn't have a delete by ID, so we'd need to rebuild
    # For now, vectors will be orphaned but won't affect results much
    print(f"[DELETE] Removed regulation {regulation_id} and {len(clause_ids)} clauses")

    return {"deleted": True, "regulation_id": regulation_id, "clauses_removed": len(clause_ids)}


@router.get("/regulations/stored/{regulation_id}/clauses")
async def get_regulation_clauses(regulation_id: str):
    """Get all clauses for a stored regulation."""
    clauses = await persistence.get_clauses_by_regulation(regulation_id)
    return {"count": len(clauses), "clauses": clauses}


@router.get("/clauses/all")
async def get_all_stored_clauses():
    """Get all stored clauses across all regulations."""
    clauses = await persistence.get_all_clauses()
    return {"count": len(clauses), "clauses": clauses}


# ==================== ANALYSIS ====================

@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_compliance(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks,
):
    """Start compliance analysis job."""
    job_id = str(uuid.uuid4())

    # Store in memory (always, for fast access)
    analysis_jobs[job_id] = {
        "status": "processing",
        "progress": 0,
        "results": None,
    }

    # Also persist to database
    sop_filename = request.sop_data.get("filename") if request.sop_data else None
    await persistence.create_job(job_id, sop_filename=sop_filename)

    # Run analysis in background
    background_tasks.add_task(
        run_analysis,
        job_id,
        request.sop_data,
        request.regulation_data,
        request.use_stored_clauses,
        request.regulation_ids,
    )

    return AnalysisResponse(
        job_id=job_id,
        status="processing",
        message="Analysis started. Poll /analyze/{job_id} for results.",
    )


async def run_analysis(
    job_id: str,
    sop_data: dict,
    regulation_data: List[dict],
    use_stored_clauses: bool = False,
    regulation_ids: List[str] = None,
):
    """Background task to run compliance analysis."""
    try:
        all_clauses = []

        add_log(job_id, "=" * 50)
        add_log(job_id, "Starting compliance analysis...")
        add_log(job_id, "=" * 50)

        if use_stored_clauses:
            # Use clauses already stored in database
            add_log(job_id, "Loading clauses from database...")

            # If specific regulation IDs provided, filter to those
            if regulation_ids and len(regulation_ids) > 0:
                add_log(job_id, f"Filtering to {len(regulation_ids)} selected regulations")
                for reg_id in regulation_ids:
                    reg_clauses = await persistence.get_clauses_by_regulation(reg_id)
                    for clause in reg_clauses:
                        all_clauses.append({
                            "id": clause["id"],
                            "text": clause["text"],
                            "source_document": clause.get("source_document", "Unknown"),
                            "category": clause.get("category", "general"),
                            "severity": clause.get("severity", "informational"),
                            "actions": clause.get("metadata", {}).get("actions", []),
                        })
            else:
                # Get all clauses
                stored_clauses = await persistence.get_all_clauses()
                for clause in stored_clauses:
                    all_clauses.append({
                        "id": clause["id"],
                        "text": clause["text"],
                        "source_document": clause.get("regulations", {}).get("filename", "Unknown"),
                        "category": clause.get("category", "general"),
                        "severity": clause.get("severity", "informational"),
                        "actions": clause.get("metadata", {}).get("actions", []),
                    })

            add_log(job_id, f"Loaded {len(all_clauses)} clauses from database")
            analysis_jobs[job_id]["progress"] = 50
            await persistence.update_job(job_id, {"progress": 50, "status": "processing"})
        else:
            # Extract clauses from provided regulation data
            total_regs = len(regulation_data)
            add_log(job_id, f"Extracting clauses from {total_regs} regulations...")

            for i, reg in enumerate(regulation_data):
                progress = int((i / total_regs) * 50)
                analysis_jobs[job_id]["progress"] = progress
                await persistence.update_job(job_id, {"progress": progress})

                filename = reg.get("filename", f"regulation-{i}")
                add_log(job_id, f"[{progress}%] Processing: {filename}")

                clauses = await clause_extractor.extract_clauses(
                    reg.get("parsed_data", reg),
                    filename,
                )
                add_log(job_id, f"  -> Extracted {len(clauses)} clauses")
                all_clauses.extend(clauses)

        # Store clauses in memory
        clauses_store[job_id] = all_clauses
        add_log(job_id, f"Total clauses to check: {len(all_clauses)}")

        # Analyze SOP compliance
        analysis_jobs[job_id]["progress"] = 60
        await persistence.update_job(job_id, {"progress": 60})
        add_log(job_id, "Starting SOP compliance analysis...")

        sop_parsed = sop_data.get("parsed_data", sop_data)
        sop_sections = sop_parsed.get("sections", [])
        add_log(job_id, f"SOP has {len(sop_sections)} sections")

        # Pass add_log to sop_analyzer for detailed logging
        compliance_results = await sop_analyzer.analyze_compliance(
            sop_sections,
            all_clauses,
            log_callback=lambda msg: add_log(job_id, msg),
        )

        analysis_jobs[job_id]["progress"] = 100
        analysis_jobs[job_id]["status"] = "completed"
        analysis_jobs[job_id]["results"] = compliance_results

        # Persist final results
        await persistence.update_job(job_id, {
            "progress": 100,
            "status": "completed",
            "results": compliance_results,
        })

        add_log(job_id, "=" * 50)
        add_log(job_id, "ANALYSIS COMPLETE!")
        add_log(job_id, f"Compliance Rate: {compliance_results['summary'].get('compliance_rate', 0)}%")
        add_log(job_id, f"Coverage Rate: {compliance_results['summary'].get('coverage_rate', 0)}%")
        add_log(job_id, f"Compliant: {len(compliance_results['compliant'])}")
        add_log(job_id, f"Partial: {len(compliance_results['partial'])}")
        add_log(job_id, f"Non-compliant: {len(compliance_results['non_compliant'])}")
        add_log(job_id, f"Not addressed: {len(compliance_results.get('not_addressed', []))}")
        add_log(job_id, "=" * 50)

    except Exception as e:
        add_log(job_id, f"ANALYSIS FAILED: {e}")
        import traceback
        traceback.print_exc()
        analysis_jobs[job_id]["status"] = "failed"
        analysis_jobs[job_id]["error"] = str(e)
        await persistence.update_job(job_id, {"status": "failed", "error": str(e)})


@router.get("/analyze/{job_id}")
async def get_analysis_status(job_id: str):
    """Get analysis job status and results."""
    # Try memory first
    if job_id in analysis_jobs:
        result = {**analysis_jobs[job_id]}
        # Include recent logs
        if job_id in job_logs:
            result["logs"] = job_logs[job_id][-50:]  # Last 50 logs
        return result

    # Fall back to database
    job = await persistence.get_job(job_id)
    if job:
        return {
            "status": job.get("status", "unknown"),
            "progress": job.get("progress", 0),
            "results": job.get("results"),
            "error": job.get("error"),
            "logs": job_logs.get(job_id, [])[-50:],
        }

    raise HTTPException(404, "Job not found")


@router.get("/analyze/{job_id}/logs")
async def get_analysis_logs(job_id: str, since: int = 0):
    """Get analysis logs for a job. Use 'since' to get only new logs."""
    if job_id not in job_logs:
        return {"logs": [], "total": 0}

    logs = job_logs[job_id]
    return {
        "logs": logs[since:],
        "total": len(logs),
    }


@router.get("/jobs/recent")
async def get_recent_jobs():
    """Get recent analysis jobs."""
    jobs = await persistence.get_recent_jobs(limit=10)
    return {"jobs": jobs}


@router.get("/clauses/{job_id}")
async def get_extracted_clauses(
    job_id: str,
    category: Optional[str] = None,
    severity: Optional[str] = None,
):
    """Get extracted clauses with optional filtering."""
    if job_id not in clauses_store:
        raise HTTPException(404, "Clauses not found")

    clauses = clauses_store[job_id]

    # Filter by category
    if category:
        clauses = [c for c in clauses if c.get("category") == category]

    # Filter by severity
    if severity:
        clauses = [c for c in clauses if c.get("severity") == severity]

    return clauses


@router.get("/report/{job_id}")
async def get_compliance_report(job_id: str):
    """Get formatted compliance report."""
    # Try memory first
    job = analysis_jobs.get(job_id)

    # Fall back to database
    if not job:
        job = await persistence.get_job(job_id)
        if job:
            job = {
                "status": job.get("status"),
                "results": job.get("results"),
            }

    if not job:
        raise HTTPException(404, "Job not found")

    if job.get("status") != "completed":
        raise HTTPException(400, f"Analysis not complete. Status: {job.get('status')}")

    results = job.get("results")
    if not results:
        raise HTTPException(400, "No results available")

    return {
        "job_id": job_id,
        "summary": results["summary"],
        "compliant_items": results["compliant"],
        "partial_items": results["partial"],
        "non_compliant_items": results["non_compliant"],
        "not_addressed_items": results.get("not_addressed", []),
        "recommendations": generate_recommendations(results),
    }


@router.post("/search")
async def semantic_search(query: SearchQuery):
    """Search clauses semantically."""
    from app.shared.vector_db import vector_store

    results = await vector_store.search(
        collection_name="regulation_clauses",
        query=query.text,
        n_results=query.limit,
    )

    return [
        {
            "clause_id": r["metadata"].get("id", ""),
            "text": r["document"],
            "source": r["metadata"].get("source", ""),
            "similarity": round(1 - r["distance"], 3),
        }
        for r in results
    ]


def generate_recommendations(results: dict) -> List[str]:
    """Generate actionable recommendations from results."""
    recommendations = []

    not_addressed = results.get("not_addressed", [])
    non_compliant = results.get("non_compliant", [])
    partial = results.get("partial", [])

    # Critical: Not addressed items (gaps in SOP)
    if not_addressed:
        critical_not_addressed = [i for i in not_addressed if i.get("severity") == "critical"]
        if critical_not_addressed:
            recommendations.append(
                f"CRITICAL GAP: {len(critical_not_addressed)} critical requirements have NO coverage in SOP. Address immediately."
            )
        recommendations.append(
            f"ADD TO SOP: {len(not_addressed)} regulatory requirements are not addressed at all."
        )

    # Non-compliant items (SOP contradicts requirements)
    if non_compliant:
        recommendations.append(
            f"FIX CONFLICTS: {len(non_compliant)} items where SOP contradicts regulatory requirements."
        )

        # Group by category
        categories = {}
        for item in non_compliant:
            cat = item.get("category", "general")
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(item)

        for cat, items in categories.items():
            recommendations.append(
                f"  - Review {len(items)} {cat} conflicts"
            )

    # Partial compliance items
    if partial:
        recommendations.append(
            f"ENHANCE: {len(partial)} items need more detail to achieve full compliance."
        )

    # Summary
    total = len(results.get("compliant", [])) + len(partial) + len(non_compliant) + len(not_addressed)
    if total > 0:
        compliant_count = len(results.get("compliant", []))
        recommendations.append(
            f"OVERALL: {compliant_count}/{total} requirements fully compliant ({round(compliant_count/total*100, 1)}%)"
        )

    if not recommendations:
        recommendations.append("All analyzed items appear to be compliant. Continue monitoring for regulatory updates.")

    return recommendations
