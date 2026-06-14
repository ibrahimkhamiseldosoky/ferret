from datetime import datetime, timezone
from typing import Optional
from app.core.database import get_supabase


def create_repository(name: str, file_count: int, language: Optional[str] = None) -> str:
    supabase = get_supabase()
    data = {"name": name, "file_count": file_count, "language": language}
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


def list_repositories() -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("repositories").select("*").order("created_at", desc=True).execute()
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
