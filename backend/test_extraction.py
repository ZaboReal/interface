#!/usr/bin/env python3
"""Test full extraction pipeline: Unstructured.io -> LLM clause extraction"""
import asyncio
import os
import json
import sys

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load env
from dotenv import load_dotenv
load_dotenv()

async def test_extraction():
    from app.task2_regulation.services.pdf_parser import document_parser
    from app.task2_regulation.services.clause_extractor import clause_extractor

    # Use a smaller PDF for testing
    pdf_path = "/Users/zabo/Desktop/inter/take-home-task/app/data/regulations/REG-29 CFR 1910 119.pdf"

    print("=" * 70)
    print("FULL EXTRACTION TEST")
    print("=" * 70)
    print(f"\nPDF: {os.path.basename(pdf_path)}")
    print(f"Model: gpt-5-nano")

    # Step 1: Parse PDF
    print("\n[1] PARSING PDF...")
    print("-" * 40)

    parsed = await document_parser.parse_async(pdf_path)

    print(f"Parser used: {parsed.get('parser', 'unknown')}")
    print(f"Total pages: {parsed.get('page_count', 0)}")
    print(f"Sections created: {len(parsed.get('sections', []))}")

    # Show sections
    for i, section in enumerate(parsed.get("sections", [])[:3]):
        print(f"  Section {i+1}: {section.get('title')} ({len(section.get('content', ''))} chars)")

    # Step 2: Extract clauses (only first 2 sections for speed)
    print("\n[2] EXTRACTING CLAUSES (first 2 sections only)...")
    print("-" * 40)

    # Limit to first 2 sections for testing
    test_doc = {
        "sections": parsed.get("sections", [])[:2],
        "filename": parsed.get("filename"),
        "page_count": parsed.get("page_count"),
    }

    clauses = await clause_extractor.extract_clauses(
        test_doc,
        os.path.basename(pdf_path)
    )

    print(f"\nTotal clauses extracted: {len(clauses)}")

    # Step 3: Show results
    print("\n[3] EXTRACTED CLAUSES")
    print("=" * 70)

    for i, clause in enumerate(clauses[:10]):  # Show first 10
        print(f"\n--- Clause {i+1} ---")
        print(f"Text: {clause.get('text', '')[:150]}...")
        print(f"Type: {clause.get('type')}")
        print(f"Category: {clause.get('category')}")
        print(f"Severity: {clause.get('severity')}")
        print(f"Page Range: {clause.get('page_range')}")
        print(f"Actions: {clause.get('actions', [])}")

    # Summary by category
    print("\n[4] SUMMARY BY CATEGORY")
    print("-" * 40)
    categories = {}
    for clause in clauses:
        cat = clause.get("category", "general")
        categories[cat] = categories.get(cat, 0) + 1

    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    # Summary by severity
    print("\n[5] SUMMARY BY SEVERITY")
    print("-" * 40)
    severities = {}
    for clause in clauses:
        sev = clause.get("severity", "unknown")
        severities[sev] = severities.get(sev, 0) + 1

    for sev, count in sorted(severities.items(), key=lambda x: -x[1]):
        print(f"  {sev}: {count}")

    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)

    return clauses

if __name__ == "__main__":
    clauses = asyncio.run(test_extraction())
