import asyncio
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.config import get_settings
from app.services.prompt_service import get_prompt_value
from app.services.response_formatter import format_chat_response

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
MAX_COMPLETION_TOKENS = 4096
BUBBLE_PAUSE_SECONDS = 2.0

CHAT_STYLE_GUIDE = """
[Counselor chat style]
- Answer in Korean.
- Understand the user's intent first.
- Do not summarize the whole document.
- Select only details directly related to the question.
- Sound like a human counselor in chat.
- Put one complete thought in each chat bubble.
- Separate chat bubbles with one blank line.
- Use 2 to 4 short chat bubbles.
- Do not split words or sentences awkwardly.
- Prefer complete sentences in each bubble.
- Start with the core answer.
- Leave extra details for follow-up questions.
- Avoid long lists, headings, source labels, and document-summary tone.
- Do not say "I'll summarize everything" or "I'll organize all information".
- Do not say "according to the document" or "reference document".

[Example for broad course questions]
User: ai 과정에 대해서 설명해줘
Assistant:
AI 과정은 목표별로 달라요.

자동화와 서비스 기획이면 AI 오케스트레이션이 맞고,

RAG나 검색 정확도 쪽이면 머신러닝 엔지니어가 맞아요.

운영과 배포 자동화가 좋다면 MLOps 쪽이에요.
"""

STANDARD_REFUSAL = "참고 문서에서 확인되지 않습니다. 정확한 안내는 관리자 확인이 필요합니다."


def _normalize_response(answer: str) -> str:
    text = (answer or "").strip()
    return format_chat_response(text if text else STANDARD_REFUSAL)


def _build_messages(system_prompt: str, user_message: str, history: list[dict]) -> list[dict]:
    """system + 이전 대화 이력 + 현재 질문으로 메시지 배열 구성."""
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    for h in history:
        msgs.append({"role": h["role"], "content": h["content"]})
    msgs.append({"role": "user", "content": user_message})
    return msgs


async def get_ai_response(question: str, context: str, history: list[dict] | None = None) -> tuple[str, float]:
    if client is None:
        return format_chat_response(STANDARD_REFUSAL), 0.0

    system_prompt = f"{get_prompt_value('counseling_prompt')}\n\n{CHAT_STYLE_GUIDE}"
    user_message = (
        "[상담 참고 정보]\n"
        f"{context}\n\n"
        "[답변 기준]\n"
        "사용자 질문의 핵심 맥락과 직접 관련된 정보만 골라 답하세요.\n"
        "참고 정보 전체를 나열하거나 요약하지 마세요.\n\n"
        "[사용자 질문]\n"
        f"{question}"
    ) if context else f"[사용자 질문]\n{question}"
    messages = _build_messages(system_prompt, user_message, history or [])

    response = await client.chat.completions.create(
        model=settings.model_name,
        messages=messages,
        max_completion_tokens=MAX_COMPLETION_TOKENS,
    )

    content = response.choices[0].message.content or ""
    usage = getattr(response, "usage", None)
    total_tokens = getattr(usage, "total_tokens", 0) or 0
    estimated_cost = round(total_tokens * 0.000001, 6)
    return _normalize_response(content), estimated_cost


async def get_ai_response_stream(question: str, context: str, history: list[dict] | None = None) -> AsyncGenerator[str, None]:
    """OpenAI 스트리밍 API를 사용해 텍스트 토큰을 순차적으로 yield."""
    if client is None:
        yield format_chat_response(STANDARD_REFUSAL)
        return

    system_prompt = f"{get_prompt_value('counseling_prompt')}\n\n{CHAT_STYLE_GUIDE}"
    user_message = (
        "[상담 참고 정보]\n"
        f"{context}\n\n"
        "[답변 기준]\n"
        "사용자 질문의 핵심 맥락과 직접 관련된 정보만 골라 답하세요.\n"
        "참고 정보 전체를 나열하거나 요약하지 마세요.\n\n"
        "[사용자 질문]\n"
        f"{question}"
    ) if context else f"[사용자 질문]\n{question}"
    messages = _build_messages(system_prompt, user_message, history or [])

    stream = await client.chat.completions.create(
        model=settings.model_name,
        messages=messages,
        max_completion_tokens=MAX_COMPLETION_TOKENS,
        stream=True,
    )

    buffer = ""
    async for chunk in stream:
        if not chunk.choices or not chunk.choices[0].delta.content:
            continue

        buffer += chunk.choices[0].delta.content
        while "\n\n" in buffer:
            bubble, buffer = buffer.split("\n\n", 1)
            if bubble:
                yield bubble
            yield "\n\n"
            await asyncio.sleep(BUBBLE_PAUSE_SECONDS)

    if buffer.strip():
        yield buffer
