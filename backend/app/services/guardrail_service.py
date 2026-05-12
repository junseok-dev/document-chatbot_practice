import re

# ── 욕설 / 비하 ────────────────────────────────────────────────────────────────
_PROFANITY = [
    "씨발", "씨x", "ㅅㅂ", "ㅆㅂ", "개새", "개새끼", "새끼", "개년", "병신",
    "지랄", "닥쳐", "꺼져", "죽어", "꺼지", "찐따", "미친놈", "미친년",
    "fuck", "shit", "bitch", "asshole", "bastard", "damn you",
]

# ── 프롬프트 인젝션 ────────────────────────────────────────────────────────────
_INJECTION_PATTERNS = [
    r"시스템\s*프롬프트\s*(무시|잊|바꿔|변경|알려|출력)",
    r"(이전|앞|위)\s*(지시|명령|프롬프트)\s*(무시|잊어|바꿔)",
    r"너는?\s*이제\s*(다른|새로운)?\s*(ai|챗봇|로봇)",
    r"(ignore|forget|disregard)\s*(all\s*)?(previous|prior|above)\s*(instructions?|prompts?|rules?)",
    r"(act|pretend|behave|respond)\s*(as|like)\s*(if\s*you\s*(are|were))?",
    r"you\s*are\s*(now|a|an)\s",
    r"(jailbreak|dan\s*mode|developer\s*mode)",
    r"(프롬프트|지시문|시스템)\s*(보여줘|출력해|알려줘)",
    r"역할극|롤플레이|role\s*play",
]

# ── 개인정보 패턴 ──────────────────────────────────────────────────────────────
_PERSONAL_INFO_PATTERNS = [
    r"\d{6}[-‐\s]?\d{7}",                          # 주민등록번호
    r"\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}",    # 카드번호
    r"(주민|주민등록)\s*(번호|등록번호)",
    r"(신용카드|체크카드|카드)\s*번호",
    r"(비밀번호|패스워드|password)\s*(알려|가르쳐|입력)",
    r"계좌\s*번호",
]

# ── 응답 메시지 ────────────────────────────────────────────────────────────────
PROFANITY_RESPONSE = (
    "조금 더 편안하게 이야기해 주실 수 있을까요? 😊 "
    "무엇이 불편하셨는지 말씀해 주시면 최선을 다해 도와드릴게요!"
)

INJECTION_RESPONSE = (
    "저는 플레이데이터 AI 캠퍼스 전용 상담 챗봇이에요! "
    "교육 과정이나 지원 방법에 대해 궁금한 점이 있으시면 편하게 물어봐 주세요 😊"
)

PERSONAL_INFO_RESPONSE = (
    "개인정보는 이 채팅에서 입력하지 않으셔도 돼요! "
    "상담이 필요하시면 담당 매니저에게 직접 연락해 주세요.\n"
    "💬 홈페이지 채널톡 또는 📧 playdata@playdata.io (평일 9시~17시)"
)


def check(message: str) -> str | None:
    """
    입력 메시지에 가드레일 위반이 있으면 대체 응답을 반환.
    정상이면 None 반환.

    우선순위: 인젝션 > 개인정보 > 욕설
    """
    text = message.lower()

    # 1. 프롬프트 인젝션
    for pattern in _INJECTION_PATTERNS:
        if re.search(pattern, text):
            return INJECTION_RESPONSE

    # 2. 개인정보
    for pattern in _PERSONAL_INFO_PATTERNS:
        if re.search(pattern, text):
            return PERSONAL_INFO_RESPONSE

    # 3. 욕설 / 비하
    for word in _PROFANITY:
        if word in text:
            return PROFANITY_RESPONSE

    return None
