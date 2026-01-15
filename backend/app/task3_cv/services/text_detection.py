# Text Detection Service using Google Cloud Vision API
# Falls back to Tesseract if Google Cloud Vision is not configured
import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
import re
import base64
import requests

from app.config import settings

# Try to import Google Cloud Vision
try:
    from google.cloud import vision
    GOOGLE_VISION_AVAILABLE = True
except ImportError:
    GOOGLE_VISION_AVAILABLE = False

# Fallback to Tesseract
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


class TextDetectionService:
    """
    High-quality text detection for P&ID diagrams.

    Uses Google Cloud Vision API for best results, with Tesseract fallback.
    Returns text with bounding boxes for:
    - Equipment tags (F-715, V-745, E-742)
    - Pressure values (275 psig)
    - Temperature values (100°F)
    - Other labels
    """

    # Pattern to match equipment tags
    TAG_PATTERN = re.compile(r'^[A-Z]{1,3}-?\d{2,4}[A-Z]?$')
    # Pattern for pressure values
    PRESSURE_PATTERN = re.compile(r'(\d+\.?\d*)\s*(psig?|psi|bar|kpa|mpa)', re.IGNORECASE)
    # Pattern for temperature values
    TEMP_PATTERN = re.compile(r'(-?\d+\.?\d*)\s*[°]?\s*(F|C|°F|°C|fahrenheit|celsius)', re.IGNORECASE)

    def __init__(self):
        self.vision_client = None
        self._init_clients()

    def _init_clients(self):
        """Initialize API clients."""
        if GOOGLE_VISION_AVAILABLE and settings.GOOGLE_CLOUD_API_KEY:
            try:
                # For API key authentication
                self.vision_client = vision.ImageAnnotatorClient(
                    client_options={"api_key": settings.GOOGLE_CLOUD_API_KEY}
                )
                print("[TextDetection] Google Cloud Vision API configured")
            except Exception as e:
                print(f"[TextDetection] Failed to init Google Vision: {e}")
                self.vision_client = None
        else:
            if TESSERACT_AVAILABLE:
                print("[TextDetection] Using Tesseract OCR fallback")
            else:
                print("[TextDetection] No OCR available!")

    def detect_text(self, image: np.ndarray) -> List[Dict]:
        """
        Detect all text in image with bounding boxes.

        Returns list of text elements with:
        - text: The detected text string
        - bbox: (x, y, width, height) in pixels
        - center: (cx, cy) center point
        - confidence: Detection confidence
        - text_type: 'tag', 'pressure', 'temperature', or 'other'
        """
        if self.vision_client:
            return self._detect_with_google_vision(image)
        elif TESSERACT_AVAILABLE:
            return self._detect_with_tesseract(image)
        else:
            print("[TextDetection] No OCR service available")
            return []

    def _detect_with_google_vision(self, image: np.ndarray) -> List[Dict]:
        """Detect text using Google Cloud Vision API."""
        text_elements = []

        try:
            # Encode image to bytes
            _, buffer = cv2.imencode('.png', image)
            content = buffer.tobytes()

            # Create vision image
            vision_image = vision.Image(content=content)

            # Perform text detection
            response = self.vision_client.text_detection(image=vision_image)

            if response.error.message:
                print(f"[TextDetection] Google Vision error: {response.error.message}")
                return []

            # Process annotations (skip first one which is full text)
            annotations = response.text_annotations[1:] if response.text_annotations else []

            print(f"[TextDetection] Google Vision found {len(annotations)} text elements")

            for annotation in annotations:
                text = annotation.description.strip()
                if not text:
                    continue

                # Get bounding box vertices
                vertices = annotation.bounding_poly.vertices
                x_coords = [v.x for v in vertices]
                y_coords = [v.y for v in vertices]

                x = min(x_coords)
                y = min(y_coords)
                w = max(x_coords) - x
                h = max(y_coords) - y

                # Classify text type
                text_type = self._classify_text(text)

                text_elements.append({
                    "text": text,
                    "bbox": (x, y, w, h),
                    "center": (x + w // 2, y + h // 2),
                    "confidence": 0.95,  # Google Vision doesn't return confidence for individual words
                    "text_type": text_type,
                })

        except Exception as e:
            print(f"[TextDetection] Google Vision error: {e}")
            import traceback
            traceback.print_exc()

        return text_elements

    def _detect_with_tesseract(self, image: np.ndarray) -> List[Dict]:
        """Detect text using Tesseract OCR (fallback)."""
        text_elements = []

        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image

            # Enhance image for OCR
            # Apply adaptive thresholding
            enhanced = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )

            # Get OCR data with bounding boxes
            ocr_data = pytesseract.image_to_data(
                enhanced,
                output_type=pytesseract.Output.DICT,
                config='--psm 11 --oem 3'
            )

            n_boxes = len(ocr_data['text'])
            for i in range(n_boxes):
                text = ocr_data['text'][i].strip()
                conf = int(ocr_data['conf'][i])

                # Skip empty or very low confidence
                if not text or conf < 30:
                    continue

                x = ocr_data['left'][i]
                y = ocr_data['top'][i]
                w = ocr_data['width'][i]
                h = ocr_data['height'][i]

                text_type = self._classify_text(text)

                text_elements.append({
                    "text": text,
                    "bbox": (x, y, w, h),
                    "center": (x + w // 2, y + h // 2),
                    "confidence": conf / 100.0,
                    "text_type": text_type,
                })

            print(f"[TextDetection] Tesseract found {len(text_elements)} text elements")

        except Exception as e:
            print(f"[TextDetection] Tesseract error: {e}")

        return text_elements

    def _classify_text(self, text: str) -> str:
        """Classify text as tag, pressure, temperature, or other."""
        text_clean = text.strip().upper()

        # Check for equipment tag pattern
        if self.TAG_PATTERN.match(text_clean):
            return "tag"

        # Check for pressure value
        if self.PRESSURE_PATTERN.search(text):
            return "pressure"

        # Check for temperature value
        if self.TEMP_PATTERN.search(text):
            return "temperature"

        return "other"

    def associate_text_with_symbols(
        self,
        text_elements: List[Dict],
        symbols: List[Dict],
        max_distance: int = 150
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Associate detected text with symbols based on proximity.

        Priority:
        1. Text contained within symbol bounding box
        2. Text closest to symbol center

        Returns:
        - Updated symbols with associated text (tag, label, pressure, temp)
        - Remaining unassociated text elements
        """
        # Track which text has been associated
        used_text_indices = set()

        for symbol in symbols:
            sx, sy, sw, sh = symbol["bbox"]
            scx, scy = symbol["center"]

            # Find text contained within symbol
            contained_texts = []
            for i, text in enumerate(text_elements):
                if i in used_text_indices:
                    continue

                tx, ty, tw, th = text["bbox"]
                tcx, tcy = text["center"]

                # Check if text center is within symbol bbox (with padding)
                padding = 10
                if (sx - padding <= tcx <= sx + sw + padding and
                    sy - padding <= tcy <= sy + sh + padding):
                    contained_texts.append((i, text, 0))  # Distance 0 for contained
                else:
                    # Calculate distance
                    dist = np.sqrt((scx - tcx) ** 2 + (scy - tcy) ** 2)
                    if dist < max_distance:
                        contained_texts.append((i, text, dist))

            # Sort by distance and assign
            contained_texts.sort(key=lambda x: x[2])

            for idx, text, dist in contained_texts:
                if idx in used_text_indices:
                    continue

                text_type = text["text_type"]
                text_value = text["text"]

                if text_type == "tag" and not symbol.get("tag"):
                    symbol["tag"] = text_value.upper()
                    used_text_indices.add(idx)
                elif text_type == "pressure" and not symbol.get("pressure"):
                    symbol["pressure"] = text_value
                    used_text_indices.add(idx)
                elif text_type == "temperature" and not symbol.get("temperature"):
                    symbol["temperature"] = text_value
                    used_text_indices.add(idx)
                elif text_type == "other" and not symbol.get("label"):
                    symbol["label"] = text_value
                    used_text_indices.add(idx)

        # Return unassociated text
        unassociated = [t for i, t in enumerate(text_elements) if i not in used_text_indices]

        return symbols, unassociated


# Singleton instance
text_detection_service = TextDetectionService()
