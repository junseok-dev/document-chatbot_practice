from openai import AsyncOpenAI

from app.config import get_settings

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key)

STANDARD_REFUSAL = "참고 문서에서 확인되지 않습니다. 정확한 안내는 관리자 확인이 필요합니다."

SYSTEM_PROMPT = """당신은 플레이데이터의 문서 기반 안내 RAG 챗봇입니다.

반드시 지켜야 할 원칙:
1. 답변은 참고 문서에 있는 내용만 사용합니다.
2. 참고 문서에 없는 정보는 추측해서 만들지 않습니다.
3. 문서 근거가 부족하면 정확히 아는 척하지 말고 다음 문장으로 답합니다.
   - 참고 문서에서 확인되지 않습니다. 정확한 안내는 관리자 확인이 필요합니다.
4. 비교형, 정의형, 규정형, 수치형 질문은 첫 문장에서 바로 결론을 말합니다.
5. 답변은 짧고 직접적으로 작성합니다. 불필요한 인사, 홍보 문구, 과한 부연은 넣지 않습니다.
6. 첫 문장은 사용자 질문의 핵심 표현을 그대로 재사용해 작성합니다.
   - 예: "기간이 얼마나 돼요?" -> "AI 오케스트레이션 과정의 기간은 6개월(960시간)입니다."
   - 예: "비전공자도 됩니까?" -> "비전공자도 지원 가능합니다."
   - 예: "교육비 얼마에요?" -> "세 과정의 교육비는 모두 0원입니다."
7. 가능하면 질문의 명사와 서술어를 답변 첫 문장에 그대로 포함합니다.

질문 유형별 답변 방식:
- 비교형: 공통점과 차이를 바로 말합니다. 모두 같으면 모두 같다고 명시합니다.
- 수치형: 문서에 있는 수치만 말합니다.
- 규정형/법률형: 문서 표현을 최대한 유지하고 해석을 덧붙이지 않습니다.
- 추천형: 어떤 사람에게 맞는지 문서 근거 중심으로 1~2문장으로 답합니다.
- 가능/여부형: "네, 가능합니다."만 쓰지 말고 무엇이 가능한지 주어를 포함해 답합니다.
- 정의형: "X는 Y입니다." 형식으로 답합니다.
- 수치형: "X는 N입니다." 형식으로 답합니다.

예외 처리 규칙:
- 국민내일배움카드, K-디지털 트레이닝, 발급 자격, 카드 사용 가능 여부, 중복 수강 가능 여부는 문서에 있는 범위까지만 답합니다.
- 위 주제는 문서 근거가 있더라도 최종 자격·발급 여부는 고용센터 또는 고용24에서 확인해야 한다고 짧게 덧붙일 수 있습니다.
- 개인정보 수집이 필요한 상담원 연결 절차는 이 프롬프트에서 처리하지 않습니다.
- 취업 보장, 100% 합격, 무조건 가능 같은 과장 표현은 사용하지 않습니다.

과정 설명 금지 표현:
- MLOps 엔지니어 과정을 단순 데이터 엔지니어링 과정, 기존 과정 대체, 쉬운 과정처럼 말하지 않습니다.
- 머신러닝 엔지니어 과정을 챗봇만 만드는 과정, LLM 사용 과정처럼 축소하지 않습니다.
- AI 오케스트레이션 과정을 노코드 AI 개발, 코딩 불필요 과정처럼 오해되게 말하지 않습니다.

답변 형식:
- 한국어로 답합니다.
- 가능하면 1~3문장 안에 끝냅니다.
- 참고 문서에 없는 연락처, 일정, 담당자 이름, 수료율, 취업률, 장학금 등은 만들어 쓰지 않습니다.
"""


def _normalize_response(answer: str) -> str:
    text = (answer or "").strip()
    if not text:
        return STANDARD_REFUSAL

    refusal_signals = [
        "참고 문서에서 확인되지 않습니다",
        "문서에서 확인되지 않습니다",
        "확인되지 않습니다",
        "정보가 없습니다",
        "문서에 없습니다",
        "알 수 없습니다",
    ]
    if any(signal in text for signal in refusal_signals):
        if "정확한 안내는 관리자 확인이 필요합니다." not in text:
            return STANDARD_REFUSAL
        return text

    return text


def _extract_subject(question: str) -> str:
    text = question.strip().rstrip("?!. ")
    endings = [
        "이 얼마나 돼요",
        "가 얼마나 돼요",
        "은 얼마나 돼요",
        "는 얼마나 돼요",
        "이 얼마에요",
        "가 얼마에요",
        "은 얼마에요",
        "는 얼마에요",
        "이 뭔가요",
        "가 뭔가요",
        "은 뭔가요",
        "는 뭔가요",
        "이 무엇인가요",
        "가 무엇인가요",
        "은 무엇인가요",
        "는 무엇인가요",
        "도 되나요",
        "도 됩니까",
        "도 가능한가요",
        "도 가능합니까",
        "가 가능한가요",
        "이 가능한가요",
        "은 가능한가요",
        "는 가능한가요",
    ]
    for ending in endings:
        if text.endswith(ending):
            return text[: -len(ending)].strip()
    return text


def _align_to_question(question: str, answer: str) -> str:
    text = answer.strip()
    if not text or text == STANDARD_REFUSAL:
        return text

    if "정확한 안내는 관리자 확인이 필요합니다." in text:
        return text

    subject = _extract_subject(question)
    if not subject:
        return text

    if subject in text:
        return text

    lowered_question = question.lower()

    if any(token in lowered_question for token in ["되나요", "됩니까", "가능", "지원"]):
        if text.startswith("네, "):
            return f"{subject} 가능합니다. {text[3:]}".strip()
        if text.startswith("네. "):
            return f"{subject} 가능합니다. {text[3:]}".strip()
        if text.startswith("아니요, "):
            return f"{subject} 어렵습니다. {text[5:]}".strip()

    if any(token in lowered_question for token in ["얼마", "몇", "기간"]):
        if text.endswith("입니다.") or text.endswith("입니다"):
            return f"{subject}은 {text}".replace("은 는", "는 ")

    if any(token in lowered_question for token in ["뭔가요", "무엇", "뭐예요", "뭐에요"]):
        if text.endswith("입니다.") or text.endswith("입니다"):
            return f"{subject}은 {text}".replace("은 는", "는 ")

    return text


async def get_ai_response(question: str, context: str) -> str:
    user_message = f"[참고 문서]\n{context}\n\n[질문]\n{question}" if context else f"[질문]\n{question}"

    response = await client.chat.completions.create(
        model=settings.model_name,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=320,
        temperature=0.1,
    )

    content = response.choices[0].message.content or ""
    normalized = _normalize_response(content)
    return _align_to_question(question, normalized)
