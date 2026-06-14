from fastapi import APIRouter, Depends, HTTPException
from backend.database import db
from backend.models import User

router = APIRouter(prefix="/api/users", tags=["users"])


def get_current_user(token: str = Depends()):
    user = db.table("users").select("*").eq("id", token).execute()
    if not user.data:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user.data[0]


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    return user


@router.get("/")
async def list_users():
    return db.table("users").select("*").execute()


@router.get("/{user_id}")
async def get_user(user_id: str):
    user = db.table("users").select("*").eq("id", user_id).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="User not found")
    return user.data[0]
