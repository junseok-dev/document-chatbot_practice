from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.config import get_settings
from app.services.prompt_service import get_prompt_value

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

STANDARD_REFUSAL = "참고 문서에서 확인되지 않습니다. 정확한 안내는 관리자 확인이 필요합니다."


def _normalize_response(answer: str) -> str:
    text = (answer or "").strip()
    return text if text else STANDARD_REFUSAL


def _build_messages(system_prompt: str, user_message: str, history: list[dict]) -> list[dict]:
    """system + 이전 대화 이력 + 현재 질문으로 메시지 배열 구성."""
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    for h in history:
        msgs.append({"role": h["role"], "content": h["content"]})
    msgs.append({"role": "user", "content": user_message})
    return msgs


async def get_ai_response(question: str, context: str, history: list[dict] | None = None) -> tuple[str, float]:
    if client is None:
        return STANDARD_REFUSAL, 0.0

    system_prompt = get_prompt_value("counseling_prompt")
    user_message = f"[상담 참고 정보]\n{context}\n\n[사용자 질문]\n{question}" if context else f"[사용자 질문]\n{question}"
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
        yield STANDARD_REFUSAL
        return

    system_prompt = get_prompt_value("counseling_prompt")
    user_message = f"[상담 참고 정보]\n{context}\n\n[사용자 질문]\n{question}" if context else f"[사용자 질문]\n{question}"
    messages = _build_messages(system_prompt, user_message, history or [])

    stream = await client.chat.completions.create(
        model=settings.model_name,
        messages=messages,
        max_completion_tokens=4096,
        stream=True,
    )

    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
