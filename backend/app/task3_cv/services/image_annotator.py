# Image Annotator Service - Draws bounding boxes and labels on P&ID images
import cv2
import numpy as np
from typing import List, Dict, Tuple
import base64


class ImageAnnotator:
    """
    Annotates P&ID images with detection results.

    Draws bounding boxes around detected components and text,
    with labels indicating what each item is.
    """

    # Color palette for different component types (BGR format)
    COMPONENT_COLORS = {
        "valve": (0, 0, 255),        # Red
        "gate-valve": (0, 0, 255),   # Red
        "needle-valve": (0, 0, 200), # Dark Red
        "bleed-valve": (0, 0, 180),  # Darker Red
        "pump": (255, 0, 0),         # Blue
        "tank": (0, 255, 0),         # Green
        "heat_exchanger": (0, 165, 255),  # Orange
        "exchanger": (0, 165, 255),  # Orange
        "filter": (255, 255, 0),     # Cyan
        "sensor": (255, 0, 255),     # Magenta
        "compressor": (128, 0, 128), # Purple
        "cooler": (255, 200, 0),     # Light Blue
        "coil": (200, 200, 0),       # Teal
        "tundish": (0, 200, 200),    # Yellow-ish
        "motor": (128, 128, 255),    # Light Red
        "unknown": (128, 128, 128),  # Gray
    }

    # Colors for text types
    TEXT_COLORS = {
        "tag": (0, 255, 255),        # Yellow - equipment tags
        "pressure": (255, 128, 0),   # Light Blue - pressure values
        "temperature": (0, 128, 255), # Orange - temperature values
        "other": (200, 200, 200),    # Light Gray - other text
    }

    def __init__(self):
        self.font = cv2.FONT_HERSHEY_SIMPLEX
        self.font_scale = 0.5
        self.thickness = 2

    def annotate_image(
        self,
        image: np.ndarray,
        components: List[Dict],
        text_elements: List[Dict] = None,
        lines: List[Dict] = None,
        draw_lines: bool = True
    ) -> np.ndarray:
        """
        Annotate image with detected components, text, and lines.

        Args:
            image: Original image (BGR)
            components: List of detected components with bbox, type, tag
            text_elements: List of OCR text elements with bbox, type, text
            lines: List of detected lines
            draw_lines: Whether to draw detected pipe lines

        Returns:
            Annotated image
        """
        # Make a copy to avoid modifying original
        annotated = image.copy()

        # Draw lines first (so they're behind other annotations)
        if draw_lines and lines:
            annotated = self._draw_lines(annotated, lines)

        # Draw text elements
        if text_elements:
            annotated = self._draw_text_elements(annotated, text_elements)

        # Draw components (on top)
        annotated = self._draw_components(annotated, components)

        return annotated

    def _draw_components(
        self,
        image: np.ndarray,
        components: List[Dict]
    ) -> np.ndarray:
        """Draw bounding boxes and labels for components."""
        for comp in components:
            bbox = comp.get("bbox", (0, 0, 0, 0))
            x, y, w, h = bbox

            # Get component type and color
            comp_type = comp.get("type", "unknown").lower()
            # Find matching color (check for partial matches)
            color = self.COMPONENT_COLORS.get("unknown")
            for key, c in self.COMPONENT_COLORS.items():
                if key in comp_type or comp_type in key:
                    color = c
                    break

            # Draw bounding box
            cv2.rectangle(image, (x, y), (x + w, y + h), color, 2)

            # Prepare label text
            tag = comp.get("tag", "")
            confidence = comp.get("confidence", 0)

            if tag:
                label = f"{tag} ({comp_type})"
            else:
                label = f"{comp_type} {confidence:.0%}"

            # Draw label background
            (label_w, label_h), baseline = cv2.getTextSize(
                label, self.font, self.font_scale, self.thickness
            )

            # Position label above the box
            label_y = max(y - 5, label_h + 5)

            # Draw background rectangle for label
            cv2.rectangle(
                image,
                (x, label_y - label_h - 5),
                (x + label_w + 5, label_y + 5),
                color,
                -1  # Filled
            )

            # Draw label text (white on colored background)
            cv2.putText(
                image,
                label,
                (x + 2, label_y),
                self.font,
                self.font_scale,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )

            # If there's pressure/temperature, draw it below
            extra_info = []
            if comp.get("pressure"):
                extra_info.append(f"P: {comp['pressure']}")
            if comp.get("temperature"):
                extra_info.append(f"T: {comp['temperature']}")

            if extra_info:
                info_text = " | ".join(extra_info)
                cv2.putText(
                    image,
                    info_text,
                    (x, y + h + 15),
                    self.font,
                    self.font_scale * 0.8,
                    color,
                    1,
                    cv2.LINE_AA
                )

        return image

    def _draw_text_elements(
        self,
        image: np.ndarray,
        text_elements: List[Dict]
    ) -> np.ndarray:
        """Draw bounding boxes around detected text."""
        for text in text_elements:
            bbox = text.get("bbox", (0, 0, 0, 0))
            x, y, w, h = bbox

            text_type = text.get("type", "other")
            color = self.TEXT_COLORS.get(text_type, self.TEXT_COLORS["other"])

            # Draw thin rectangle around text
            cv2.rectangle(image, (x, y), (x + w, y + h), color, 1)

        return image

    def _draw_lines(
        self,
        image: np.ndarray,
        lines: List[Dict]
    ) -> np.ndarray:
        """Draw detected pipe lines."""
        for line in lines:
            start = line.get("start", (0, 0))
            end = line.get("end", (0, 0))

            # Draw line in green with some transparency effect
            cv2.line(image, start, end, (0, 200, 0), 1, cv2.LINE_AA)

        return image

    def create_legend(self, width: int = 300, height: int = 400) -> np.ndarray:
        """Create a legend image showing color codes."""
        legend = np.ones((height, width, 3), dtype=np.uint8) * 255

        y_offset = 30
        cv2.putText(legend, "COMPONENTS", (10, y_offset), self.font, 0.6, (0, 0, 0), 2)
        y_offset += 25

        for comp_type, color in list(self.COMPONENT_COLORS.items())[:10]:
            cv2.rectangle(legend, (10, y_offset - 12), (25, y_offset + 3), color, -1)
            cv2.putText(legend, comp_type, (35, y_offset), self.font, 0.4, (0, 0, 0), 1)
            y_offset += 20

        y_offset += 20
        cv2.putText(legend, "TEXT TYPES", (10, y_offset), self.font, 0.6, (0, 0, 0), 2)
        y_offset += 25

        for text_type, color in self.TEXT_COLORS.items():
            cv2.rectangle(legend, (10, y_offset - 12), (25, y_offset + 3), color, -1)
            cv2.putText(legend, text_type, (35, y_offset), self.font, 0.4, (0, 0, 0), 1)
            y_offset += 20

        return legend

    def image_to_base64(self, image: np.ndarray) -> str:
        """Convert image to base64 string for frontend display."""
        _, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return base64.b64encode(buffer).decode('utf-8')

    def annotate_and_encode(
        self,
        image: np.ndarray,
        components: List[Dict],
        text_elements: List[Dict] = None,
        lines: List[Dict] = None
    ) -> Dict:
        """
        Annotate image and return base64 encoded result with metadata.

        Returns:
            Dict with annotated_image (base64), component_count, text_count
        """
        annotated = self.annotate_image(image, components, text_elements, lines)

        return {
            "annotated_image": self.image_to_base64(annotated),
            "component_count": len(components),
            "text_count": len(text_elements) if text_elements else 0,
            "width": image.shape[1],
            "height": image.shape[0],
        }


# Singleton instance
image_annotator = ImageAnnotator()
