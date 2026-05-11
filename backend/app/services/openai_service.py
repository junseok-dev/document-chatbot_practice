from openai import AsyncOpenAI
from app.config import get_settings

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """당신은 'CodeAI 부트캠프' 교육 과정을 안내하는 친절한 상담 챗봇입니다.

반드시 아래 규칙을 따르세요:

1. [참고 문서]가 제공된 경우, 해당 내용만을 근거로 답변하세요.
2. 질문이 CodeAI 부트캠프(교육, 수강, 커리큘럼, 강사, 취업 지원, 신청, 비용 등)와 전혀 관계없는 주제(날씨, 요리, 스포츠, 연예인 등)라면, 반드시 다음과 같이 안내하세요:
   "저는 CodeAI 부트캠프 관련 질문만 답변드릴 수 있어요. 수강료, 개강일, 커리큘럼, 신청 방법 등에 대해 질문해 보세요! 😊"
3. 질문이 부트캠프와 관련은 있지만 참고 문서에서 확인할 수 없는 경우, 반드시 다음과 같이 안내하세요:
   "해당 내용은 현재 안내 문서에서 확인되지 않습니다. 보다 자세한 문의는 담당자에게 연락해 주세요. 📞 02-1234-5678 / ✉️ contact@codeai.kr"
4. 항상 존댓말과 친절한 상담원 말투를 사용하세요.
5. 답변은 5문장 이내로 간결하게 작성하세요.
6. 근거 없는 추측이나 창작은 절대 하지 마세요.
7. 필요 시 핵심 정보(날짜, 금액, 링크 등)는 강조하여 표현해도 됩니다.
"""


async def get_ai_response(question: str, context: str) -> str:
    """
    OpenAI API를 호출하여 문서 기반 답변 생성.

    Args:
        question: 사용자 질문
        context: 검색된 Markdown 문서 청크들

    Returns:
        생성된 답변 문자열
    """
    user_message = f"[참고 문서]\n{context}\n\n[질문]\n{question}" if context else f"[질문]\n{question}"

    response = await client.chat.completions.create(
        model=settings.model_name,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=600,
        temperature=0.3,  # 낮을수록 일관성 있는 답변
    )
    return response.choices[0].message.content.strip()
