#!/usr/bin/env python3
"""Test Unstructured.io PDF parsing"""
import asyncio
import os
import json

# Load env
from dotenv import load_dotenv
load_dotenv()

import unstructured_client
from unstructured_client.models import shared

async def test_parse():
    api_key = os.getenv("UNSTRUCTURED_API_KEY")
    print(f"API Key: {api_key[:10]}..." if api_key else "No API key found")

    client = unstructured_client.UnstructuredClient(
        api_key_auth=api_key
    )

    # Use a smaller PDF for testing - let's try the CFR one (usually smaller)
    pdf_path = "/Users/zabo/Desktop/inter/take-home-task/app/data/regulations/REG-29 CFR 1910 119.pdf"

    print(f"\nParsing: {pdf_path}")
    print("=" * 60)

    with open(pdf_path, "rb") as f:
        file_content = f.read()

    print(f"File size: {len(file_content)} bytes")

    req = {
        "partition_parameters": {
            "files": {
                "content": file_content,
                "file_name": os.path.basename(pdf_path),
            },
            "strategy": shared.Strategy.AUTO,
            "languages": ["eng"],
            "split_pdf_page": True,
            "split_pdf_allow_failed": True,
            "split_pdf_concurrency_level": 15,
        }
    }

    print("\nCalling Unstructured.io API...")
    res = await client.general.partition_async(request=req)

    elements = res.elements if hasattr(res, 'elements') else []
    print(f"\nGot {len(elements)} elements")
    print("=" * 60)

    # Group by page
    pages = {}
    for elem in elements:
        if hasattr(elem, 'to_dict'):
            elem_dict = elem.to_dict()
        elif isinstance(elem, dict):
            elem_dict = elem
        else:
            continue

        text = elem_dict.get("text", "")
        metadata = elem_dict.get("metadata", {})
        page_num = metadata.get("page_number", 1)
        elem_type = elem_dict.get("type", "unknown")

        if page_num not in pages:
            pages[page_num] = []

        pages[page_num].append({
            "type": elem_type,
            "text": text[:200] + "..." if len(text) > 200 else text,
        })

    # Print first 3 pages
    print("\n\n=== RAW OUTPUT (First 3 pages) ===\n")
    for page_num in sorted(pages.keys())[:3]:
        print(f"\n--- PAGE {page_num} ---")
        for elem in pages[page_num]:
            print(f"[{elem['type']}] {elem['text']}")
        print()

    # Print summary
    print("\n=== SUMMARY ===")
    print(f"Total pages: {max(pages.keys()) if pages else 0}")
    print(f"Total elements: {len(elements)}")

    # Count element types
    type_counts = {}
    for elem in elements:
        if hasattr(elem, 'to_dict'):
            elem_dict = elem.to_dict()
        elif isinstance(elem, dict):
            elem_dict = elem
        else:
            continue
        elem_type = elem_dict.get("type", "unknown")
        type_counts[elem_type] = type_counts.get(elem_type, 0) + 1

    print("\nElement types:")
    for t, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {t}: {count}")

if __name__ == "__main__":
    asyncio.run(test_parse())
