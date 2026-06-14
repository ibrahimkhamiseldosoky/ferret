from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.repositories import router as repositories_router
from app.api.analysis import router as analysis_router
from app.api.questions import router as questions_router
from app.api.auth import router as auth_router

app = FastAPI(
    title="Ferret API",
    description="Repository analysis and architecture graphing backend",
    version="1.0.0",
)

origins = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repositories_router)
app.include_router(analysis_router)
app.include_router(questions_router)
app.include_router(auth_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
