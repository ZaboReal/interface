# Clause Extraction Service using parallel chunked LLM processing
from typing import List, Dict, Any, Tuple
import re
import json
import asyncio
from app.shared.llm_client import llm_client

# Improved prompt for regulatory clause extraction
EXTRACTION_PROMPT = """You are a regulatory compliance expert. Analyze the following regulatory document excerpt and extract ALL regulatory clauses, requirements, and compliance obligations.

DOCUMENT: {regulation_name}
PAGES: {page_range}

TEXT:
{text}

INSTRUCTIONS:
1. Extract ONLY actual regulatory requirements (shall, must, should, required, prohibited, etc.)
2. Do NOT extract definitions, explanatory text, or general descriptions
3. For each clause, identify:
   - The exact requirement text
   - Whether it's mandatory (shall/must), recommended (should), or prohibited (shall not/must not)
   - What category it falls under (safety, documentation, training, equipment, inspection, operational, personnel, environmental)
   - The severity: critical (life safety, immediate hazard), important (compliance required), advisory (best practice)

OUTPUT FORMAT:
Return a JSON array. Each object must have these exact keys:
- "text": the exact clause text (required)
- "type": "mandatory" | "recommended" | "prohibited" (required)
- "category": one of [safety, documentation, training, equipment, inspection, operational, personnel, environmental, general] (required)
- "severity": "critical" | "important" | "advisory" (required)
- "actions": array of 1-3 specific compliance actions needed (required)
- "reference": section/article number if mentioned (optional)

EXAMPLE OUTPUT:
[
  {{
    "text": "All equipment shall be inspected annually by a qualified technician",
    "type": "mandatory",
    "category": "inspection",
    "severity": "important",
    "actions": ["Schedule annual equipment inspections", "Maintain qualified technician records", "Document inspection results"],
    "reference": "Section 4.2.1"
  }},
  {{
    "text": "Personnel should receive safety training before operating machinery",
    "type": "recommended",
    "category": "training",
    "severity": "advisory",
    "actions": ["Develop safety training program", "Track training completion"],
    "reference": null
  }}
]

Return ONLY the JSON array, no other text. If no clauses found, return empty array [].
"""


class ClauseExtractor:
    """Extracts regulatory clauses from parsed documents using parallel chunked LLM processing."""

    def __init__(self):
        self.pages_per_chunk = 1  # Process 1 page at a time for better extraction
        self.max_concurrent = 10  # Max parallel LLM calls (more since pages are smaller)

    async def extract_clauses(
        self,
        document: Dict[str, Any],
        regulation_name: str
    ) -> List[Dict]:
        """
        Extract regulatory clauses from a parsed document.
        Processes 10-page chunks IN PARALLEL for speed.
        """
        sections = document.get("sections", [])

        # If no sections, create one from full text
        if not sections:
            full_text = document.get("full_text", "")
            if full_text:
                sections = [{
                    "title": "Full Document",
                    "content": full_text,
                    "start_page": 1,
                    "end_page": document.get("page_count", 1),
                }]

        total_sections = len(sections)
        if total_sections == 0:
            print(f"[ClauseExtractor] No sections to process")
            return []

        print(f"\n[ClauseExtractor] {'='*50}")
        print(f"[ClauseExtractor] Processing {regulation_name}")
        print(f"[ClauseExtractor] {total_sections} pages (1 page per LLM call)")
        print(f"[ClauseExtractor] Max parallel: {self.max_concurrent}")
        print(f"[ClauseExtractor] {'='*50}")

        # Process all sections in parallel with concurrency limit
        all_clauses = await self._process_sections_parallel(
            sections=sections,
            regulation_name=regulation_name,
        )

        print(f"\n[ClauseExtractor] DONE: Extracted {len(all_clauses)} total clauses")
        return all_clauses

    async def _process_sections_parallel(
        self,
        sections: List[Dict],
        regulation_name: str,
    ) -> List[Dict]:
        """
        Process all sections in parallel with a concurrency limit.
        Returns clauses in order (by section index).
        """
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def process_with_semaphore(index: int, section: Dict) -> Tuple[int, List[Dict]]:
            async with semaphore:
                clauses = await self._process_single_section(
                    index=index,
                    section=section,
                    regulation_name=regulation_name,
                    total=len(sections),
                )
                return (index, clauses)

        # Create all tasks
        tasks = [
            process_with_semaphore(i, section)
            for i, section in enumerate(sections)
        ]

        # Run all in parallel (semaphore limits concurrency)
        print(f"[ClauseExtractor] Spawning {len(tasks)} parallel extraction tasks...")
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Sort by index and flatten
        all_clauses = []
        results_sorted = sorted(
            [(idx, clauses) for idx, clauses in results if not isinstance(clauses, Exception)],
            key=lambda x: x[0]
        )

        # Handle errors
        for result in results:
            if isinstance(result, Exception):
                print(f"[ClauseExtractor] Task failed: {result}")

        # Flatten in order
        clause_counter = 0
        for idx, clauses in results_sorted:
            for clause in clauses:
                clause_counter += 1
                clause["id"] = f"{regulation_name}-clause-{clause_counter}"
                all_clauses.append(clause)

        return all_clauses

    async def _process_single_section(
        self,
        index: int,
        section: Dict,
        regulation_name: str,
        total: int,
    ) -> List[Dict]:
        """Process a single section and extract clauses."""
        page_range = f"{section.get('start_page', index+1)}-{section.get('end_page', index+1)}"

        content = section.get("content", "")
        if isinstance(content, list):
            content = "\n".join(content)

        if not content.strip():
            print(f"[ClauseExtractor] [{index+1}/{total}] Pages {page_range}: EMPTY")
            return []

        print(f"[ClauseExtractor] [{index+1}/{total}] Pages {page_range}: Processing...")

        try:
            clauses = await self._extract_from_chunk(
                text=content,
                regulation_name=regulation_name,
                page_range=page_range,
            )

            # Add metadata to each clause
            for clause in clauses:
                clause["source_document"] = regulation_name
                clause["page_range"] = page_range
                clause["extraction_method"] = "llm"

            print(f"[ClauseExtractor] [{index+1}/{total}] Pages {page_range}: {len(clauses)} clauses")
            return clauses

        except Exception as e:
            print(f"[ClauseExtractor] [{index+1}/{total}] Pages {page_range}: ERROR - {e}")
            return []

    async def _extract_from_chunk(
        self,
        text: str,
        regulation_name: str,
        page_range: str,
    ) -> List[Dict]:
        """Extract clauses from a single chunk using LLM."""
        if not llm_client.is_configured():
            print(f"    [LLM] Not configured, skipping")
            return []

        # No truncation - we process 1 page at a time so full text fits in context

        prompt = EXTRACTION_PROMPT.format(
            regulation_name=regulation_name,
            page_range=page_range,
            text=text,
        )

        try:
            response = await llm_client.generate(prompt)
            clauses = self._parse_llm_response(response)
            return clauses

        except Exception as e:
            print(f"    [LLM] Extraction failed: {e}")
            return []

    def _parse_llm_response(self, response: str) -> List[Dict]:
        """Parse LLM response into clause objects."""
        try:
            # Try to extract JSON from response
            # Handle potential markdown code blocks
            response = response.strip()
            if response.startswith("```"):
                # Remove markdown code block
                lines = response.split("\n")
                response = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                clauses = json.loads(json_match.group())
                # Validate required fields
                valid_clauses = []
                for clause in clauses:
                    if isinstance(clause, dict) and "text" in clause:
                        # Ensure required fields have defaults
                        clause.setdefault("type", "mandatory")
                        clause.setdefault("category", "general")
                        clause.setdefault("severity", "important")
                        clause.setdefault("actions", [])
                        valid_clauses.append(clause)
                return valid_clauses
        except json.JSONDecodeError as e:
            print(f"    [LLM] JSON parse error: {e}")
        except Exception as e:
            print(f"    [LLM] Parse error: {e}")

        return []

    async def extract_clauses_batch(
        self,
        documents: List[Dict[str, Any]],
        max_concurrent_docs: int = 2
    ) -> Dict[str, List[Dict]]:
        """
        Extract clauses from multiple documents.
        Processes documents with limited concurrency.
        """
        results = {}
        semaphore = asyncio.Semaphore(max_concurrent_docs)

        async def process_doc(doc: Dict) -> Tuple[str, List[Dict]]:
            async with semaphore:
                filename = doc.get("filename", "unknown")
                clauses = await self.extract_clauses(doc, filename)
                return filename, clauses

        tasks = [process_doc(doc) for doc in documents]
        completed = await asyncio.gather(*tasks, return_exceptions=True)

        for result in completed:
            if isinstance(result, Exception):
                print(f"[ClauseExtractor] Batch error: {result}")
            else:
                filename, clauses = result
                results[filename] = clauses

        return results


# Singleton instance
clause_extractor = ClauseExtractor()
