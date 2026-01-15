# Line Detection Service for P&ID Diagrams
# Based on Azure P&ID digitization approach:
# 1. Remove symbols and text from image
# 2. Apply binarization and optional thinning
# 3. Use Hough Transform to detect lines
import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional


class LineDetectionService:
    """
    Detects pipe lines in P&ID diagrams.

    Key insight from Azure approach: Remove symbols and text BEFORE
    detecting lines. This greatly reduces noise and improves accuracy.
    """

    def __init__(
        self,
        hough_rho: float = 1.0,
        hough_theta: float = np.pi / 180,
        hough_threshold: int = 50,
        min_line_length: int = 30,
        max_line_gap: int = 10,
        enable_thinning: bool = True
    ):
        self.hough_rho = hough_rho
        self.hough_theta = hough_theta
        self.hough_threshold = hough_threshold
        self.min_line_length = min_line_length
        self.max_line_gap = max_line_gap
        self.enable_thinning = enable_thinning

    def detect_lines(
        self,
        image: np.ndarray,
        symbols: List[Dict] = None,
        text_elements: List[Dict] = None
    ) -> List[Dict]:
        """
        Detect line segments in P&ID image.

        Args:
            image: Original image (BGR or grayscale)
            symbols: List of detected symbols with bbox to mask out
            text_elements: List of detected text with bbox to mask out

        Returns:
            List of line segments with start/end coordinates
        """
        # Step 1: Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        height, width = gray.shape[:2]

        # Step 2: Create mask and remove symbols/text
        cleaned = self._mask_symbols_and_text(gray, symbols, text_elements)

        # Step 3: Binarize using OTSU thresholding
        _, binary = cv2.threshold(cleaned, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Step 4: Optional thinning (Zhang-Suen algorithm)
        if self.enable_thinning:
            binary = self._thin_image(binary)

        # Step 5: Detect lines using Hough Transform
        lines = cv2.HoughLinesP(
            binary,
            rho=self.hough_rho,
            theta=self.hough_theta,
            threshold=self.hough_threshold,
            minLineLength=self.min_line_length,
            maxLineGap=self.max_line_gap
        )

        # Convert to our format
        line_segments = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]

                # Calculate length
                length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

                # Determine line type (horizontal, vertical, diagonal)
                angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
                if abs(angle) < 10 or abs(angle) > 170:
                    line_type = "horizontal"
                elif 80 < abs(angle) < 100:
                    line_type = "vertical"
                else:
                    line_type = "diagonal"

                line_segments.append({
                    "start": (int(x1), int(y1)),
                    "end": (int(x2), int(y2)),
                    "length": float(length),
                    "angle": float(angle),
                    "type": line_type,
                    # Normalized coordinates (0-1)
                    "start_norm": (x1 / width, y1 / height),
                    "end_norm": (x2 / width, y2 / height),
                })

        print(f"[LineDetection] Detected {len(line_segments)} line segments")
        return line_segments

    def _mask_symbols_and_text(
        self,
        gray: np.ndarray,
        symbols: List[Dict] = None,
        text_elements: List[Dict] = None
    ) -> np.ndarray:
        """
        Mask out symbols and text from image.

        Fills the bounding box regions with the estimated background color.
        """
        result = gray.copy()

        # Estimate background color using histogram
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        background_color = int(np.argmax(hist))

        # Mask symbols
        if symbols:
            for symbol in symbols:
                bbox = symbol.get("bbox", (0, 0, 0, 0))
                x, y, w, h = bbox

                # Add padding
                padding = 5
                x1 = max(0, x - padding)
                y1 = max(0, y - padding)
                x2 = min(gray.shape[1], x + w + padding)
                y2 = min(gray.shape[0], y + h + padding)

                # Fill with background color
                result[y1:y2, x1:x2] = background_color

        # Mask text
        if text_elements:
            for text in text_elements:
                bbox = text.get("bbox", (0, 0, 0, 0))
                x, y, w, h = bbox

                # Add padding
                padding = 3
                x1 = max(0, x - padding)
                y1 = max(0, y - padding)
                x2 = min(gray.shape[1], x + w + padding)
                y2 = min(gray.shape[0], y + h + padding)

                # Fill with background color
                result[y1:y2, x1:x2] = background_color

        return result

    def _thin_image(self, binary: np.ndarray) -> np.ndarray:
        """
        Apply morphological thinning (Zhang-Suen algorithm).

        Reduces lines to single pixel width for better detection.
        """
        # OpenCV's thinning function
        try:
            thinned = cv2.ximgproc.thinning(binary, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN)
            return thinned
        except AttributeError:
            # Fallback if ximgproc not available - use morphological skeleton
            element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
            skeleton = np.zeros(binary.shape, np.uint8)
            temp = binary.copy()

            while True:
                eroded = cv2.erode(temp, element)
                opened = cv2.dilate(eroded, element)
                temp_diff = cv2.subtract(temp, opened)
                skeleton = cv2.bitwise_or(skeleton, temp_diff)
                temp = eroded.copy()

                if cv2.countNonZero(temp) == 0:
                    break

            return skeleton

    def merge_collinear_lines(
        self,
        lines: List[Dict],
        angle_threshold: float = 5.0,
        gap_threshold: float = 20.0
    ) -> List[Dict]:
        """
        Merge line segments that are collinear and close together.

        This helps reconstruct broken lines.
        """
        if not lines:
            return []

        merged = []
        used = set()

        for i, line1 in enumerate(lines):
            if i in used:
                continue

            current = line1.copy()
            used.add(i)

            # Try to merge with other lines
            for j, line2 in enumerate(lines):
                if j in used or j == i:
                    continue

                # Check if angles are similar
                angle_diff = abs(current["angle"] - line2["angle"])
                if angle_diff > 180:
                    angle_diff = 360 - angle_diff

                if angle_diff > angle_threshold:
                    continue

                # Check if endpoints are close
                min_gap = self._min_endpoint_gap(current, line2)
                if min_gap > gap_threshold:
                    continue

                # Merge: extend current line to include line2
                current = self._merge_two_lines(current, line2)
                used.add(j)

            merged.append(current)

        print(f"[LineDetection] Merged {len(lines)} lines into {len(merged)}")
        return merged

    def _min_endpoint_gap(self, line1: Dict, line2: Dict) -> float:
        """Calculate minimum distance between endpoints of two lines."""
        s1, e1 = np.array(line1["start"]), np.array(line1["end"])
        s2, e2 = np.array(line2["start"]), np.array(line2["end"])

        gaps = [
            np.linalg.norm(s1 - s2),
            np.linalg.norm(s1 - e2),
            np.linalg.norm(e1 - s2),
            np.linalg.norm(e1 - e2),
        ]
        return min(gaps)

    def _merge_two_lines(self, line1: Dict, line2: Dict) -> Dict:
        """Merge two lines into one by finding extreme endpoints."""
        points = [
            np.array(line1["start"]),
            np.array(line1["end"]),
            np.array(line2["start"]),
            np.array(line2["end"]),
        ]

        # Find the two points that are farthest apart
        max_dist = 0
        best_pair = (0, 1)
        for i in range(4):
            for j in range(i + 1, 4):
                dist = np.linalg.norm(points[i] - points[j])
                if dist > max_dist:
                    max_dist = dist
                    best_pair = (i, j)

        start = tuple(points[best_pair[0]].astype(int))
        end = tuple(points[best_pair[1]].astype(int))

        # Calculate new properties
        x1, y1 = start
        x2, y2 = end
        length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))

        if abs(angle) < 10 or abs(angle) > 170:
            line_type = "horizontal"
        elif 80 < abs(angle) < 100:
            line_type = "vertical"
        else:
            line_type = "diagonal"

        return {
            "start": start,
            "end": end,
            "length": float(length),
            "angle": float(angle),
            "type": line_type,
        }

    def create_debug_image(
        self,
        image: np.ndarray,
        lines: List[Dict],
        symbols: List[Dict] = None,
        text_elements: List[Dict] = None
    ) -> np.ndarray:
        """Create debug visualization showing detected lines."""
        if len(image.shape) == 2:
            debug = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            debug = image.copy()

        # Draw masked regions (symbols in blue, text in yellow)
        if symbols:
            for symbol in symbols:
                x, y, w, h = symbol.get("bbox", (0, 0, 0, 0))
                cv2.rectangle(debug, (x, y), (x + w, y + h), (255, 0, 0), 1)

        if text_elements:
            for text in text_elements:
                x, y, w, h = text.get("bbox", (0, 0, 0, 0))
                cv2.rectangle(debug, (x, y), (x + w, y + h), (0, 255, 255), 1)

        # Draw lines in green
        for line in lines:
            start = line["start"]
            end = line["end"]
            cv2.line(debug, start, end, (0, 255, 0), 2)

        return debug


# Singleton instance
line_detection_service = LineDetectionService()
