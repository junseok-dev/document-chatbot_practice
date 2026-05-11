from sqlalchemy import Column, String, Text, DateTime, Integer
from sqlalchemy.sql import func
from app.db.database import Base


class ChatSession(Base):
    """상담 세션 테이블 - 대화 전체 기록"""
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, index=True)  # UUID
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    message_count = Column(Integer, default=0)
    # 개인정보는 암호화 저장
    encrypted_user_name = Column(Text, nullable=True)


class ChatMessage(Base):
    """개별 메시지 테이블"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), index=True)
    role = Column(String(10))           # 'user' | 'assistant'
    content = Column(Text)
    source = Column(String(20))         # 'faq' | 'document' | 'fallback'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
