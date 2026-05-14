import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.crud import get_or_create_session, save_message
from app.db.database import get_db
from app.db.models import CancelRequest, ChatLog
from app.models.chat import ChatRequest, ChatResponse, SuggestedQuestionsResponse
from app.services.document_service import search_documents
from app.services.faq_service import get_suggested_questions, is_guide_query, match_button_faq, search_faq
from app.services.guardrail_service import check as guardrail_check
from app.services.openai_service import get_ai_response, get_ai_response_stream
from app.services.prompt_service import get_prompt_value
from app.services.response_formatter import format_chat_response

router = APIRouter()


def _normalize_intent_text(message: str) -> str:
    return "".join((message or "").lower().split())


GREETING_ANSWER = (
    "안녕하세요!\n\n"
    "플레이데이터 상담봇입니다. 반갑습니다.\n\n"
    "과정, 수강 조건, 비용, 취업 지원처럼 궁금한 내용을 편하게 물어봐 주세요."
)


def is_greeting(message: str) -> bool:
    normalized = _normalize_intent_text(message)
    signals = ["안녕", "하이", "헬로", "반가워", "반갑", "처음뵙", "안녕하세요", "안녕하십"]
    return any(s in normalized for s in signals) and len(normalized) <= 20


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
    get_or_create_session(db, request.session_id, None)
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
    elif is_greeting(request.message):
        answer = GREETING_ANSWER
        source = "faq"
    elif btn := match_button_faq(request.message):
        answer = btn
        source = "faq"
    else:
        if is_guide_query(request.message):
            faq_answer = search_faq(request.message)
            if faq_answer:
                answer = faq_answer
                source = "faq"
            else:
                answer = (
                    "플레이데이터 상담봇에서는 다음 카테고리의 질문을 도와드릴 수 있어요.\n\n"
                    "- **법률**: 개인정보 처리방침, 이용약관, 법적 고지 등\n"
                    "- **운영규정**: 수강 규정, 출결 기준, 수료 조건, 환불 정책 등\n"
                    "- **과정 상세**: 커리큘럼, 교육 기간, 비용, 취업 지원 등\n"
                    "- **플레이데이터 정보**: 회사 소개, 오시는 길, 채용, 제휴 등\n\n"
                    "궁금하신 내용을 구체적으로 질문해 주시면 더 정확하게 안내드릴게요!"
                )
                source = "faq"
        else:
            result = search_documents(request.message)
            retrieval_chunks = result.chunks
            history = [{"role": h.role, "content": h.content} for h in request.history]
            try:
                answer, llm_cost = await get_ai_response(request.message, result.context, history)
                source = "document" if result.context else "ai"
            except Exception as exc:
                answer = get_prompt_value("fallback_prompt")
                source = "fallback"
                processing_status = "failed"
                error_message = str(exc)

    answer = format_chat_response(answer)
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

    handoff_url: str | None = None
    if source == "handoff":
        url = get_settings().channel_talk_url
        handoff_url = url if url else None

    return ChatResponse(
        answer=answer,
        source=source,
        session_id=request.session_id,
        handoff_url=handoff_url,
    )


@router.post("/stream")
async def chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    get_or_create_session(db, request.session_id, None)
    save_message(db, request.session_id, "user", request.message, source="user")
    db.commit()

    async def generate():
        source = "fallback"
        full_answer = ""
        error_message = None
        processing_status = "ready"
        retrieval_chunks: list[str] = []

        def _sse(data: dict) -> str:
            return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

        async def _stream_static(text: str) -> None:
            nonlocal full_answer
            full_answer = format_chat_response(text)
            bubbles = full_answer.split("\n\n")
            for bubble_index, bubble in enumerate(bubbles):
                if bubble_index > 0:
                    yield _sse({"token": "\n\n"})
                    await asyncio.sleep(2.0)
                for char in bubble:
                    yield _sse({"token": char})
                    await asyncio.sleep(0.015)

        blocked = guardrail_check(request.message)
        if blocked:
            source = "guardrail"
            async for chunk in _stream_static(blocked):
                yield chunk
        elif is_cancel_request(request.message):
            source = "handoff"
            processing_status = "handoff"
            db.add(CancelRequest(session_id=request.session_id, message=request.message, status="requested"))
            db.commit()
            async for chunk in _stream_static(get_prompt_value("cancel_prompt")):
                yield chunk
        elif is_handoff_request(request.message):
            source = "handoff"
            processing_status = "handoff"
            async for chunk in _stream_static(get_prompt_value("handoff_prompt")):
                yield chunk
        elif is_greeting(request.message):
            source = "faq"
            async for chunk in _stream_static(GREETING_ANSWER):
                yield chunk
        elif btn := match_button_faq(request.message):
            source = "faq"
            async for chunk in _stream_static(btn):
                yield chunk
        else:
            if is_guide_query(request.message):
                faq_answer = search_faq(request.message)
                static_text = faq_answer if faq_answer else (
                    "플레이데이터 상담봇에서는 다음 카테고리의 질문을 도와드릴 수 있어요.\n\n"
                    "- **법률**: 개인정보 처리방침, 이용약관, 법적 고지 등\n"
                    "- **운영규정**: 수강 규정, 출결 기준, 수료 조건, 환불 정책 등\n"
                    "- **과정 상세**: 커리큘럼, 교육 기간, 비용, 취업 지원 등\n"
                    "- **플레이데이터 정보**: 회사 소개, 오시는 길, 채용, 제휴 등\n\n"
                    "궁금하신 내용을 구체적으로 질문해 주시면 더 정확하게 안내드릴게요!"
                )
                source = "faq"
                async for chunk in _stream_static(static_text):
                    yield chunk
            else:
                result = search_documents(request.message)
                retrieval_chunks = result.chunks
                history = [{"role": h.role, "content": h.content} for h in request.history]
                try:
                    async for token in get_ai_response_stream(request.message, result.context, history):
                        full_answer += token
                        yield _sse({"token": token})
                    source = "document" if result.context else "ai"
                except Exception as exc:
                    fallback = get_prompt_value("fallback_prompt")
                    source = "fallback"
                    processing_status = "failed"
                    error_message = str(exc)
                    async for chunk in _stream_static(fallback):
                        yield chunk

        handoff_url: str | None = None
        if source == "handoff":
            url = get_settings().channel_talk_url
            handoff_url = url if url else None

        yield _sse({"done": True, "source": source, "handoff_url": handoff_url})

        save_message(db, request.session_id, "assistant", full_answer, source=source)
        db.add(
            ChatLog(
                session_id=request.session_id,
                question=request.message,
                retrieval_chunks=json.dumps(retrieval_chunks, ensure_ascii=False),
                answer=full_answer,
                source=source,
                error=error_message,
                processing_status=processing_status,
                embedding_cost=0.0,
                llm_cost=0.0,
            )
        )
        db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/suggested", response_model=SuggestedQuestionsResponse)
def get_suggested():
    return SuggestedQuestionsResponse(questions=get_suggested_questions())
