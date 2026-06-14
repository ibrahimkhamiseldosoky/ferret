from fastapi import APIRouter
from app.models.repository import QuestionRequest
from app.services.question_service import answer_question

router = APIRouter(prefix="/api/repositories", tags=["questions"])


@router.post("/{repository_id}/ask")
async def ask_question(repository_id: str, request: QuestionRequest):
    return answer_question(
        repository_id=repository_id,
        question=request.question,
        question_type=request.type,
    )
