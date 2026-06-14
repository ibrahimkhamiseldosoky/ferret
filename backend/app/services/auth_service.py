import logging
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
from jose import JWTError, jwt
from app.core.database import get_supabase
from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_USERS = 20


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


def get_user_count() -> int:
    supabase = get_supabase()
    result = supabase.table("users").select("id", count="exact").execute()
    return result.count or 0


def register_user(email: str, password: str) -> dict:
    count = get_user_count()
    if count >= MAX_USERS:
        raise ValueError("Beta full")

    hashed = hash_password(password)
    reward_key = str(uuid.uuid4())
    supabase = get_supabase()

    result = supabase.table("users").insert({
        "email": email,
        "password_hash": hashed,
        "reward_key": reward_key,
    }).execute()

    if not result.data:
        raise RuntimeError("Failed to create user")

    user = result.data[0]
    token = create_access_token(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "reward_key": user["reward_key"],
        },
    }


def authenticate_user(email: str, password: str) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("email", email).execute()
    if not result.data:
        return None

    user = result.data[0]
    if not verify_password(password, user["password_hash"]):
        return None

    token = create_access_token(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "reward_key": user["reward_key"],
        },
    }


def get_user_by_id(user_id: str) -> dict | None:
    supabase = get_supabase()
    result = supabase.table("users").select("id,email,reward_key,created_at").eq("id", user_id).execute()
    if not result.data:
        return None
    return result.data[0]


def add_waitlist(email: str) -> bool:
    supabase = get_supabase()
    try:
        supabase.table("waitlist").insert({"email": email}).execute()
        return True
    except Exception as e:
        logger.warning("Failed to add waitlist email %s: %s", email, e)
        return False
