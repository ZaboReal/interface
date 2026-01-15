#!/usr/bin/env python3
"""Test parallel clause extraction on a single PDF"""
import asyncio
import os
import sys
import time

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load env
from dotenv import load_dotenv
load_dotenv()

async def test_parallel():
    from app.task2_regulation.services.pdf_parser import document_parser
    from app.task2_regulation.services.clause_extractor import clause_extractor

    pdf_path = "/Users/zabo/Desktop/inter/take-home-task/app/data/regulations/REG-IEEE 802.11.pdf"

    print("=" * 70)
    print("PARALLEL EXTRACTION TEST")
    print("=" * 70)
    print(f"\nPDF: {os.path.basename(pdf_path)}")

    # Step 1: Parse PDF
    print("\n[1] PARSING PDF...")
    start = time.time()
    parsed = await document_parser.parse_async(pdf_path)
    parse_time = time.time() - start

    print(f"  Parser: {parsed.get('parser', 'unknown')}")
    print(f"  Pages: {parsed.get('page_count', 0)}")
    print(f"  Sections: {len(parsed.get('sections', []))}")
    print(f"  Parse time: {parse_time:.2f}s")

    # Step 2: Extract clauses (parallel)
    print("\n[2] EXTRACTING CLAUSES (PARALLEL)...")
    start = time.time()
    clauses = await clause_extractor.extract_clauses(parsed, os.path.basename(pdf_path))
    extract_time = time.time() - start

    print(f"\n  Total clauses: {len(clauses)}")
    print(f"  Extraction time: {extract_time:.2f}s")

    # Step 3: Show sample clauses
    print("\n[3] SAMPLE CLAUSES")
    print("-" * 70)
    for i, clause in enumerate(clauses[:5]):
        print(f"\nClause {i+1}:")
        print(f"  ID: {clause.get('id')}")
        print(f"  Text: {clause.get('text', '')[:100]}...")
        print(f"  Category: {clause.get('category')}")
        print(f"  Severity: {clause.get('severity')}")
        print(f"  Page Range: {clause.get('page_range')}")

    # Step 4: Summary
    print("\n[4] SUMMARY BY CATEGORY")
    print("-" * 40)
    categories = {}
    for clause in clauses:
        cat = clause.get("category", "general")
        categories[cat] = categories.get(cat, 0) + 1
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    print("\n[5] SUMMARY BY SEVERITY")
    print("-" * 40)
    severities = {}
    for clause in clauses:
        sev = clause.get("severity", "unknown")
        severities[sev] = severities.get(sev, 0) + 1
    for sev, count in sorted(severities.items(), key=lambda x: -x[1]):
        print(f"  {sev}: {count}")

    print("\n" + "=" * 70)
    print(f"TOTAL TIME: {parse_time + extract_time:.2f}s")
    print("=" * 70)

    return clauses

if __name__ == "__main__":
    clauses = asyncio.run(test_parallel())
