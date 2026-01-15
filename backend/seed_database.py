#!/usr/bin/env python3
"""
Seed the database with all preloaded regulation documents.
Processes all PDFs → extracts clauses → stores in Supabase → indexes vectors.

Usage:
    python seed_database.py
"""
import asyncio
import os
import sys
import time
import hashlib
from pathlib import Path

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load env
from dotenv import load_dotenv
load_dotenv()


async def seed_database():
    from app.task2_regulation.services.pdf_parser import document_parser
    from app.task2_regulation.services.clause_extractor import clause_extractor
    from app.shared.persistence import persistence
    from app.shared.vector_db import vector_store
    from app.config import settings

    # Check Supabase connection
    if not persistence.is_configured():
        print("ERROR: Supabase not configured. Check SUPABASE_URL and SUPABASE_SECRET_KEY in .env")
        return

    # Find regulations directory
    regulations_dir = Path(settings.REGULATIONS_DIR)
    if not regulations_dir.exists():
        regulations_dir = Path(__file__).parent.parent / "data" / "regulations"

    if not regulations_dir.exists():
        print(f"ERROR: Regulations directory not found: {regulations_dir}")
        return

    pdf_files = list(regulations_dir.glob("*.pdf"))

    print("=" * 70)
    print("DATABASE SEEDER")
    print("=" * 70)
    print(f"\nRegulations directory: {regulations_dir}")
    print(f"Found {len(pdf_files)} PDF files")
    print(f"Supabase: Connected")
    print()

    total_clauses = 0
    total_pages = 0
    start_time = time.time()
    results = []

    for i, pdf_file in enumerate(pdf_files):
        print(f"\n{'='*70}")
        print(f"[{i+1}/{len(pdf_files)}] {pdf_file.name}")
        print("=" * 70)

        try:
            # Calculate file hash
            with open(pdf_file, "rb") as f:
                file_hash = hashlib.md5(f.read()).hexdigest()

            # Step 1: Parse PDF with Unstructured.io
            print(f"\n[1/4] Parsing PDF...")
            parse_start = time.time()
            parsed = await document_parser.parse_async(str(pdf_file))
            parse_time = time.time() - parse_start

            page_count = parsed.get("page_count", 0)
            section_count = len(parsed.get("sections", []))
            print(f"      Parser: {parsed.get('parser', 'unknown')}")
            print(f"      Pages: {page_count}")
            print(f"      Sections: {section_count}")
            print(f"      Time: {parse_time:.1f}s")

            # Step 2: Extract clauses (parallel)
            print(f"\n[2/4] Extracting clauses...")
            extract_start = time.time()
            clauses = await clause_extractor.extract_clauses(parsed, pdf_file.name)
            extract_time = time.time() - extract_start
            print(f"      Clauses: {len(clauses)}")
            print(f"      Time: {extract_time:.1f}s")

            # Step 3: Save to Supabase
            print(f"\n[3/4] Saving to Supabase...")
            save_start = time.time()

            # Save regulation
            regulation_id = await persistence.save_regulation({
                "filename": pdf_file.name,
                "file_hash": file_hash,
                "page_count": page_count,
                "full_text": parsed.get("full_text", ""),  # Full text, no truncation
                "parsed_data": {"sections": len(parsed.get("sections", []))},
                "clause_count": len(clauses),
            })

            if not regulation_id:
                print("      ERROR: Failed to save regulation")
                continue

            # Save clauses
            await persistence.save_clauses(regulation_id, clauses)
            save_time = time.time() - save_start
            print(f"      Regulation ID: {regulation_id}")
            print(f"      Time: {save_time:.1f}s")

            # Step 4: Index vectors
            print(f"\n[4/4] Indexing vectors...")
            vector_start = time.time()

            if clauses:
                documents = [clause["text"] for clause in clauses]
                metadatas = [
                    {
                        "id": clause["id"],
                        "source": pdf_file.name,
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

            vector_time = time.time() - vector_start
            print(f"      Indexed: {len(clauses)} vectors")
            print(f"      Time: {vector_time:.1f}s")

            # Track results
            total_clauses += len(clauses)
            total_pages += page_count
            results.append({
                "filename": pdf_file.name,
                "pages": page_count,
                "clauses": len(clauses),
                "time": parse_time + extract_time + save_time + vector_time,
                "status": "success",
            })

            # Category summary
            categories = {}
            severities = {}
            for c in clauses:
                cat = c.get("category", "general")
                sev = c.get("severity", "informational")
                categories[cat] = categories.get(cat, 0) + 1
                severities[sev] = severities.get(sev, 0) + 1

            print(f"\n      Categories: {dict(sorted(categories.items(), key=lambda x: -x[1]))}")
            print(f"      Severities: {severities}")

        except Exception as e:
            print(f"\n      ERROR: {e}")
            import traceback
            traceback.print_exc()
            results.append({
                "filename": pdf_file.name,
                "status": "error",
                "error": str(e),
            })

    # Final summary
    total_time = time.time() - start_time

    print("\n" + "=" * 70)
    print("SEEDING COMPLETE")
    print("=" * 70)

    print(f"\n{'Regulation':<45} {'Pages':>6} {'Clauses':>8} {'Time':>8}")
    print("-" * 70)
    for r in results:
        if r["status"] == "success":
            print(f"{r['filename']:<45} {r['pages']:>6} {r['clauses']:>8} {r['time']:>7.1f}s")
        else:
            print(f"{r['filename']:<45} {'ERROR':>6} {'-':>8} {'-':>8}")
    print("-" * 70)
    print(f"{'TOTAL':<45} {total_pages:>6} {total_clauses:>8} {total_time:>7.1f}s")

    print(f"\n✓ {len([r for r in results if r['status'] == 'success'])} regulations processed successfully")
    print(f"✓ {total_clauses} clauses extracted and indexed")
    print(f"✓ All data stored in Supabase")


if __name__ == "__main__":
    asyncio.run(seed_database())
