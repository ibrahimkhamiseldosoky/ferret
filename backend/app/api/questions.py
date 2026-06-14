from fastapi import APIRouter, HTTPException, Depends
from app.core.deps import get_current_user
from app.models.repository import QuestionRequest
from app.services.question_service import answer_question
from app.services.repository_service import get_user_repository

router = APIRouter(prefix="/api/repositories", tags=["questions"])


@router.post("/{repository_id}/ask")
async def ask_question(repository_id: str, request: QuestionRequest, user: dict = Depends(get_current_user)):
    repo = get_user_repository(repository_id, user["id"])
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return answer_question(
        repository_id=repository_id,
        question=request.question,
        question_type=request.type,
    )
