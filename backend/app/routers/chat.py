from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.models.chat import ChatRequest, ChatResponse, SuggestedQuestionsResponse
from app.services.faq_service import search_faq, get_suggested_questions
from app.services.document_service import search_documents
from app.services.openai_service import get_ai_response
from app.db.database import get_db
from app.db.crud import get_or_create_session, save_message
from app.utils.crypto import encrypt

router = APIRouter()

ERROR_FALLBACK = (
    "죄송합니다. 일시적인 오류가 발생했습니다. "
    "잠시 후 다시 시도하거나 담당자에게 문의해 주세요. "
    "📞 02-1234-5678 / ✉️ contact@codeai.kr (평일 09:00~18:00)"
)


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    사용자 질문 처리 메인 엔드포인트.

    응답 흐름:
    1. FAQ 키워드 검색 → 매칭 시 즉시 반환 (score ≥ 3)
    2. Markdown 문서 검색 → 관련 청크 추출 (없으면 빈 문자열)
    3. OpenAI API 호출 → 시스템 프롬프트가 세 경우 처리:
       - 문서 있음: 문서 기반 답변
       - 문서 없지만 부트캠프 관련: 담당자 문의 안내
       - 부트캠프와 무관: 관련 질문 유도
    """
    encrypted_name = encrypt(request.user_name) if request.user_name else None
    get_or_create_session(db, request.session_id, encrypted_name)

    save_message(db, request.session_id, "user", request.message, source="user")

    # ── Step 1: FAQ 우선 검색 ────────────────────────────
    faq_answer = search_faq(request.message)
    if faq_answer:
        save_message(db, request.session_id, "assistant", faq_answer, source="faq")
        return ChatResponse(
            answer=faq_answer,
            source="faq",
            session_id=request.session_id,
        )

    # ── Step 2: Markdown 문서 검색 (없으면 빈 문자열) ────
    context = search_documents(request.message)

    # ── Step 3: OpenAI API 호출 ──────────────────────────
    try:
        ai_answer = await get_ai_response(request.message, context)
        source = "document" if context else "ai"
    except Exception:
        ai_answer = ERROR_FALLBACK
        source = "fallback"

    save_message(db, request.session_id, "assistant", ai_answer, source=source)
    return ChatResponse(
        answer=ai_answer,
        source=source,
        session_id=request.session_id,
    )


@router.get("/suggested", response_model=SuggestedQuestionsResponse)
def get_suggested(db: Session = Depends(get_db)):
    """추천 질문 버튼 목록 반환"""
    questions = get_suggested_questions()
    return SuggestedQuestionsResponse(questions=questions)
