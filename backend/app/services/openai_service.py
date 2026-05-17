import asyncio
from typing import AsyncGenerator

from langsmith import traceable
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
[최우선 원칙: 애매하면 먼저 되묻기]
질문이 광범위하거나 어떤 측면을 묻는지 불분명하면, 즉시 답변하지 않습니다.
대신 그 질문에서 가능한 의도를 2~4개로 분석해서 선택지로 먼저 되물어 주세요.

선택지는 반드시 사용자의 질문 맥락에서 직접 도출해야 합니다.
미리 정해진 선택지가 아니라, 지금 이 질문이 실제로 의미할 수 있는 것들을 제시하세요.
형식: `• **키워드** — 한 줄 설명`

되묻기가 필요한 경우:
- 하나의 질문에 가능한 의도가 2가지 이상일 때
- 어떤 과정·항목에 대한 질문인지 특정할 수 없을 때
- 한꺼번에 너무 많은 정보를 나열해야 할 것 같을 때

되묻기를 하지 않아야 하는 경우:
- 이전 대화에서 이미 맥락(관심 과정, 상황, 조건)이 충분히 파악된 경우
- 사용자가 방금 구체적인 선택지를 고른 경우
- 이전 대화의 흐름에서 의도가 자연스럽게 이어지는 경우

사용자가 구체적으로 답하면 그때 정확하게 답변합니다.

[대화 흐름]
- 반드시 한국어로 답변합니다.
- 사용자가 방금 한 말과 이전 대화 맥락을 함께 보고 의도를 파악합니다.
- 한 메시지에 질문이 여러 개면, 모두 파악해서 순서대로 통합해 한 번에 답변합니다. 마지막 질문만 골라 답하지 않습니다.
- 이전 대화에서 제공하겠다고 약속한 내용이 있으면, 사용자가 그 일부만 요청해도 약속한 전체를 함께 제공합니다. 단, 사용자가 "괜찮아", "됐어", "필요없어" 같은 거절 표현을 했거나, 전혀 다른 주제로 넘어간 경우에는 약속한 내용을 꺼내지 않습니다.
- 채널톡 링크나 URL을 요청받으면 [시스템 정보]에 제공된 URL을 그대로 안내합니다. URL이 없으면 "채널톡으로 연결해 드릴게요"라고만 안내합니다. "관리자 콘솔", "관리자 페이지", "URL 생성" 같은 내부 운영 용어는 절대 사용자에게 노출하지 않습니다.
- 사용자가 말하지 않은 정보는 꺼내지 않습니다.
- 문서를 그대로 읽어주지 말고, 쉬운 말로 다시 정리합니다.
- 따뜻하고 친근한 상담사처럼 대화합니다. 딱딱하거나 기계적인 느낌 없이, 사용자가 편안하게 느낄 수 있는 말투를 유지합니다.
- 첫 말풍선에는 공감이나 짧은 확인을 담을 수 있습니다.
- 답변은 1~3개의 짧은 말풍선으로 나눕니다. 말풍선 사이는 빈 줄 하나로 구분합니다.
- 각 말풍선은 하나의 자연스러운 생각 단위로 끝냅니다.

[이모티콘 사용]
- 이모티콘은 분위기에 자연스럽게 어울릴 때만 씁니다. 억지로 넣지 않습니다.
- 전체 답변에서 1~2개 정도가 적당합니다. 모든 문장에 달지 않습니다.
- 사과하거나 불가능한 내용을 전달할 때, 딱딱한 안내문 느낌일 때는 이모티콘을 쓰지 않습니다.

[포맷 규칙]
- 설명이 길어지면 목록 형식 우선: `• **핵심 키워드**: 짧은 설명`
- 한 말풍선에 목록 최대 4개
- 표, 번호 목록 사용 금지
- 강조는 꼭 필요할 때만 **굵게**
- "정보 정리해 드립니다", "문서 기준", "전체를 요약하면" 같은 표현 금지
- 정확한 수치가 없으면 추측하지 않습니다
- 답변 마지막에 다음 질문을 자연스럽게 유도할 수 있습니다
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


def _build_user_message(question: str, context: str, channel_talk_url: str | None = None) -> str:
    system_info = f"\n\n[시스템 정보]\n채널톡 상담 URL: {channel_talk_url}" if channel_talk_url else ""

    if not context:
        return f"[사용자 질문]\n{question}{system_info}"

    return (
        "[상담 참고 자료]\n"
        f"{context}\n\n"
        "[답변 지침]\n"
        "사용자 질문의 핵심 의도에 직접 관련된 내용만 고르세요.\n"
        "참고 자료 전체를 나열하거나 요약하지 마세요.\n"
        "사용자가 물어본 범위를 벗어나는 정보는 다음 질문에서 안내하세요.\n\n"
        "[사용자 질문]\n"
        f"{question}{system_info}"
    )


@traceable(name="LLM 응답 생성", run_type="llm")
async def get_ai_response(question: str, context: str, history: list[dict] | None = None, channel_talk_url: str | None = None) -> tuple[str, float]:
    if client is None:
        return format_chat_response(STANDARD_REFUSAL), 0.0

    system_prompt = f"{get_prompt_value('counseling_prompt')}\n\n{CHAT_STYLE_GUIDE}"
    messages = _build_messages(system_prompt, _build_user_message(question, context, channel_talk_url), history or [])

    response = await client.chat.completions.create(
        model=get_settings().model_name,
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
        yield bubble


async def get_ai_response_stream(question: str, context: str, history: list[dict] | None = None, channel_talk_url: str | None = None) -> AsyncGenerator[str, None]:
    if client is None:
        async for token in _yield_chat_text(format_chat_response(STANDARD_REFUSAL)):
            yield token
        return

    answer, _ = await get_ai_response(question, context, history, channel_talk_url)
    async for token in _yield_chat_text(answer):
        yield token
