from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import chat, admin
from app.db.database import engine
from app.db import models

# DB 테이블 자동 생성
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CodeAI 교육 상담 챗봇 API",
    description="FAQ + Markdown 문서 기반 교육 과정 안내 챗봇 백엔드",
    version="1.0.0",
)

# CORS 설정 — 개발 환경에서는 Vite dev server(5173) 허용
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",  # Vite가 포트 자동 증가해도 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "CodeAI 챗봇 API가 실행 중입니다."}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}
