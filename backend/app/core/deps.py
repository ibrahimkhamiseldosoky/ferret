from fastapi import Header, HTTPException
from app.core.config import settings


async def verify_api_key(x_api_key: str = Header(default=None)):
    if settings.ENVIRONMENT == "development":
        return True
    if x_api_key != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return True
