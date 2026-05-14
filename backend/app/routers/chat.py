import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.crud import get_or_create_session, save_message
from app.db.database import get_db
from app.db.models import CancelRequest, ChatLog
from app.models.chat import ChatRequest, ChatResponse, SuggestedQuestionsResponse
from app.services.document_service import search_documents
from app.services.faq_service import get_suggested_questions, is_guide_query, search_faq
from app.services.guardrail_service import check as guardrail_check
from app.services.openai_service import get_ai_response
from app.services.prompt_service import get_prompt_value
from app.utils.crypto import encrypt

router = APIRouter()


def _normalize_intent_text(message: str) -> str:
    return "".join((message or "").lower().split())


def is_handoff_request(message: str) -> bool:
    normalized = _normalize_intent_text(message)
    direct_handoff_signals = [
        "상담연결",
        "사람상담",
        "매니저연결",
        "문의연결",
        "상담원연결",
        "직원연결",
        "담당자연결",
    ]
    return any(signal in normalized for signal in direct_handoff_signals)


def is_cancel_request(message: str) -> bool:
    normalized = _normalize_intent_text(message)

    direct_signals = [
        "취소",
        "환불",
        "환급",
        "철회",
        "해지",
        "포기",
        "그만둘래",
        "안들을래",
        "수강안할래",
        "등록취소",
        "신청취소",
        "접수취소",
        "결제취소",
        "수강취소",
        "등록철회",
        "환불문의",
        "환불요청",
        "취소요청",
        "취소문의",
    ]
    if any(signal in normalized for signal in direct_signals):
        return True

    schedule_signals = [
        "일정변경",
        "날짜변경",
        "개강변경",
        "연기",
        "미루고",
        "다음기수",
        "다른기수",
        "변경하고싶",
        "옮기고싶",
    ]
    if any(signal in normalized for signal in schedule_signals):
        return True

    combined_topics = ["수강", "등록", "신청", "결제", "과정", "교육", "개강", "기수"]
    combined_actions = ["취소", "환불", "철회", "해지", "연기", "변경", "옮기", "미루"]
    return any(topic in normalized for topic in combined_topics) and any(
        action in normalized for action in combined_actions
    )


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    encrypted_name = encrypt(request.user_name) if request.user_name else None
    get_or_create_session(db, request.session_id, encrypted_name)
    save_message(db, request.session_id, "user", request.message, source="user")

    retrieval_chunks: list[str] = []
    source = "fallback"
    answer = get_prompt_value("fallback_prompt")
    llm_cost = 0.0
    error_message = None
    processing_status = "ready"

    blocked = guardrail_check(request.message)
    if blocked:
        answer = blocked
        source = "guardrail"
    elif is_cancel_request(request.message):
        answer = get_prompt_value("cancel_prompt")
        source = "handoff"
        processing_status = "handoff"
        db.add(CancelRequest(session_id=request.session_id, message=request.message, status="requested"))
        db.commit()
    elif is_handoff_request(request.message):
        answer = get_prompt_value("handoff_prompt")
        source = "handoff"
        processing_status = "handoff"
    else:
        faq_answer = search_faq(request.message) if is_guide_query(request.message) else None
        if faq_answer:
            answer = faq_answer
            source = "faq"
        else:
            result = search_documents(request.message)
            retrieval_chunks = result.chunks
            try:
                answer, llm_cost = await get_ai_response(request.message, result.context)
                source = "document" if result.context else "ai"
            except Exception as exc:
                answer = get_prompt_value("fallback_prompt")
                source = "fallback"
                processing_status = "failed"
                error_message = str(exc)

    save_message(db, request.session_id, "assistant", answer, source=source)
    db.add(
        ChatLog(
            session_id=request.session_id,
            question=request.message,
            retrieval_chunks=json.dumps(retrieval_chunks, ensure_ascii=False),
            answer=answer,
            source=source,
            error=error_message,
            processing_status=processing_status,
            embedding_cost=0.0,
            llm_cost=llm_cost,
        )
    )
    db.commit()

    return ChatResponse(
        answer=answer,
        source=source,
        session_id=request.session_id,
        handoff_url=get_settings().channel_talk_url or None,
    )


@router.get("/suggested", response_model=SuggestedQuestionsResponse)
def get_suggested():
    return SuggestedQuestionsResponse(questions=get_suggested_questions())
