# API Routes for Task 3: P&ID Computer Vision Analysis
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional, Dict, List
from pathlib import Path
import shutil
import tempfile
import traceback

from .services.pid_processor import pid_processor
from .services.yolo_detector import yolo_detector
from .services.graph_builder import graph_builder
from .services.sop_cross_reference import sop_cross_reference
from .services.image_annotator import image_annotator
from .services.text_detection import text_detection_service
from .services.line_detection import line_detection_service
from .services.graph_construction import graph_construction_service
from .services.equipment_spec_extractor import equipment_spec_extractor
from .repositories.pid_repository import pid_repository
from .models.schemas import (
    AnalysisResponse,
    JobStatus,
)

# In-memory storage for annotated images (per job)
# In production, you'd store these in Supabase Storage or S3
annotated_images_cache: Dict[str, List[Dict]] = {}

# In-memory log storage per job (same pattern as Task 2)
job_logs: Dict[str, List[str]] = {}


def add_log(job_id: str, message: str):
    """Add a log message for a job."""
    if job_id not in job_logs:
        job_logs[job_id] = []
    # Keep last 200 logs per job
    if len(job_logs[job_id]) >= 200:
        job_logs[job_id] = job_logs[job_id][-100:]
    job_logs[job_id].append(message)
    print(message)  # Also print to console


router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_pid(
    pid_file: UploadFile = File(...),
    sop_file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
):
    """
    Analyze P&ID diagram and cross-reference with SOP.

    Uploads a P&ID PDF and SOP document, then:
    1. Converts P&ID PDF to images
    2. Detects components using YOLO + traditional CV
    3. Builds a graph of components and connections
    4. Parses SOP for component references
    5. Cross-references P&ID with SOP
    6. Generates discrepancy report
    """
    # Create job in Supabase
    job = await pid_repository.create_job(
        pid_filename=pid_file.filename,
        sop_filename=sop_file.filename,
    )

    if not job:
        # Fallback to in-memory job ID if Supabase not configured
        import uuid
        job = {"id": str(uuid.uuid4())}

    job_id = job["id"]

    # Save files temporarily
    temp_dir = tempfile.mkdtemp()
    pid_path = Path(temp_dir) / f"pid_{job_id}.pdf"
    sop_path = Path(temp_dir) / f"sop_{job_id}{Path(sop_file.filename).suffix}"

    with open(pid_path, "wb") as f:
        shutil.copyfileobj(pid_file.file, f)
    with open(sop_path, "wb") as f:
        shutil.copyfileobj(sop_file.file, f)

    # Run analysis in background
    if background_tasks:
        background_tasks.add_task(
            run_analysis,
            job_id,
            str(pid_path),
            str(sop_path),
            temp_dir
        )
        return AnalysisResponse(job_id=job_id, status="processing", message="Analysis started in background")
    else:
        # Run synchronously if no background tasks
        await run_analysis(job_id, str(pid_path), str(sop_path), temp_dir)
        return AnalysisResponse(job_id=job_id, status="completed", message="Analysis complete")


async def run_analysis(
    job_id: str,
    pid_path: str,
    sop_path: str,
    temp_dir: str
):
    """
    Background task to run P&ID analysis using Azure-style pipeline.

    Pipeline order (critical for accuracy):
    1. Convert PDF to images + Start SOP parsing (parallel)
    2. Detect symbols (Roboflow)
    3. Detect text (Google Cloud Vision / Tesseract)
    4. Associate text with symbols (tag assignment)
    5. Detect lines AFTER masking symbols/text (cleaner detection)
    6. Build graph + Extract specs (parallel)
    7. Cross-reference
    """
    import asyncio

    try:
        add_log(job_id, "=" * 50)
        add_log(job_id, "Starting P&ID Analysis Pipeline")
        add_log(job_id, "=" * 50)

        # Step 1: Convert PDF to images AND start SOP parsing in parallel
        await pid_repository.update_job_status(job_id, "processing", 10)
        add_log(job_id, "Step 1: Converting PDF to images + Starting SOP parsing (parallel)...")

        # Start SOP parsing early (it's independent of P&ID processing)
        sop_task = asyncio.create_task(sop_cross_reference.parse_sop(sop_path))

        images = pid_processor.pdf_to_images(pid_path)
        add_log(job_id, f"  -> Converted PDF to {len(images)} page(s)")

        all_components = []
        all_text_elements = []
        all_lines = []
        annotated_pages = []

        for page_idx, img in enumerate(images):
            page_num = page_idx + 1
            add_log(job_id, "-" * 40)
            add_log(job_id, f"Processing Page {page_num}/{len(images)}")
            add_log(job_id, "-" * 40)

            # Step 2: Detect symbols with Roboflow
            await pid_repository.update_job_status(job_id, "processing", 10 + (page_idx * 50 // len(images)))
            add_log(job_id, f"  Step 2: Detecting symbols (YOLO/Roboflow)...")
            prep = pid_processor.preprocess(img)
            symbols, _ = yolo_detector.detect_components(img, prep)

            # Add page number to symbols
            for sym in symbols:
                sym["page_number"] = page_num

            add_log(job_id, f"    -> Found {len(symbols)} symbols")

            # Step 3: Detect text with high-quality OCR
            add_log(job_id, f"  Step 3: Detecting text (OCR)...")
            text_elements = text_detection_service.detect_text(img)

            # Add page number to text
            for text in text_elements:
                text["page_number"] = page_num

            add_log(job_id, f"    -> Found {len(text_elements)} text elements")

            # Step 4: Associate text with symbols (tag assignment)
            add_log(job_id, f"  Step 4: Associating text with symbols...")
            symbols, unassociated_text = text_detection_service.associate_text_with_symbols(
                text_elements, symbols
            )

            # Count how many symbols got tags
            tagged_count = sum(1 for s in symbols if s.get("tag"))
            add_log(job_id, f"    -> {tagged_count}/{len(symbols)} symbols tagged")

            # Step 5: Detect lines AFTER masking symbols/text
            add_log(job_id, f"  Step 5: Detecting lines (with masking)...")
            lines = line_detection_service.detect_lines(img, symbols, text_elements)

            # Optionally merge collinear lines
            lines = line_detection_service.merge_collinear_lines(lines)

            add_log(job_id, f"    -> Found {len(lines)} lines/connections")

            # Add page number to lines
            for line in lines:
                line["page_number"] = page_num

            # Collect all elements
            all_components.extend(symbols)
            all_text_elements.extend(text_elements)
            all_lines.extend(lines)

            # Create annotated image
            annotated_result = image_annotator.annotate_and_encode(
                img,
                symbols,
                text_elements,
                lines
            )
            annotated_result["page_number"] = page_num
            annotated_pages.append(annotated_result)

        # Store annotated images in cache
        annotated_images_cache[job_id] = annotated_pages
        add_log(job_id, "=" * 50)
        add_log(job_id, "Page Processing COMPLETE")
        add_log(job_id, f"  Total components: {len(all_components)}")
        add_log(job_id, f"  Total text elements: {len(all_text_elements)}")
        add_log(job_id, f"  Total lines: {len(all_lines)}")
        add_log(job_id, f"  Annotated images: {len(annotated_pages)}")

        # Save components to Supabase
        await pid_repository.update_job_status(job_id, "processing", 60)
        saved_components = await pid_repository.create_components(job_id, all_components)

        # Build component ID map (tag -> supabase UUID)
        component_id_map = {}
        for i, comp in enumerate(all_components):
            tag = comp.get("tag") or f"{comp['type']}_{i}"
            if saved_components and i < len(saved_components):
                component_id_map[tag] = saved_components[i].get("id")

        # Step 6: Run graph building AND spec extraction in PARALLEL
        await pid_repository.update_job_status(job_id, "processing", 70)
        add_log(job_id, "=" * 50)
        add_log(job_id, "Step 6: Building graph + Extracting specs (parallel)...")

        async def build_graph_async():
            """Wrapper to run graph building."""
            graph = graph_construction_service.build_graph(
                all_components,
                all_lines,
                all_text_elements
            )
            graph_data = graph_construction_service.graph_to_dict(graph)
            add_log(job_id, f"  -> Graph built: {graph_data['stats']['node_count']} nodes, {graph_data['stats']['edge_count']} edges")
            return graph_data

        async def extract_specs_async():
            """Wrapper to run spec extraction for all pages."""
            all_pid_specs = []
            for page_num in range(1, len(images) + 1):
                page_specs = equipment_spec_extractor.extract_from_text_elements(
                    all_text_elements,
                    page_number=page_num
                )
                all_pid_specs.extend(page_specs)
            pid_specs_dicts = equipment_spec_extractor.specs_to_dict(all_pid_specs)
            add_log(job_id, f"  -> Extracted {len(pid_specs_dicts)} equipment specs from P&ID")
            for spec in pid_specs_dicts[:3]:
                add_log(job_id, f"      {spec.get('tag')}: {spec.get('design_pressure')} psig @ {spec.get('design_temperature')}°F")
            return pid_specs_dicts

        # Run graph building, spec extraction, and wait for SOP parsing in parallel
        graph_data, pid_specs_dicts, sop_data = await asyncio.gather(
            build_graph_async(),
            extract_specs_async(),
            sop_task  # Already started earlier
        )

        add_log(job_id, f"  -> SOP parsed: {len(sop_data['all_components'])} components in design limits")

        # Save edges and graph
        await pid_repository.create_edges(job_id, graph_data["edges"], component_id_map)
        await pid_repository.save_graph(job_id, graph_data)

        # Save SOP components
        await pid_repository.create_sop_components(job_id, sop_data["all_components"])

        # Step 7: Cross-reference P&ID specs vs SOP design limits
        await pid_repository.update_job_status(job_id, "processing", 90)
        add_log(job_id, "=" * 50)
        add_log(job_id, "Step 7: Cross-referencing P&ID vs SOP...")

        # IMPORTANT: Combine title block specs with detected component tags
        # This ensures we match components even if they don't have design specs in title blocks
        detected_tags = []
        for comp in all_components:
            tag = comp.get("tag")
            if tag:
                detected_tags.append({
                    "tag": tag,
                    "description": comp.get("type", ""),
                    "design_pressure": None,
                    "design_temperature": None,
                    "source": "symbol_detection"
                })

        # Merge: start with title block specs, add detected tags that aren't already in specs
        spec_tags = {s.get("tag", "").upper() for s in pid_specs_dicts}
        combined_pid_data = list(pid_specs_dicts)
        for dt in detected_tags:
            if dt["tag"].upper() not in spec_tags:
                combined_pid_data.append(dt)

        add_log(job_id, f"  P&ID title block specs: {len(pid_specs_dicts)}")
        add_log(job_id, f"  P&ID detected symbols with tags: {len(detected_tags)}")
        add_log(job_id, f"  Combined P&ID components: {len(combined_pid_data)}")
        add_log(job_id, f"  SOP components: {len(sop_data.get('all_components', []))}")

        # Log what tags we're comparing
        pid_tag_list = [c.get("tag") for c in combined_pid_data if c.get("tag")]
        sop_tag_list = [c.get("tag") for c in sop_data.get("all_components", []) if c.get("tag")]
        add_log(job_id, f"  P&ID tags: {pid_tag_list[:10]}...")
        add_log(job_id, f"  SOP tags: {sop_tag_list[:10]}...")

        discrepancies = await sop_cross_reference.cross_reference_with_specs(
            combined_pid_data,
            sop_data
        )
        summary = discrepancies.get("summary", {})
        add_log(job_id, f"  -> Matches: {summary.get('matches')}")
        add_log(job_id, f"  -> Pressure discrepancies: {summary.get('pressure_discrepancies')}")
        add_log(job_id, f"  -> Temperature discrepancies: {summary.get('temperature_discrepancies')}")
        add_log(job_id, f"  -> Missing in P&ID: {summary.get('missing_in_pid')}")
        add_log(job_id, f"  -> Compliance status: {summary.get('compliance_status')}")

        # Save discrepancies (including the new comparison format)
        await pid_repository.save_discrepancies(job_id, discrepancies, component_id_map)

        # Complete
        await pid_repository.update_job_status(job_id, "completed", 100)
        add_log(job_id, "=" * 50)
        add_log(job_id, "ANALYSIS COMPLETE")
        add_log(job_id, "=" * 50)

    except Exception as e:
        add_log(job_id, "=" * 50)
        add_log(job_id, f"ANALYSIS FAILED: {e}")
        add_log(job_id, "=" * 50)
        traceback.print_exc()
        await pid_repository.update_job_status(
            job_id, "failed", error_message=str(e)
        )

    finally:
        # Cleanup temp files
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.get("/status/{job_id}")
async def get_analysis_status(job_id: str):
    """Get analysis job status and recent logs."""
    job = await pid_repository.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    # Include recent logs in status response
    result = {
        "job_id": job_id,
        "status": job.get("status", "unknown"),
        "progress": job.get("progress", 0),
        "pid_filename": job.get("pid_filename"),
        "sop_filename": job.get("sop_filename"),
        "error": job.get("error_message"),
        "created_at": job.get("created_at"),
        "completed_at": job.get("completed_at"),
    }

    # Add last 50 logs
    if job_id in job_logs:
        result["logs"] = job_logs[job_id][-50:]

    return result


@router.get("/logs/{job_id}")
async def get_analysis_logs(job_id: str, since: int = 0):
    """
    Get analysis logs for a job.

    Use 'since' parameter to get only new logs (for polling).
    Returns logs from index 'since' onwards.
    """
    if job_id not in job_logs:
        return {"logs": [], "total": 0}

    logs = job_logs[job_id]
    return {
        "logs": logs[since:],
        "total": len(logs),
    }


@router.get("/graph/{job_id}")
async def get_graph(job_id: str):
    """Get the extracted graph data."""
    job = await pid_repository.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") != "completed":
        raise HTTPException(400, f"Analysis not complete. Status: {job.get('status')}")

    graph = await pid_repository.get_graph(job_id)
    if not graph:
        raise HTTPException(404, "Graph not found")

    return graph.get("graph_data", {})


@router.get("/annotated-images/{job_id}")
async def get_annotated_images(job_id: str):
    """
    Get annotated P&ID images with bounding boxes around detected components.

    Returns:
        List of annotated page images with:
        - annotated_image: base64 encoded JPEG
        - page_number: 1-indexed page number
        - component_count: number of components on this page
        - text_count: number of text elements on this page
        - width, height: image dimensions
    """
    job = await pid_repository.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") != "completed":
        raise HTTPException(400, f"Analysis not complete. Status: {job.get('status')}")

    # Get from cache
    if job_id not in annotated_images_cache:
        raise HTTPException(404, "Annotated images not found. Please re-run the analysis.")

    return {
        "pages": annotated_images_cache[job_id],
        "total_pages": len(annotated_images_cache[job_id])
    }


@router.get("/components/{job_id}")
async def get_components(job_id: str, type: Optional[str] = None):
    """Get detected components with optional type filter."""
    job = await pid_repository.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") != "completed":
        raise HTTPException(400, f"Analysis not complete. Status: {job.get('status')}")

    components = await pid_repository.get_components(job_id, type)
    return {"components": components, "total": len(components)}


@router.get("/sop-components/{job_id}")
async def get_sop_components(job_id: str):
    """Get SOP component references."""
    job = await pid_repository.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") != "completed":
        raise HTTPException(400, f"Analysis not complete. Status: {job.get('status')}")

    components = await pid_repository.get_sop_components(job_id)
    return {"components": components, "total": len(components)}


@router.get("/discrepancies/{job_id}")
async def get_discrepancies(job_id: str):
    """Get cross-reference discrepancy report."""
    job = await pid_repository.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") != "completed":
        raise HTTPException(400, f"Analysis not complete. Status: {job.get('status')}")

    return await pid_repository.get_discrepancies(job_id)


@router.get("/jobs")
async def list_jobs(limit: int = 50):
    """List P&ID analysis jobs."""
    jobs = await pid_repository.get_recent_jobs(limit)
    return {"jobs": jobs, "total": len(jobs)}


@router.get("/export/{job_id}")
async def export_graph(job_id: str, format: str = "json"):
    """Export graph in specified format."""
    job = await pid_repository.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") != "completed":
        raise HTTPException(400, f"Analysis not complete. Status: {job.get('status')}")

    graph = await pid_repository.get_graph(job_id)
    if not graph:
        raise HTTPException(404, "Graph not found")

    if format == "json":
        return graph.get("graph_data", {})
    else:
        raise HTTPException(400, f"Unsupported format: {format}. Use 'json'.")
