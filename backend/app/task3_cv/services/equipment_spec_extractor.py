# Equipment Specification Extractor for P&ID Diagrams
# Uses LLM to intelligently group OCR text into equipment specifications
#
# Flow:
# 1. OCR extracts all text with bounding box positions
# 2. LLM receives text + positions and groups them into equipment specs
# 3. Returns structured equipment data (tag, pressure, temperature, etc.)

import json
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from openai import OpenAI

from app.config import settings


@dataclass
class EquipmentSpec:
    """Parsed equipment specification from P&ID title block."""
    tag: str  # e.g., "F-715", "V-745", "E-742 (Shell)", "E-742 (Tube)"
    description: str  # e.g., "PARTICULATE FILTER SEPARATOR"
    part: Optional[str] = None  # e.g., "Shell", "Tube", "A", "B" for sub-components
    operating_pressure: Optional[float] = None  # psig
    design_pressure: Optional[float] = None  # psig
    design_temperature: Optional[float] = None  # °F
    max_temperature: Optional[float] = None  # Max operating temp °F
    min_temperature: Optional[float] = None  # Min operating temp °F (MDMT)
    mdmt: Optional[float] = None  # Minimum Design Metal Temperature °F
    mdmt_pressure: Optional[float] = None  # Pressure at MDMT
    size: Optional[str] = None
    capacity: Optional[str] = None
    additional_specs: Optional[Dict] = None  # Any other specs found
    raw_text: str = ""  # Original text for debugging


class EquipmentSpecExtractor:
    """
    Extracts equipment specifications from P&ID using LLM.

    Instead of brittle regex patterns, we:
    1. Get all OCR text with positions
    2. Send to LLM to intelligently group and parse
    3. LLM understands context and handles OCR errors
    """

    def __init__(self):
        self.client = None
        if settings.OPENAI_API_KEY:
            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def extract_from_text_elements(
        self,
        text_elements: List[Dict],
        page_number: int = 1
    ) -> List[EquipmentSpec]:
        """
        Extract equipment specifications using LLM.

        Args:
            text_elements: OCR results with text, bbox, center positions
            page_number: Page to process

        Returns:
            List of EquipmentSpec objects
        """
        if not text_elements:
            return []

        # Filter text for this page
        page_text = [t for t in text_elements if t.get("page_number", 1) == page_number]

        if not page_text:
            return []

        # If no LLM configured, return empty
        if not self.client:
            print(f"[SpecExtractor] No OpenAI API key configured, skipping LLM extraction")
            return []

        # Format text with positions for LLM
        formatted_text = self._format_text_for_llm(page_text)

        # Call LLM to extract specs
        specs = self._llm_extract_specs(formatted_text, page_number)

        print(f"[SpecExtractor] Page {page_number}: LLM extracted {len(specs)} equipment specs")
        return specs

    def _format_text_for_llm(self, text_elements: List[Dict]) -> str:
        """
        Format OCR text with positions for LLM processing.

        Groups text by vertical position to help LLM understand layout.
        """
        # Sort by Y position (top to bottom), then X (left to right)
        sorted_text = sorted(
            text_elements,
            key=lambda t: (t.get("bbox", (0, 0, 0, 0))[1], t.get("bbox", (0, 0, 0, 0))[0])
        )

        lines = []
        for t in sorted_text:
            text = t.get("text", "").strip()
            if not text:
                continue

            bbox = t.get("bbox", (0, 0, 0, 0))
            x, y, w, h = bbox

            # Include position info to help LLM group related text
            lines.append(f"[y={y}, x={x}] {text}")

        return "\n".join(lines)

    def _llm_extract_specs(self, formatted_text: str, page_number: int) -> List[EquipmentSpec]:
        """Use LLM to extract equipment specifications from OCR text."""

        prompt = f"""Extract equipment specs from P&ID OCR text. Text at similar Y positions belongs together.

Rules:
- Sub-parts (Shell/Tube, A/B) = separate entries
- Extract: tag, part, description, design_pressure (psig), design_temperature (°F), min/max_temperature

Example input:
[y=100] E-742 EXCHANGER
[y=120] SHELL: 300 PSIG @ 375°F
[y=140] TUBE: 300 PSIG @ 250°F

Example output:
{{"equipment": [
  {{"tag": "E-742", "part": "Shell", "description": "EXCHANGER", "design_pressure": 300, "design_temperature": 375}},
  {{"tag": "E-742", "part": "Tube", "description": "EXCHANGER", "design_pressure": 300, "design_temperature": 250}}
]}}

OCR TEXT (page {page_number}):
{formatted_text}

Return JSON: {{"equipment": [...]}}"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-5-nano",
                messages=[
                    {
                        "role": "system",
                        "content": "P&ID parser. Return only JSON."
                    },
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                reasoning={"effort": "minimal"}
            )

            result_text = response.choices[0].message.content
            result = json.loads(result_text)

            # Parse results into EquipmentSpec objects
            specs = []
            for item in result.get("equipment", []):
                if not item.get("tag"):
                    continue

                # Build tag with part suffix if present
                tag = item.get("tag", "").upper().replace(" ", "-")
                part = item.get("part")

                spec = EquipmentSpec(
                    tag=tag,
                    description=item.get("description", ""),
                    part=part,
                    operating_pressure=self._parse_float(item.get("operating_pressure")),
                    design_pressure=self._parse_float(item.get("design_pressure")),
                    design_temperature=self._parse_float(item.get("design_temperature")),
                    max_temperature=self._parse_float(item.get("max_temperature")),
                    min_temperature=self._parse_float(item.get("min_temperature")),
                    mdmt=self._parse_float(item.get("mdmt") or item.get("min_temperature")),
                    mdmt_pressure=self._parse_float(item.get("mdmt_pressure")),
                    size=item.get("size"),
                    capacity=item.get("capacity"),
                    additional_specs=item.get("additional_specs"),
                    raw_text=str(item)
                )
                specs.append(spec)

            return specs

        except Exception as e:
            print(f"[SpecExtractor] LLM extraction error: {e}")
            return []

    def _parse_float(self, value) -> Optional[float]:
        """Safely parse a value to float."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def specs_to_dict(self, specs: List[EquipmentSpec]) -> List[Dict]:
        """Convert list of EquipmentSpec to JSON-serializable dicts."""
        return [asdict(spec) for spec in specs]


# Singleton instance
equipment_spec_extractor = EquipmentSpecExtractor()
