import hashlib
import json
import os


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hash: str) -> bool:
    return hash_password(password) == hash


def get_config() -> dict:
    return {
        "supabase_url": os.getenv("SUPABASE_URL", "https://project.supabase.co"),
        "supabase_key": os.getenv("SUPABASE_KEY", "mock-key"),
        "jwt_secret": os.getenv("JWT_SECRET", "dev-secret"),
    }


def format_response(data: dict) -> str:
    return json.dumps(data, indent=2)
