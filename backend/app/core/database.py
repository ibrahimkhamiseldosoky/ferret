from supabase import create_client, Client
from app.core.config import settings

client: Client | None = None


def get_supabase() -> Client:
    global client
    if client is None:
        client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return client
