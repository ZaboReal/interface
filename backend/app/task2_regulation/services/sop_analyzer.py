# SOP Analyzer Service - SOP-first compliance checking
# Chunk SOP → find relevant clauses → verify each match → report gaps
import asyncio
from typing import List, Dict, Set
import json
import re
from app.shared.vector_db import vector_store
from app.shared.llm_client import llm_client


RELEVANCE_CHECK_PROMPT = """You are a regulatory compliance expert. Determine if this regulatory clause actually applies to this SOP section.

SOP SECTION:
{sop_text}

REGULATORY CLAUSE:
{clause_text}

TASK:
1. Does this regulatory clause actually apply to what the SOP section describes?
2. If yes, does the SOP comply with the requirement?

OUTPUT FORMAT (JSON only):
{{
    "applies": true or false,
    "reason": "Brief reason why it applies or doesn't",
    "compliance_status": "compliant|partial|non_compliant|not_applicable",
    "explanation": "If applies, explain compliance status",
    "missing_actions": ["action1", "action2"] or [],
    "patch_suggestion": "Text to add to SOP to fix gap" or null
}}

- "not_applicable" if the clause doesn't actually apply to this SOP section
- "compliant" if SOP fully satisfies the requirement
- "partial" if SOP partially addresses it but missing details
- "non_compliant" if SOP contradicts or conflicts with the requirement

Respond with ONLY the JSON object."""


class SOPAnalyzer:
    """
    SOP-first compliance analysis with parallel processing.

    Flow:
    1. Chunk SOP into sections
    2. For each chunk, find top-k relevant clauses (parallel)
    3. For each clause match, verify if it actually applies (parallel LLM calls)
    4. Collect findings - only report actual issues found
    """

    def __init__(self):
        self.clauses_collection = "regulation_clauses"
        self.top_k_clauses = 5  # Top clauses to check per SOP chunk
        self.max_concurrent = 15  # Max parallel LLM calls

    async def analyze_compliance(
        self,
        sop_sections: List[Dict],
        clauses: List[Dict],
        log_callback: callable = None,
    ) -> Dict:
        """
        Analyze SOP compliance against regulatory clauses.
        Only reports issues found - not all unmatched clauses.
        """
        def log(msg: str):
            if log_callback:
                log_callback(msg)
            else:
                print(msg)

        log("=" * 50)
        log("SOP COMPLIANCE ANALYSIS")
        log("=" * 50)

        results = {
            "compliant": [],
            "non_compliant": [],
            "partial": [],
            "not_addressed": [],  # Only clauses that SHOULD apply but aren't addressed
            "summary": {},
        }

        # Step 1: Chunk SOP
        log("Chunking SOP...")
        sop_chunks = self._chunk_sop(sop_sections)
        log(f"Created {len(sop_chunks)} SOP chunks")

        if not sop_chunks:
            log("No SOP content to analyze")
            results["summary"] = self._generate_summary(results)
            return results

        # Step 2: For each chunk, find relevant clauses (parallel)
        log(f"Finding relevant clauses for {len(sop_chunks)} chunks...")

        chunk_clause_pairs = await self._find_clauses_for_chunks_parallel(sop_chunks, log)

        total_pairs = sum(len(data["clauses"]) for data in chunk_clause_pairs.values())
        log(f"Found {total_pairs} chunk-clause pairs to verify")

        if total_pairs == 0:
            log("No relevant clauses found for any SOP chunk")
            results["summary"] = self._generate_summary(results)
            return results

        # Step 3: Verify each match with LLM (parallel)
        log(f"Verifying {total_pairs} matches with LLM ({self.max_concurrent} parallel)...")

        findings = await self._verify_all_matches_parallel(chunk_clause_pairs, log)

        # Step 4: Process findings
        log("Processing findings...")
        seen_clauses: Set[str] = set()

        for finding in findings:
            clause_id = finding.get("clause_id")
            if not clause_id or clause_id in seen_clauses:
                continue

            # Skip if clause doesn't actually apply
            if not finding.get("applies", False):
                continue

            seen_clauses.add(clause_id)

            status = finding.get("compliance_status", "partial")
            if status == "not_applicable":
                continue

            result = {
                "clause_id": clause_id,
                "clause_text": finding.get("clause_text", ""),
                "category": finding.get("category", "general"),
                "severity": finding.get("severity", "informational"),
                "status": status,
                "explanation": finding.get("explanation", ""),
                "sop_evidence": [{
                    "text": finding.get("sop_text", ""),
                    "section": finding.get("sop_section", ""),
                    "score": finding.get("relevance_score", 0.5),
                }],
                "missing_actions": finding.get("missing_actions", []),
                "patch_suggestion": finding.get("patch_suggestion"),
            }

            if status == "compliant":
                results["compliant"].append(result)
            elif status == "partial":
                results["partial"].append(result)
            elif status == "non_compliant":
                results["non_compliant"].append(result)

        # Generate summary
        results["summary"] = self._generate_summary(results)

        log("=" * 50)
        log("ANALYSIS COMPLETE")
        log(f"Applicable clauses found: {len(seen_clauses)}")
        log(f"Compliant: {len(results['compliant'])}")
        log(f"Partial: {len(results['partial'])}")
        log(f"Non-compliant: {len(results['non_compliant'])}")
        log("=" * 50)

        return results

    def _chunk_sop(self, sop_sections: List[Dict]) -> List[Dict]:
        """Chunk SOP into sections for analysis."""
        chunks = []

        for section in sop_sections:
            section_title = section.get("title", "Untitled")
            content = section.get("content", "")

            if isinstance(content, list):
                content = "\n".join(content)

            content = content.strip()
            if not content or len(content) < 50:
                continue

            # Split large sections into manageable chunks
            if len(content) > 1500:
                for j in range(0, len(content), 1200):
                    chunk_text = content[j:j+1500].strip()
                    if len(chunk_text) >= 100:
                        chunks.append({
                            "section": f"{section_title} (part {j//1200 + 1})",
                            "text": chunk_text,
                        })
            else:
                chunks.append({
                    "section": section_title,
                    "text": content,
                })

        return chunks

    async def _find_clauses_for_chunks_parallel(
        self,
        sop_chunks: List[Dict],
        log: callable,
    ) -> Dict[int, List[Dict]]:
        """Find relevant clauses for each SOP chunk in parallel."""

        async def find_for_chunk(chunk_idx: int, chunk: Dict) -> tuple:
            try:
                results = await vector_store.search(
                    collection_name=self.clauses_collection,
                    query=chunk["text"][:1500],
                    n_results=self.top_k_clauses,
                )

                clauses = []
                for r in results:
                    score = 1 - r["distance"]
                    if score >= 0.3:  # Min relevance threshold
                        clauses.append({
                            "id": r.get("id") or r["metadata"].get("id"),
                            "text": r["document"],
                            "metadata": r["metadata"],
                            "relevance_score": round(score, 3),
                        })

                return (chunk_idx, clauses)
            except Exception as e:
                log(f"  Error finding clauses for chunk {chunk_idx}: {e}")
                return (chunk_idx, [])

        # Run all searches in parallel
        tasks = [
            find_for_chunk(i, chunk)
            for i, chunk in enumerate(sop_chunks)
        ]

        results = await asyncio.gather(*tasks)

        # Build mapping with chunk data included
        chunk_clause_map = {}
        for chunk_idx, clauses in results:
            if clauses:
                chunk_clause_map[chunk_idx] = {
                    "chunk": sop_chunks[chunk_idx],
                    "clauses": clauses,
                }
                log(f"  Chunk {chunk_idx + 1}: {len(clauses)} potential clauses")

        return chunk_clause_map

    async def _verify_all_matches_parallel(
        self,
        chunk_clause_map: Dict,
        log: callable,
    ) -> List[Dict]:
        """Verify all chunk-clause matches with LLM in parallel."""

        semaphore = asyncio.Semaphore(self.max_concurrent)
        completed = [0]  # Use list to allow mutation in closure
        total_tasks = sum(len(data["clauses"]) for data in chunk_clause_map.values())

        async def verify_match(chunk_data: Dict, clause: Dict) -> Dict:
            async with semaphore:
                chunk = chunk_data["chunk"]
                sop_text = chunk["text"]
                sop_section = chunk["section"]
                clause_text = clause["text"]
                clause_id = clause["id"]

                # Use LLM to verify
                if llm_client.is_configured():
                    result = await self._verify_with_llm(sop_text, clause_text)
                else:
                    result = self._verify_heuristic(sop_text, clause_text, clause["relevance_score"])

                # Add metadata
                result["clause_id"] = clause_id
                result["clause_text"] = clause_text
                result["sop_text"] = sop_text
                result["sop_section"] = sop_section
                result["relevance_score"] = clause["relevance_score"]
                result["category"] = clause["metadata"].get("category", "general")
                result["severity"] = clause["metadata"].get("severity", "informational")

                # Log progress
                completed[0] += 1
                if completed[0] % 10 == 0 or completed[0] == total_tasks:
                    status = result.get("compliance_status", "unknown")
                    applies = "✓" if result.get("applies") else "✗"
                    log(f"  [{completed[0]}/{total_tasks}] {applies} {clause_id[:30]}... → {status}")

                return result

        # Create all verification tasks
        tasks = []
        for chunk_idx, data in chunk_clause_map.items():
            for clause in data["clauses"]:
                tasks.append(verify_match(data, clause))

        log(f"  Running {len(tasks)} parallel LLM verification calls...")

        # Run all in parallel with semaphore limiting concurrency
        findings = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions
        valid_findings = []
        for f in findings:
            if isinstance(f, Exception):
                log(f"  Verification error: {f}")
            elif isinstance(f, dict):
                valid_findings.append(f)

        return valid_findings

    async def _verify_with_llm(self, sop_text: str, clause_text: str) -> Dict:
        """Use LLM to verify if clause applies and check compliance."""
        prompt = RELEVANCE_CHECK_PROMPT.format(
            sop_text=sop_text,
            clause_text=clause_text,
        )

        try:
            response = await llm_client.generate(prompt)

            # Extract JSON
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())

                # Normalize
                result.setdefault("applies", False)
                result.setdefault("compliance_status", "not_applicable")
                result.setdefault("explanation", "")
                result.setdefault("missing_actions", [])
                result.setdefault("patch_suggestion", None)

                return result

        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
        except Exception as e:
            print(f"LLM error: {e}")

        # Fallback
        return {
            "applies": False,
            "compliance_status": "not_applicable",
            "explanation": "Could not verify",
            "missing_actions": [],
            "patch_suggestion": None,
        }

    def _verify_heuristic(self, sop_text: str, clause_text: str, relevance_score: float) -> Dict:
        """Heuristic fallback when LLM unavailable."""
        sop_lower = sop_text.lower()
        clause_lower = clause_text.lower()

        # Extract key terms
        key_terms = re.findall(r'\b[a-z]{4,}\b', clause_lower)
        stop_words = {'shall', 'must', 'should', 'will', 'that', 'this', 'with',
                      'have', 'been', 'from', 'each', 'such', 'which', 'when'}
        key_terms = [t for t in key_terms if t not in stop_words][:10]

        matches = sum(1 for term in key_terms if term in sop_lower)
        match_ratio = matches / max(len(key_terms), 1)

        # Only consider it applies if good relevance and term matches
        applies = relevance_score >= 0.4 and match_ratio >= 0.3

        if not applies:
            return {
                "applies": False,
                "compliance_status": "not_applicable",
                "explanation": f"Low relevance ({relevance_score}) or term match ({match_ratio})",
                "missing_actions": [],
                "patch_suggestion": None,
            }

        # Determine compliance
        if match_ratio >= 0.6:
            status = "compliant"
        elif match_ratio >= 0.4:
            status = "partial"
        else:
            status = "partial"

        return {
            "applies": True,
            "compliance_status": status,
            "explanation": f"Heuristic: {matches}/{len(key_terms)} terms matched",
            "missing_actions": [],
            "patch_suggestion": None,
        }

    def _generate_summary(self, results: Dict) -> Dict:
        """Generate summary statistics."""
        total_found = (
            len(results["compliant"]) +
            len(results["partial"]) +
            len(results["non_compliant"])
        )

        if total_found == 0:
            return {
                "total_applicable_clauses": 0,
                "compliant_count": 0,
                "partial_count": 0,
                "non_compliant_count": 0,
                "compliance_rate": 100,
                "critical_gaps": 0,
                "by_category": {},
                "by_severity": {},
            }

        # Count critical gaps
        critical_gaps = sum(
            1 for item in results["non_compliant"]
            if item.get("severity") == "critical"
        )

        # Compliance rate of applicable clauses
        compliance_rate = (len(results["compliant"]) / total_found) * 100

        return {
            "total_applicable_clauses": total_found,
            "compliant_count": len(results["compliant"]),
            "partial_count": len(results["partial"]),
            "non_compliant_count": len(results["non_compliant"]),
            "compliance_rate": round(compliance_rate, 1),
            "critical_gaps": critical_gaps,
            "by_category": self._group_by_field(results, "category"),
            "by_severity": self._group_by_field(results, "severity"),
        }

    def _group_by_field(self, results: Dict, field: str) -> Dict:
        """Group results by field."""
        groups = {}

        for status in ["compliant", "partial", "non_compliant"]:
            for item in results[status]:
                value = item.get(field, "unknown")
                if value not in groups:
                    groups[value] = {"compliant": 0, "partial": 0, "non_compliant": 0}
                groups[value][status] += 1

        return groups


# Singleton
sop_analyzer = SOPAnalyzer()
