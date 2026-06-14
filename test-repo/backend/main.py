from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.auth import router as auth_router
from backend.users import router as users_router
from backend.database import db

app = FastAPI(title="My App")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
