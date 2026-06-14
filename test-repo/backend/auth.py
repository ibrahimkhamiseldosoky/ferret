from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.database import db
from backend.models import User
from shared.utils import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str


@router.post("/login")
async def login(req: LoginRequest):
    user = db.table("users").select("*").eq("email", req.email).execute()
    if not user.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user.data[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": "mock-jwt-token", "user": user.data[0]}


@router.post("/register")
async def register(req: RegisterRequest):
    existing = db.table("users").select("*").eq("email", req.email).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already exists")
    password_hash = hash_password(req.password)
    user = User(name=req.name, email=req.email, password_hash=password_hash)
    result = db.table("users").insert(user.model_dump()).execute()
    return {"user": result.data[0]}
