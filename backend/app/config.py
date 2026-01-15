# Configuration settings for the backend
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True

    # OpenAI API Key
    OPENAI_API_KEY: str = ""

    # Unstructured.io API Key (for PDF parsing)
    UNSTRUCTURED_API_KEY: str = ""

    # Supabase Configuration (REQUIRED - no local fallback)
    SUPABASE_URL: str = ""
    SUPABASE_SECRET_KEY: str = ""

    # File paths
    UPLOAD_DIR: str = "./data/uploads"
    MAX_UPLOAD_SIZE: int = 52428800  # 50MB
    REGULATIONS_DIR: str = "../data/regulations"
    SOP_DIR: str = "../data/sop"

    # Roboflow P&ID Detection (Task 3)
    ROBOFLOW_API_KEY: str = ""
    ROBOFLOW_MODEL_ID: str = "object-detection-p-id/2"

    # Google Cloud Vision API (for high-quality OCR)
    GOOGLE_CLOUD_API_KEY: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure upload directory exists
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
