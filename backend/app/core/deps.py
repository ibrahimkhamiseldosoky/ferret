from fastapi import Header, HTTPException, Depends
from app.core.config import settings
from app.services.auth_service import verify_token, get_user_by_id


async def verify_api_key(x_api_key: str = Header(default=None)):
    if settings.ENVIRONMENT == "development":
        return True
    if x_api_key != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return True


async def get_current_user(authorization: str = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(authorization.replace("Bearer ", ""))
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
