# Main FastAPI application
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.task2_regulation.routes import router as regulation_router
from app.task3_cv.routes import router as cv_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print("Starting up regulatory compliance API...")
    yield
    # Shutdown
    print("Shutting down...")


app = FastAPI(
    title="Regulatory Compliance API",
    description="API for regulatory document processing and SOP compliance analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(regulation_router, prefix="/api/regulation", tags=["regulation"])
app.include_router(cv_router, prefix="/api/cv", tags=["computer-vision"])


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "regulatory-compliance-api"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "llm_configured": bool(settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
