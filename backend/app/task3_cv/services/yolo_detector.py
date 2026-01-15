# P&ID Component Detector using Roboflow + OCR
# Uses Roboflow for symbol detection and Tesseract OCR for text extraction
import cv2
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import re
import base64
import requests

from app.config import settings

# Try to import pytesseract for OCR
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("[Detector] pytesseract not installed - OCR disabled")


class PIDComponentDetector:
    """
    Detects P&ID symbols and components using Roboflow + OCR.

    Workflow:
    1. Use Roboflow to detect component symbols (valves, pumps, etc.)
    2. Use OCR to extract all text with bounding boxes
    3. Match detected components with nearby text (equipment tags)
    4. Extract pressure/temperature annotations
    """

    # Pattern to match equipment tags like F-715, V-745, E-742, AC-746
    TAG_PATTERN = re.compile(r'^[A-Z]{1,3}-?\d{2,4}[A-Z]?$')
    # Pattern for pressure values
    PRESSURE_PATTERN = re.compile(r'(\d+\.?\d*)\s*(psig?|psi|bar|kpa)', re.IGNORECASE)
    # Pattern for temperature values
    TEMP_PATTERN = re.compile(r'(-?\d+\.?\d*)\s*[°]?\s*(F|C|°F|°C)', re.IGNORECASE)

    def __init__(self):
        self.roboflow_api_key = settings.ROBOFLOW_API_KEY
        self.model_id = settings.ROBOFLOW_MODEL_ID
        self.api_url = "https://detect.roboflow.com"
        self._init_roboflow()

    def _init_roboflow(self):
        """Initialize Roboflow API."""
        if self.roboflow_api_key:
            print(f"[Detector] Roboflow API configured with model: {self.model_id}")
        else:
            print("[Detector] ROBOFLOW_API_KEY not set - using traditional CV only")

        if TESSERACT_AVAILABLE:
            print("[Detector] Tesseract OCR available for text extraction")
        else:
            print("[Detector] Tesseract not available - tag extraction disabled")

    def detect_components(
        self,
        image: np.ndarray,
        preprocessed: Dict[str, np.ndarray],
        confidence_threshold: float = 0.25
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Detect all components in the P&ID image.

        Workflow:
        1. Use Roboflow to detect component symbols
        2. Use OCR to extract all text with bounding boxes
        3. Match components with nearby text (tags, pressure, temp)

        Returns:
            Tuple of (components, text_elements)
        """
        components = []

        # Step 1: Detect component symbols
        if self.roboflow_api_key:
            roboflow_components = self._detect_with_roboflow(image, confidence_threshold)
            components.extend(roboflow_components)
        else:
            cv_components = self._detect_with_traditional_cv(preprocessed)
            components.extend(cv_components)

        # Step 2: Extract all text with bounding boxes using OCR
        text_elements = []
        if TESSERACT_AVAILABLE:
            text_elements = self._extract_all_text(image)
            print(f"[Detector] OCR found {len(text_elements)} text elements")

        # Step 3: Match components with nearby text
        if text_elements:
            components = self._match_components_with_text(components, text_elements)

        # Remove duplicates and merge nearby detections
        components = self._merge_overlapping(components)

        return components, text_elements

    def _extract_all_text(self, image: np.ndarray) -> List[Dict]:
        """Extract all text from image with bounding boxes using OCR."""
        text_elements = []

        try:
            # Convert to grayscale if needed
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image

            # Enhance image for better OCR
            # Apply adaptive thresholding
            enhanced = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )

            # Get OCR data with bounding boxes
            ocr_data = pytesseract.image_to_data(
                enhanced,
                output_type=pytesseract.Output.DICT,
                config='--psm 11 --oem 3'  # Sparse text mode
            )

            n_boxes = len(ocr_data['text'])
            for i in range(n_boxes):
                text = ocr_data['text'][i].strip()
                conf = int(ocr_data['conf'][i])

                # Skip empty or low confidence text
                if not text or conf < 30:
                    continue

                x = ocr_data['left'][i]
                y = ocr_data['top'][i]
                w = ocr_data['width'][i]
                h = ocr_data['height'][i]

                # Classify text type
                text_type = self._classify_text(text)

                text_elements.append({
                    "text": text,
                    "type": text_type,
                    "bbox": (x, y, w, h),
                    "center": (x + w // 2, y + h // 2),
                    "confidence": conf / 100.0,
                })

        except Exception as e:
            print(f"[Detector] OCR error: {e}")

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

    def _match_components_with_text(
        self,
        components: List[Dict],
        text_elements: List[Dict]
    ) -> List[Dict]:
        """Match detected components with nearby text elements."""

        # Separate text by type
        tags = [t for t in text_elements if t["type"] == "tag"]
        pressures = [t for t in text_elements if t["type"] == "pressure"]
        temperatures = [t for t in text_elements if t["type"] == "temperature"]

        print(f"[Detector] Found {len(tags)} tags, {len(pressures)} pressures, {len(temperatures)} temps")

        for comp in components:
            comp_center = comp["center"]
            comp_bbox = comp["bbox"]

            # Find nearest tag
            nearest_tag = self._find_nearest_text(comp_center, comp_bbox, tags, max_distance=150)
            if nearest_tag:
                comp["tag"] = nearest_tag["text"].upper().strip()
                # Remove from list so it's not matched again
                tags = [t for t in tags if t != nearest_tag]

            # Find nearby pressure
            nearest_pressure = self._find_nearest_text(comp_center, comp_bbox, pressures, max_distance=100)
            if nearest_pressure:
                comp["pressure"] = nearest_pressure["text"]

            # Find nearby temperature
            nearest_temp = self._find_nearest_text(comp_center, comp_bbox, temperatures, max_distance=100)
            if nearest_temp:
                comp["temperature"] = nearest_temp["text"]

        return components

    def _find_nearest_text(
        self,
        comp_center: Tuple[int, int],
        comp_bbox: Tuple[int, int, int, int],
        text_elements: List[Dict],
        max_distance: int = 100
    ) -> Optional[Dict]:
        """Find the nearest text element to a component."""
        if not text_elements:
            return None

        min_dist = float("inf")
        nearest = None

        cx, cy = comp_center
        bx, by, bw, bh = comp_bbox

        for text in text_elements:
            tx, ty = text["center"]

            # Calculate distance from component center to text center
            dist = np.sqrt((cx - tx) ** 2 + (cy - ty) ** 2)

            # Prefer text that's near the component
            if dist < min_dist and dist < max_distance:
                min_dist = dist
                nearest = text

        return nearest

    def _detect_with_roboflow(
        self,
        image: np.ndarray,
        confidence_threshold: float
    ) -> List[Dict]:
        """Detect components using Roboflow hosted model via HTTP API."""
        components = []

        try:
            # Encode image to base64
            _, buffer = cv2.imencode('.jpg', image)
            img_base64 = base64.b64encode(buffer).decode('utf-8')

            # Build API URL
            # Format: https://detect.roboflow.com/{model_id}?api_key={api_key}
            url = f"{self.api_url}/{self.model_id}"
            params = {
                "api_key": self.roboflow_api_key,
                "confidence": int(confidence_threshold * 100),
            }

            # Make request with base64 image
            response = requests.post(
                url,
                params=params,
                data=img_base64,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            response.raise_for_status()
            result = response.json()

            # Parse predictions
            predictions = result.get('predictions', [])
            print(f"[Detector] Roboflow detected {len(predictions)} objects")

            for pred in predictions:
                confidence = pred.get('confidence', 0)
                if confidence < confidence_threshold:
                    continue

                # Get bounding box (Roboflow returns center x, y, width, height)
                cx = pred.get('x', 0)
                cy = pred.get('y', 0)
                w = pred.get('width', 0)
                h = pred.get('height', 0)

                # Convert to top-left x, y format
                x = int(cx - w / 2)
                y = int(cy - h / 2)
                w = int(w)
                h = int(h)

                # Get class name
                class_name = pred.get('class', 'unknown').lower()

                # Normalize class names to our standard types
                component_type = self._normalize_class_name(class_name)

                components.append({
                    "type": component_type,
                    "bbox": (x, y, w, h),
                    "center": (int(cx), int(cy)),
                    "area": w * h,
                    "confidence": confidence,
                    "detection_method": "roboflow",
                    "raw_class": class_name,
                })

        except Exception as e:
            print(f"[Detector] Roboflow inference error: {e}")
            # Don't fallback here - let the caller handle it

        return components

    def _normalize_class_name(self, class_name: str) -> str:
        """Normalize Roboflow class names to our standard component types."""
        # Map common P&ID class names to our standard types
        class_mapping = {
            # Valves
            "valve": "valve",
            "gate valve": "valve",
            "ball valve": "valve",
            "check valve": "valve",
            "control valve": "valve",
            "globe valve": "valve",
            "butterfly valve": "valve",
            "relief valve": "valve",
            "safety valve": "valve",
            # Pumps
            "pump": "pump",
            "centrifugal pump": "pump",
            "reciprocating pump": "pump",
            # Tanks/Vessels
            "tank": "tank",
            "vessel": "tank",
            "drum": "tank",
            "storage tank": "tank",
            # Heat exchangers
            "heat exchanger": "heat_exchanger",
            "exchanger": "heat_exchanger",
            "cooler": "heat_exchanger",
            "heater": "heat_exchanger",
            # Instruments/Sensors
            "sensor": "sensor",
            "transmitter": "sensor",
            "indicator": "sensor",
            "gauge": "sensor",
            "pressure gauge": "sensor",
            "temperature sensor": "sensor",
            "flow meter": "sensor",
            "level indicator": "sensor",
            # Other
            "compressor": "compressor",
            "filter": "filter",
            "motor": "motor",
            "reducer": "reducer",
            "pipe": "pipe",
            "line": "pipe",
        }

        class_lower = class_name.lower().strip()
        return class_mapping.get(class_lower, class_lower.replace(" ", "_"))

    def _detect_with_traditional_cv(
        self,
        preprocessed: Dict[str, np.ndarray]
    ) -> List[Dict]:
        """Fallback: Detect components using traditional CV methods."""
        components = []

        # Contour-based detection
        contour_components = self._detect_by_contours(preprocessed["cleaned"])
        components.extend(contour_components)

        # Circle detection (pumps, sensors)
        circle_components = self._detect_circles(preprocessed["gray"])
        components.extend(circle_components)

        # Rectangle detection (tanks, exchangers)
        rect_components = self._detect_rectangles(preprocessed["cleaned"])
        components.extend(rect_components)

        return components

    def _detect_by_contours(self, binary: np.ndarray) -> List[Dict]:
        """Detect components using contour analysis."""
        contours, _ = cv2.findContours(
            binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        components = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 100 or area > 50000:
                continue

            x, y, w, h = cv2.boundingRect(contour)
            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)

            component_type = self._classify_contour(approx, area, w, h)
            if component_type:
                components.append({
                    "type": component_type,
                    "bbox": (x, y, w, h),
                    "center": (x + w // 2, y + h // 2),
                    "area": int(area),
                    "vertices": len(approx),
                    "confidence": 0.5,
                    "detection_method": "contour",
                })

        return components

    def _classify_contour(
        self,
        approx: np.ndarray,
        area: float,
        w: int,
        h: int
    ) -> Optional[str]:
        """Classify component type based on contour properties."""
        vertices = len(approx)
        aspect_ratio = w / h if h > 0 else 1

        # Triangle-like (valves)
        if vertices == 3:
            return "valve"
        # Rectangle-like (tanks, panels)
        elif vertices == 4:
            if 0.3 < aspect_ratio < 3:
                return "tank" if area > 3000 else "panel"
        # Circle-like (pumps, sensors, meters)
        elif vertices > 6:
            perimeter = cv2.arcLength(approx, True)
            if perimeter > 0:
                circularity = 4 * np.pi * area / (perimeter ** 2)
                if circularity > 0.7:
                    if area > 2000:
                        return "pump"
                    elif area > 500:
                        return "sensor"
                    else:
                        return "meter"

        return None

    def _detect_circles(self, gray: np.ndarray) -> List[Dict]:
        """Detect circular components using Hough circles."""
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1,
            minDist=30,
            param1=50,
            param2=30,
            minRadius=10,
            maxRadius=100
        )

        components = []
        if circles is not None:
            circles = np.uint16(np.around(circles))
            for circle in circles[0, :]:
                x, y, r = circle
                area = np.pi * r * r

                component_type = "pump" if r > 30 else "sensor"
                components.append({
                    "type": component_type,
                    "bbox": (int(x - r), int(y - r), int(2 * r), int(2 * r)),
                    "center": (int(x), int(y)),
                    "radius": int(r),
                    "area": int(area),
                    "confidence": 0.6,
                    "detection_method": "hough_circles",
                })

        return components

    def _detect_rectangles(self, binary: np.ndarray) -> List[Dict]:
        """Detect rectangular components."""
        contours, _ = cv2.findContours(
            binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        components = []
        for contour in contours:
            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)

            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(contour)
                area = w * h

                if 2000 < area < 50000:
                    components.append({
                        "type": "tank",
                        "bbox": (x, y, w, h),
                        "center": (x + w // 2, y + h // 2),
                        "area": area,
                        "confidence": 0.5,
                        "detection_method": "rectangle",
                    })

        return components

    def _extract_labels(
        self,
        image: np.ndarray,
        components: List[Dict]
    ) -> List[Dict]:
        """Extract text labels near components using OCR."""
        if not TESSERACT_AVAILABLE:
            return components

        for component in components:
            x, y, w, h = component["bbox"]

            # Expand ROI for nearby labels
            padding = 50
            roi_x = max(0, x - padding)
            roi_y = max(0, y - padding)
            roi_w = min(image.shape[1] - roi_x, w + 2 * padding)
            roi_h = min(image.shape[0] - roi_y, h + 2 * padding)

            if roi_w <= 0 or roi_h <= 0:
                continue

            roi = image[roi_y:roi_y + roi_h, roi_x:roi_x + roi_w]

            try:
                text = pytesseract.image_to_string(
                    roi,
                    config='--psm 11 --oem 3'
                ).strip()

                if text:
                    component["label"] = text
                    # Extract tag number (e.g., V-101, P-203, HE-735)
                    tag_match = re.search(r'[A-Z]{1,3}-?\d{2,4}[A-Z]?', text)
                    if tag_match:
                        component["tag"] = tag_match.group().replace(' ', '')
            except Exception:
                pass

        return components

    def _merge_overlapping(
        self,
        components: List[Dict],
        iou_threshold: float = 0.5
    ) -> List[Dict]:
        """Merge overlapping component detections."""
        if not components:
            return []

        # Sort by confidence
        components = sorted(
            components,
            key=lambda x: x.get("confidence", 0),
            reverse=True
        )

        kept = []
        for comp in components:
            overlap = False
            for kept_comp in kept:
                iou = self._compute_iou(comp["bbox"], kept_comp["bbox"])
                if iou > iou_threshold:
                    overlap = True
                    break

            if not overlap:
                kept.append(comp)

        return kept

    def _compute_iou(
        self,
        box1: Tuple[int, int, int, int],
        box2: Tuple[int, int, int, int]
    ) -> float:
        """Compute Intersection over Union of two boxes."""
        x1, y1, w1, h1 = box1
        x2, y2, w2, h2 = box2

        # Intersection
        xi = max(x1, x2)
        yi = max(y1, y2)
        wi = min(x1 + w1, x2 + w2) - xi
        hi = min(y1 + h1, y2 + h2) - yi

        if wi <= 0 or hi <= 0:
            return 0

        intersection = wi * hi
        union = w1 * h1 + w2 * h2 - intersection

        return intersection / union if union > 0 else 0


# Singleton instance
yolo_detector = PIDComponentDetector()
