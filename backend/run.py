#!/usr/bin/env python3
"""Run the Regulatory Compliance API server."""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    print("Starting Regulatory Compliance API...")
    print(f"Server running at http://{settings.HOST}:{settings.PORT}")
    print(f"API documentation at http://{settings.HOST}:{settings.PORT}/docs")

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
