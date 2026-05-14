import asyncio
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.config import get_settings
from app.services.prompt_service import get_prompt_value
from app.services.response_formatter import format_chat_response

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
MAX_COMPLETION_TOKENS = 4096
BUBBLE_PAUSE_SECONDS = 1.0
TYPE_DELAY_SECONDS = 0.015

CHAT_STYLE_GUIDE = """
[상담사 답변 방식]
- 반드시 한국어로 답변합니다.
- 사용자의 질문에서 핵심 의도를 먼저 파악합니다.
- 한 번에 모든 정보를 설명하지 않습니다.
- 사용자가 지금 물어본 내용에 직접 관련된 정보만 답합니다.
- 문서를 그대로 읽어주지 말고, 쉬운 말로 다시 정리합니다.
- 친절한 상담사가 채팅하는 말투로 답합니다.
- 답변은 1개에서 3개의 짧은 말풍선으로 나눕니다.
- 말풍선 사이는 빈 줄 하나로 구분합니다.
- 각 말풍선은 하나의 자연스러운 생각이나 문장 단위로 끝냅니다.
- 문장이나 단어를 어색하게 자르지 않습니다.
- 첫 말풍선에는 공감이나 확인을 짧게 담을 수 있습니다.
- 설명이 길어질 때는 문장형 단락보다 짧은 정리형 목록을 우선합니다.
- 목록은 `• **핵심 키워드**: 짧은 설명` 형식으로 씁니다.
- 한 말풍선에는 목록을 최대 4개까지만 넣습니다.
- 커리큘럼, 입학조건 등 여러 정보를 나열할 때는 항목별로 나눠서 정리합니다.
- 표는 모바일에서 읽기 어려우니 쓰지 말고, 짧은 목록으로 대신합니다.
- 번호 목록, 긴 제목, 장식용 기호는 쓰지 않습니다.
- 하이픈이나 긴 대시로 말을 잇지 않습니다.
- 강조가 꼭 필요할 때만 **굵게** 표시를 사용합니다.
- "정보 정리해 드립니다", "문서 기준", "전체를 요약하면" 같은 표현은 쓰지 않습니다.
- 과정 설명은 사용자가 물어본 관점에 맞춰 짧게 답합니다.
- 기간, 시간, 단계명, 기술 스택은 사용자가 직접 물어본 경우에만 말합니다.
- 정확한 수치가 문서에 없으면 추측하지 말고 확인이 필요하다고 말합니다.
- 답변 마지막에는 다음 질문을 자연스럽게 유도할 수 있습니다.
- 답변이 5줄을 넘길 것 같으면 반드시 목록형으로 압축합니다.
"""

STANDARD_REFUSAL = "확인된 자료만으로는 정확히 안내드리기 어려워요. 필요하시면 담당자가 확인할 수 있게 도와드릴게요."


def _normalize_response(answer: str) -> str:
    text = (answer or "").strip()
    return format_chat_response(text if text else STANDARD_REFUSAL)


def _build_messages(system_prompt: str, user_message: str, history: list[dict]) -> list[dict]:
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    for item in history:
        msgs.append({"role": item["role"], "content": item["content"]})
    msgs.append({"role": "user", "content": user_message})
    return msgs


def _build_user_message(question: str, context: str) -> str:
    if not context:
        return f"[사용자 질문]\n{question}"

    return (
        "[상담 참고 자료]\n"
        f"{context}\n\n"
        "[답변 지침]\n"
        "사용자 질문의 핵심 의도에 직접 관련된 내용만 고르세요.\n"
        "참고 자료 전체를 나열하거나 요약하지 마세요.\n"
        "사용자가 물어본 범위를 벗어나는 정보는 다음 질문에서 안내하세요.\n\n"
        "[사용자 질문]\n"
        f"{question}"
    )


async def get_ai_response(question: str, context: str, history: list[dict] | None = None) -> tuple[str, float]:
    if client is None:
        return format_chat_response(STANDARD_REFUSAL), 0.0

    system_prompt = f"{get_prompt_value('counseling_prompt')}\n\n{CHAT_STYLE_GUIDE}"
    messages = _build_messages(system_prompt, _build_user_message(question, context), history or [])

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


async def _yield_chat_text(text: str) -> AsyncGenerator[str, None]:
    bubbles = [part for part in text.split("\n\n") if part.strip()]
    for index, bubble in enumerate(bubbles):
        if index > 0:
            yield "\n\n"
            await asyncio.sleep(BUBBLE_PAUSE_SECONDS)

        for char in bubble:
            yield char
            await asyncio.sleep(TYPE_DELAY_SECONDS)


async def get_ai_response_stream(question: str, context: str, history: list[dict] | None = None) -> AsyncGenerator[str, None]:
    if client is None:
        async for token in _yield_chat_text(format_chat_response(STANDARD_REFUSAL)):
            yield token
        return

    answer, _ = await get_ai_response(question, context, history)
    async for token in _yield_chat_text(answer):
        yield token
