# P&ID Processor Service - PDF to Image conversion and preprocessing
import fitz  # PyMuPDF
import cv2
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple
from PIL import Image
import io


class PIDProcessor:
    """Converts P&ID PDF to processable images with preprocessing."""

    def __init__(self, dpi: int = 300):
        self.dpi = dpi

    def pdf_to_images(self, pdf_path: str) -> List[np.ndarray]:
        """Convert PDF pages to images."""
        doc = fitz.open(pdf_path)
        images = []

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)

            # High resolution rendering
            zoom = self.dpi / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            # Convert to numpy array
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            img_array = np.array(img)

            # Convert to BGR for OpenCV
            if len(img_array.shape) == 3 and img_array.shape[2] == 4:
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
            elif len(img_array.shape) == 3:
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

            images.append(img_array)

        doc.close()
        return images

    def preprocess(self, image: np.ndarray) -> Dict[str, np.ndarray]:
        """Preprocess image for component detection."""
        # Grayscale conversion
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Noise reduction
        denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)

        # Adaptive thresholding for line detection
        binary = cv2.adaptiveThreshold(
            denoised, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11, 2
        )

        # Edge detection
        edges = cv2.Canny(denoised, 50, 150)

        # Morphological operations to clean up
        kernel = np.ones((3, 3), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)

        return {
            "original": image,
            "gray": gray,
            "binary": binary,
            "edges": edges,
            "cleaned": cleaned,
        }

    def detect_lines(self, edges: np.ndarray) -> List[Dict]:
        """Detect lines (pipes/connections) in the image."""
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=50,
            minLineLength=30,
            maxLineGap=10
        )

        detected_lines = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi

                detected_lines.append({
                    "start": (int(x1), int(y1)),
                    "end": (int(x2), int(y2)),
                    "length": float(length),
                    "angle": float(angle),
                    "type": self._classify_line(angle),
                })

        return detected_lines

    def _classify_line(self, angle: float) -> str:
        """Classify line type based on angle."""
        angle = abs(angle)
        if angle < 10 or angle > 170:
            return "horizontal"
        elif 80 < angle < 100:
            return "vertical"
        else:
            return "diagonal"


# Singleton instance
pid_processor = PIDProcessor()
