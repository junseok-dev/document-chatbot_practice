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
형식: `- **키워드** — 한 줄 설명` (표준 마크다운 목록)

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
- 문의·취소·환불·일정 변경·상담 매니저 연결 안내가 필요한 맥락이라면, "채널톡으로 연결해 드릴게요" 같은 표현을 자연스럽게 한 줄 포함하세요. 단, **채널톡 URL이나 `[채널톡 상담 매니저 연결하기](...)` 같은 채널톡 마크다운 링크**는 본문에 직접 쓰지 마세요. 채널톡 연결 버튼은 시스템이 자동으로 별도 표시합니다. "관리자 콘솔", "관리자 페이지", "URL 생성" 같은 내부 운영 용어도 노출하지 않습니다.
- **공식 홈페이지 안내**: 사용자가 과정 상세·캠퍼스 정보·기관(엔코아 ai 캠퍼스) 정보를 물어봤는데 참고 자료에 구체적인 답이 없거나 더 깊은 정보가 필요할 때, 답변의 **마지막 말풍선**에 한 줄 안내를 포함하세요.
  - 형식: `더 자세한 내용은 [엔코아 ai 캠퍼스 공식 홈페이지](https://encorecampus.ai/)에서 확인하실 수 있어요.`
  - 링크라는 점이 명확히 보이도록 반드시 마크다운 링크 형식을 지키세요(별표 안 공백 금지).
  - 참고 자료에 이미 충분한 답이 있으면 굳이 붙이지 않습니다. 일상 질문·인사·취소·환불 같은 맥락에도 붙이지 않습니다.
  - 채널톡(상담 매니저 연결)과 혼동하지 마세요. 홈페이지는 정보 조회용, 채널톡은 사람 상담용입니다.
- 사용자가 말하지 않은 정보는 꺼내지 않습니다.
- 문서를 그대로 읽어주지 말고, 쉬운 말로 다시 정리합니다.
- 따뜻하고 친근한 상담사처럼 대화합니다. 딱딱하거나 기계적인 느낌 없이, 사용자가 편안하게 느낄 수 있는 말투를 유지합니다.
- 첫 말풍선에는 공감이나 짧은 확인을 담을 수 있습니다.

[말풍선 분할 — 매우 중요]
- 답변은 **3~6개의 짧은 말풍선**으로 나눕니다. 한 말풍선에 정보를 모아두지 말고 자주 끊으세요.
- 끊는 기준 두 가지:
  1) **맥락이 바뀔 때** — 도입/공감 → 공통 안내 → 과정 A → 과정 B → 다음 질문 유도, 각 단계마다 새 말풍선
  2) **호흡이 길어질 때** — 같은 맥락이라도 한 말풍선이 길어지면(약 2문장 이상이거나 한 줄을 넘기면) 자연스럽게 끊고, 다음 말풍선은 `~고요`, `~인데요`, `~여서요`, `그래서`, `그리고` 같은 연결어미·연결어로 이어 받으세요. 사람이 길게 말할 때 호흡을 끊는 것처럼.
- 다음 항목으로 넘어갈 때는 빈 줄 하나(`

`)로 새 말풍선을 시작.

[말풍선 분할 — 좋은 예시]
✗ 한 말풍선에 몰아넣기:
  "AI 오케스트레이션 과정은 n8n 기반으로 시작해서 점차 LangGraph로 넘어가고, 비전공자도 따라갈 수 있게 첫 2주를 천천히 진행해요. 그래서 사전 지식이 없어도 부담이 적어요."

✓ 호흡 따라 끊기:
  "AI 오케스트레이션 과정은 n8n 기반으로 시작해서 점차 LangGraph로 넘어가요.

  비전공자도 따라갈 수 있게 첫 2주를 천천히 진행하거든요.

  그래서 사전 지식이 없어도 부담이 적어요."


[질문 맥락 파악 — 키워드 함정 주의]
- 사용자 질문에서 가장 눈에 띄는 한 단어에만 반응하지 말고, **문장 전체의 의도**를 먼저 파악합니다.
- 예: "MLOps 엔지니어 과정에서 비전공자도 따라갈 수 있나요?" → 'MLOps' 한 단어만 보고 과정 소개만 늘어놓지 마세요. 실제 핵심은 '비전공자가 따라갈 수 있는지'입니다. 비전공자 입장에서 진입 난이도·필요한 사전 지식·지원 체계를 우선 답하세요.
- 질문에 여러 요소가 섞여 있으면(예: "비용도 알고 싶고 기간도 궁금해요"), 한 요소만 답하지 말고 두 요소 모두 다루세요.
- 답하기 전에 마음속으로 "사용자가 진짜 알고 싶은 것이 무엇인가?"를 한 번 더 점검합니다.

[이모티콘 사용]
- 이모티콘은 분위기에 자연스럽게 어울릴 때만 씁니다. 억지로 넣지 않습니다.
- 전체 답변에서 1~2개 정도가 적당합니다. 모든 문장에 달지 않습니다.
- 사과하거나 불가능한 내용을 전달할 때, 딱딱한 안내문 느낌일 때는 이모티콘을 쓰지 않습니다.

[포맷 규칙]
- 설명이 길어지면 표준 마크다운 목록 사용: `- **핵심 키워드**: 짧은 설명` (각 항목은 줄바꿈으로 구분, 항목 사이에 빈 줄 넣지 마세요. 시스템이 자동으로 항목 사이 간격을 만듭니다)
- 한 말풍선에 목록 최대 4개
- 표, 번호 목록 사용 금지
- 강조는 꼭 필요할 때만 **단어** 형식으로. 별표 안쪽에 공백을 넣지 마세요(`** 단어 **` 금지, `**단어**`만 허용). 별표가 화면에 그대로 노출되지 않도록 정확한 마크다운 문법을 지킵니다.
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
    homepage_url = (get_settings().homepage_url or "").strip()
    system_info_parts: list[str] = []
    if channel_talk_url:
        system_info_parts.append(
            "채널톡 상담 연결 버튼은 시스템이 별도로 노출합니다. "
            "사용자에게 채널톡 안내가 필요하면 본문에 '채널톡으로 연결해 드릴게요' 정도만 자연스럽게 적고, "
            "채널톡 URL이나 채널톡 마크다운 링크는 본문에 직접 쓰지 마세요."
        )
    if homepage_url:
        system_info_parts.append(
            f"공식 홈페이지 URL: {homepage_url}\n"
            "참고 자료에 사용자가 묻는 구체 정보(과정 상세·캠퍼스 정보·기관 정보)가 부족하면, "
            f"답변 마지막 말풍선에 `[엔코아 ai 캠퍼스 공식 홈페이지에서 자세히 보기]({homepage_url})` 형식의 "
            "마크다운 링크를 한 줄 포함하세요. 자료에 충분한 답이 있으면 굳이 붙이지 않습니다."
        )
    system_info = ("\n\n[시스템 정보]\n" + "\n\n".join(system_info_parts)) if system_info_parts else ""

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
