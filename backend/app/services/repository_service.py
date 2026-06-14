from datetime import datetime, timezone
from typing import Optional
from app.core.database import get_supabase


def create_repository(name: str, file_count: int, language: Optional[str] = None, user_id: Optional[str] = None) -> str:
    supabase = get_supabase()
    data = {"name": name, "file_count": file_count, "language": language}
    if user_id:
        data["user_id"] = user_id
    result = supabase.table("repositories").insert(data).execute()
    if result.data:
        return result.data[0]["id"]
    raise Exception("Failed to create repository")


def get_repository(repository_id: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("repositories").select("*").eq("id", repository_id).execute()
    if result.data:
        return result.data[0]
    return None


def get_user_repository(repository_id: str, user_id: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("repositories").select("*").eq("id", repository_id).eq("user_id", user_id).execute()
    if result.data:
        return result.data[0]
    return None


def list_repositories(user_id: Optional[str] = None) -> list[dict]:
    supabase = get_supabase()
    query = supabase.table("repositories").select("*")
    if user_id:
        query = query.eq("user_id", user_id)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


def update_status(repository_id: str, status: str) -> None:
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("repositories").update({"status": status, "updated_at": now}).eq("id", repository_id).execute()


def update_repository(repository_id: str, data: dict) -> None:
    supabase = get_supabase()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    supabase.table("repositories").update(data).eq("id", repository_id).execute()


def delete_repository(repository_id: str) -> None:
    supabase = get_supabase()
    supabase.table("nodes").delete().eq("repository_id", repository_id).execute()
    supabase.table("edges").delete().eq("repository_id", repository_id).execute()
    supabase.table("repositories").delete().eq("id", repository_id).execute()
