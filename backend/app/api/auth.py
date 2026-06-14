from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.services.auth_service import (
    register_user,
    authenticate_user,
    get_user_by_id,
    add_waitlist,
    verify_token,
)
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class WaitlistRequest(BaseModel):
    email: str


class UserResponse(BaseModel):
    id: str
    email: str
    reward_key: str
    created_at: str | None = None


@router.post("/signup")
async def signup(request: SignupRequest):
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    try:
        result = register_user(request.email, request.password)
        return result
    except ValueError as e:
        if str(e) == "Beta full":
            raise HTTPException(status_code=403, detail="Beta full")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        if "duplicate key" in str(e).lower():
            raise HTTPException(status_code=409, detail="Email already registered")
        logger = __import__("logging").getLogger(__name__)
        logger.error("Signup error: %s", e)
        raise HTTPException(status_code=500, detail="Registration failed")


@router.post("/login")
async def login(request: LoginRequest):
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    result = authenticate_user(request.email, request.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return result


@router.post("/waitlist")
async def waitlist(request: WaitlistRequest):
    if not request.email:
        raise HTTPException(status_code=400, detail="Email required")
    ok = add_waitlist(request.email)
    if ok:
        return {"detail": "Added to waitlist"}
    raise HTTPException(status_code=409, detail="Email already on waitlist")


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(**user)
