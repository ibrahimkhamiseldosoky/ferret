from supabase import create_client
from shared.utils import get_config

config = get_config()
db = create_client(config["supabase_url"], config["supabase_key"])


def query_users():
    return db.table("users").select("*").execute()


def query_orders():
    return db.table("orders").select("*").execute()
