from openai import AsyncOpenAI
from app.config import get_settings

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """당신은 플레이데이터 CodeAI 부트캠프 교육 과정을 안내하는 친절한 상담 챗봇입니다.

아래 규칙을 따르세요:

1. [참고 문서]가 있으면 해당 내용을 바탕으로 최대한 구체적으로 답변하세요.
2. 문서에 일부만 있는 경우 알고 있는 내용을 먼저 답하고, 부족한 부분은 솔직하게 말하세요.
3. 문서에 전혀 없는 내용이라도 일반적인 교육 과정 관련 지식으로 도움이 될 수 있다면 활용하세요. 단, 확실하지 않은 내용은 "정확한 내용은 확인이 필요할 수 있어요"라고 덧붙이세요.
4. 담당자 문의 안내는 정말 답변이 불가능한 경우에만 간단히 언급하고, 그 전에 최대한 도움이 되는 정보를 먼저 제공하세요.
5. CodeAI 부트캠프와 전혀 관계없는 질문(날씨, 요리, 스포츠 등)에는 부드럽게 주제를 안내하세요.
6. 항상 따뜻하고 친절한 말투를 유지하세요.
7. 답변은 간결하게 핵심 위주로 작성하고, 중요한 정보는 강조해 주세요.
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
