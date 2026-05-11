from pydantic import BaseModel
from typing import Literal, Optional


class ChatRequest(BaseModel):
    session_id: str
    message: str
    user_name: Optional[str] = None  # 입력 시 암호화하여 DB 저장


class ChatResponse(BaseModel):
    answer: str
    source: Literal["faq", "document", "ai", "fallback"]
    session_id: str


class SuggestedQuestion(BaseModel):
    id: str
    label: str
    query: str


class SuggestedQuestionsResponse(BaseModel):
    questions: list[SuggestedQuestion]
