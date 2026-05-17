from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.db import models
from app.db.database import SessionLocal, engine
from app.db.migrations import migrate_database
from app.routers import admin, auth, chat
from app.services.faq_service import seed_faqs
from app.services.prompt_service import seed_prompt_configs, update_counseling_prompt
from app.services.rag_service import get_rag_service
from app.services.storage_service import ensure_storage_dirs

models.Base.metadata.create_all(bind=engine)
migrate_database(engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_storage_dirs()
    db = SessionLocal()
    try:
        seed_faqs(db)
        seed_prompt_configs(db)
        update_counseling_prompt(db)
        get_rag_service().index_all(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="엔코아AI캠퍼스 상담 챗봇 API",
    description="FAQ와 문서 기반 교육 상담 API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://chatbot.encorecampus.ai",
        "https://chatbot.encorecampus.ai",
        "http://chatbot.encorecampus.ai.playdata.io",
        "https://chatbot.encorecampus.ai.playdata.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(auth.router, prefix="/api/admin/auth", tags=["Auth"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}


STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(
            str(STATIC_DIR / "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
