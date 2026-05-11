from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",       # 로컬 개발
        "https://playdata.io",
        "https://www.playdata.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록 — 반드시 정적 파일 마운트보다 먼저
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}


# React 빌드 파일 서빙 — 빌드 결과물이 있을 때만 마운트
STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
