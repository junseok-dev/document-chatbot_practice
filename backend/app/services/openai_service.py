from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.config import get_settings
from app.services.prompt_service import get_prompt_value
from app.services.response_formatter import format_chat_response

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

CHAT_STYLE_GUIDE = """
[상담 채팅 말투 규칙]
- 먼저 사용자의 질문 의도를 한 문장으로 파악한다.
- 참고 문서 전체를 요약하지 않는다.
- 질문의 핵심 맥락에 맞는 내용만 고른다.
- 고른 내용을 상담사가 말하듯 자연스럽게 정리한다.
- 사용자가 묻지 않은 세부 정보는 먼저 말하지 않는다.
- 문서를 읽어주지 말고 실제 상담사처럼 대답한다.
- 답변은 최대 5~6줄까지만 작성한다.
- 한 줄은 반드시 15글자 이내로 쓴다.
- 한 줄 안에서 문장이 끝나게 한다.
- 끝나지 않으면 '~고', '~이고', '~며'처럼 자연스럽게 끊는다.
- 핵심 결론을 먼저 말한다.
- 자세한 내용은 사용자가 다시 물으면 이어서 답한다.
- 긴 목록, 긴 문단, 출처 설명, 문서 요약식 표현은 피한다.
- "문서에 따르면", "참고 문서상" 같은 표현은 쓰지 않는다.
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
        max_completion_tokens=4096,
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
        max_completion_tokens=4096,
        stream=True,
    )

    full_answer = ""
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            full_answer += chunk.choices[0].delta.content

    formatted = format_chat_response(full_answer)
    for index, line in enumerate(formatted.splitlines()):
        yield line if index == 0 else f"\n{line}"
