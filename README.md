# 엔코어캠퍼스 AI 상담 챗봇

> 교육 과정 안내 및 상담을 위한 문서 기반 RAG 챗봇 시스템

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [RAG 파이프라인](#4-rag-파이프라인)
5. [응답 처리 흐름](#5-응답-처리-흐름)
6. [데이터베이스 구조](#6-데이터베이스-구조)
7. [API 엔드포인트](#7-api-엔드포인트)
8. [AWS 인프라 및 배포](#8-aws-인프라-및-배포)
9. [보안 설계](#9-보안-설계)
10. [프론트엔드 구조](#10-프론트엔드-구조)
11. [관리자 대시보드 기능](#11-관리자-대시보드-기능)
12. [RAGAS 품질 평가](#12-rag-품질-평가-결과-ragas)
13. [디렉토리 구조](#13-디렉토리-구조)
14. [변경 이력](#14-변경-이력)

---

## 1. 프로젝트 개요

엔코어캠퍼스의 교육 과정(AI 오케스트레이션, ML 엔지니어, MLOps 등) 관련 문서와 FAQ를 기반으로 사용자 질문에 자동 답변하는 상담 챗봇입니다.

**주요 기능:**

- 과정 소개, 지원 대상, 커리큘럼, 운영 정책, 환불 규정 등 안내
- FAQ 우선 매칭 → 문서 검색(RAG) → LLM 생성 순의 다층 응답 구조
- 실시간 스트리밍 응답 (Server-Sent Events, 타이핑 효과)
- 대화 이력 기반 맥락 파악 — 연속 질문을 자연스럽게 이어서 답변
- 여러 질문 동시 처리 — 한 메시지에 여러 질문이 있을 때 통합 답변
- 관리자 대시보드: 문서 업로드/승인, FAQ 관리, 프롬프트 편집, 상담 기록 조회, 데이터 관리, DB 브라우저, 권한 관리, 설정
- Google OAuth 2.0 기반 관리자 인증 (JWT 세션, 등록된 이메일만 접근)
- 런타임 LLM 모델 변경 (재시작 없이 OpenAI 모델 즉시 교체)
- 카테고리별 Fernet 암호화 관리 (ON/OFF 토글 + 일괄 암호화↔복호화)
- 경비 시스템(Guardrail): 프롬프트 인젝션, 욕설, 개인정보, 경쟁사 언급 감지 및 차단

---

## 2. 기술 스택

### 백엔드

| 분류 | 기술 |
|------|------|
| 웹 프레임워크 | FastAPI + Uvicorn |
| ORM | SQLAlchemy |
| 데이터베이스 | AWS Aurora RDS (PostgreSQL 호환) |
| LLM | OpenAI GPT (런타임 모델 선택 가능, 기본 `gpt-5-mini`) |
| 임베딩 | OpenAI `text-embedding-3-small` (1536차원) |
| 벡터 DB | FAISS (로컬 인덱스, S3 동기화) |
| LangChain | `langchain-openai`, `langchain-community`, `langchain-text-splitters` |
| PDF 처리 | `opendataloader-pdf` |
| 오브젝트 스토리지 | AWS S3 (`boto3`) |
| 암호화 | `cryptography` (Fernet 대칭 암호화) |
| 인증 | `google-auth[requests]` + `PyJWT` (Google OAuth 2.0 + JWT) |
| 엑셀 내보내기 | `openpyxl` |

### 프론트엔드

| 분류 | 기술 |
|------|------|
| 프레임워크 | React 18 + TypeScript |
| 번들러 | Vite |
| UI | Tailwind CSS |
| HTTP | Axios |
| 라우팅 | React Router v6 |
| 마크다운 렌더링 | react-markdown |
| 아이콘 | lucide-react |
| OAuth | `@react-oauth/google` (Google One Tap 로그인) |

### 인프라 / DevOps

| 분류 | 기술 |
|------|------|
| 서버 | AWS EC2 |
| 데이터베이스 | AWS Aurora RDS (PostgreSQL) |
| 오브젝트 스토리지 | AWS S3 |
| CI/CD | GitHub Actions (self-hosted runner on EC2) |
| 프로세스 관리 | systemd (`chatbot.service`) |

---

## 3. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 브라우저                           │
│           React + TypeScript (Vite, Tailwind CSS)               │
│  ChatPage ─── AdminPage ─── AdminSessionPage                    │
│      ↕              ↕                                           │
│  useChat.ts      api.ts (Axios)                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP / Server-Sent Events
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              AWS EC2 — FastAPI 백엔드 (포트 8888)                 │
│                                                                  │
│  ┌─────────────────┐   ┌──────────────────────────────────────┐ │
│  │  routers/        │   │  services/                           │ │
│  │  ├ chat.py       │   │  ├ rag_service.py      (벡터 검색)  │ │
│  │  └ admin.py      │──▶│  ├ document_service.py (검색 전략)  │ │
│  └─────────────────┘   │  ├ openai_service.py   (LLM 호출)   │ │
│                         │  ├ faq_service.py      (FAQ 매칭)   │ │
│                         │  ├ guardrail_service.py(안전 필터)  │ │
│                         │  ├ prompt_service.py   (프롬프트)   │ │
│                         │  ├ admin_service.py    (문서 관리)  │ │
│                         │  └ storage_service.py  (S3 연동)    │ │
│                         └──────────────────────────────────────┘ │
│                                    │                             │
│          ┌─────────────────────────┼──────────────────┐         │
│          ▼                         ▼                  ▼         │
│  ┌───────────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │ AWS Aurora RDS    │  │  FAISS 인덱스     │  │  AWS S3     │  │
│  │ (PostgreSQL 호환)  │  │  (EC2 로컬 캐시)  │  │             │  │
│  │                   │  │                  │  │ /faiss/     │  │
│  │ chat_sessions     │  │ text-embedding   │  │ /documents/ │  │
│  │ chat_messages     │  │ -3-small 1536dim  │  │ /faq/       │  │
│  │ chat_logs         │  │                  │  │             │  │
│  │ documents         │  └──────────────────┘  └─────────────┘  │
│  │ chunks            │         ↕ (동기화)                        │
│  │ faqs              │      S3 ↔ EC2                            │
│  │ prompt_configs    │                                           │
│  │ admin_audit_logs  │                                           │
│  │ custom_tables     │  ← 데이터 관리: 테이블 메타데이터           │
│  │ custom_columns    │  ← 데이터 관리: 컬럼 정의                   │
│  │ cdata_{id}        │  ← 데이터 관리: 실제 SQL 데이터 테이블      │
│  └───────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼ OpenAI API
              gpt-5-mini  +  text-embedding-3-small
```

---

## 4. RAG 파이프라인

### 4.1 전체 흐름

```
사용자 질문 입력
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                  검색 전략 결정                         │
│  (document_service.py → build_retrieval_plan)         │
│                                                       │
│  비교 질문    → MMR 검색                               │
│  비용/기간    → Hybrid + 규정/과정 파일 지정            │
│  인젝션 감지  → Keyword 검색                           │
│  기본         → Hybrid 검색                            │
└───────────────┬───────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────┐
│              하이브리드 검색 (rag_service.py)           │
│                                                       │
│  ┌─────────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │  Vector Search  │  │ MMR Search  │  │ Keyword  │  │
│  │  (FAISS         │  │ (다양성     │  │ Search   │  │
│  │   Cosine 유사도) │  │  확보)      │  │ (토큰    │  │
│  └────────┬────────┘  └──────┬──────┘  │ 오버랩)  │  │
│           └─────────┬────────┘         └────┬─────┘  │
│                     ▼                        │        │
│              Reciprocal Rank Fusion          │        │
│                     +                        │        │
│               리랭킹 (Rerank)  ◀─────────────┘        │
│                                                       │
│  리랭킹 가중치:                                        │
│  - 벡터 유사도     × 5.0                               │
│  - 키워드 오버랩   × 1.8                               │
│  - 완전 문구 매칭  + 3.0 (보너스)                      │
│  - 헤더 토큰 매칭  × 1.2                               │
└───────────────┬───────────────────────────────────────┘
                │
                ▼ 최종 top_k 문서
┌───────────────────────────────────────────────────────┐
│              LLM 응답 생성 (openai_service.py)         │
│                                                       │
│  System Prompt:                                       │
│  ├ 상담 시스템 프롬프트 (Aurora RDS에서 런타임 로드)    │
│  └ 채팅 스타일 가이드 (말풍선 3개 이하, 목록 형식)      │
│                                                       │
│  User Message:                                        │
│  ├ 사용자 질문                                         │
│  └ 검색된 문서 내용 (참고 자료)                         │
│                                                       │
│  → gpt-5-mini ChatCompletion 호출                     │
│  → Server-Sent Events로 토큰 단위 스트리밍 전송        │
└───────────────────────────────────────────────────────┘
```

### 4.2 임베딩 및 벡터 저장소

```python
# 임베딩 모델
OpenAIEmbeddings(model="text-embedding-3-small")  # 1536차원

# FAISS 인덱스 — EC2 로컬에 캐시, S3와 양방향 동기화
vectorstore = FAISS.load_local(FAISS_DIR, embeddings)
vectorstore.save_local(FAISS_DIR)

# S3 동기화
storage_service.download_faiss_from_s3()  # 서버 시작 시
storage_service.upload_faiss_to_s3()      # 인덱스 재구성 후
```

### 4.3 청킹 전략

```python
RecursiveCharacterTextSplitter.from_language(
    language=Language.MARKDOWN,
    chunk_size=1200,   # 최대 1200자
    chunk_overlap=150  # 150자 겹침 (문맥 유지)
)

# 청크 메타데이터
{
    "source_type": "document | faq",
    "title": "문서 제목",
    "category": "과정 상세 | 운영규정 | 플레이데이터 정보",
    "file": "logical_name"
}
```

### 4.4 검색 파일 분류

```python
COURSE_FILES     = ["course_ai_orchestration", "course_ml_engineer", "course_mlops"]
PLAYDATA_FILES   = ["playdata_intro", "campus_info", "homepage_intro"]
REGULATION_FILES = ["national_training_card_eligibility",
                    "national_training_card_regulation",
                    "vocational_training_regulation"]
LAW_FILES        = ["privacy_law", "fair_labeling_law"]
```

---

## 5. 응답 처리 흐름

```
POST /api/chat/stream
        │
        ▼
[1] Guardrail 체크 (guardrail_service.py)
    ├─ 프롬프트 인젝션 감지 → source="guardrail"
    ├─ 개인정보 요청 감지 → source="guardrail"
    ├─ 욕설/비하 감지    → source="guardrail"
    └─ 경쟁사 언급 감지  → source="guardrail"
        │ (통과)
        ▼
[2] 취소/환불 요청?  → source="handoff"  (채널톡 URL 제공)
[3] 상담원 연결?     → source="handoff"
[4] 인사말?          → source="faq"     (고정 응답)
        │ (해당 없음)
        ▼
[5] FAQ 매칭 (faq_service.py)
    ├─ 버튼 FAQ (정확 매칭)    → source="faq"
    ├─ 일반 FAQ (유사도 ≥ 6.0) → source="faq"
    └─ 훈련비/모집인원/취업률 특수 쿼리 → source="faq"
        │ (FAQ 미매칭)
        ▼
[6] 문서 검색 + LLM 생성 (RAG 파이프라인)
    → source="document"
        │ (검색 실패 / 오류)
        ▼
[7] Fallback 응답 → source="fallback"

응답 source 타입:
  "faq"       — FAQ DB 직접 답변
  "document"  — 문서 검색 후 LLM 생성
  "fallback"  — 기본 오류 응답
  "guardrail" — 안전장치 적용 응답
  "handoff"   — 채널톡 상담원 연결 안내
```

---

## 6. 데이터베이스 구조

**Aurora RDS (PostgreSQL 호환)** — `DATABASE_URL` 환경변수로 연결

### 테이블 목록

| 테이블 | 설명 | 암호화 적용 필드 |
|--------|------|----------------|
| `chat_sessions` | 사용자 채팅 세션 | `encrypted_user_name` |
| `chat_messages` | 개별 메시지 | `content` |
| `chat_logs` | 상담 로그 (API 비용 포함) | `question`, `answer`, `retrieval_chunks` |
| `documents` | 업로드 문서 메타 | `original_filename`, `error_message` (설정에 따라) |
| `chunks` | 문서 청크 | `content` |
| `faqs` | FAQ 항목 | 암호화 설정에 따라 선택적 적용 |
| `prompt_configs` | 시스템 프롬프트 관리 | 암호화 설정에 따라 선택적 적용 |
| `admin_users` | 관리자 권한 이메일 목록 | — |
| `admin_audit_logs` | 관리자 작업 감시 로그 | — |
| `cancel_requests` | 취소/환불 요청 기록 | — |
| `processing_logs` | 문서 처리 상태 로그 | — |
| `custom_tables` | 데이터 관리 탭: 사용자 정의 테이블 메타데이터 | — |
| `custom_columns` | 데이터 관리 탭: 컬럼 정의 (text/number/date) | — |
| `cdata_{id}` | 데이터 관리 탭: 실제 데이터 저장 테이블 (동적 생성) | — |

### 암호화 방식

```python
# Fernet 대칭 암호화 (utils/crypto.py)
# 저장 형식: "enc::<base64_token>"
encrypt("민감한 텍스트")          # → "enc::gAAAAAB..."
decrypt_if_needed("enc::gAAAAAB...") # → "민감한 텍스트"
```

카테고리별 암호화 ON/OFF는 `.env`의 `ENCRYPT_FAQ` / `ENCRYPT_PROMPT` / `ENCRYPT_DOCUMENT` 값으로 제어되며, 관리자 대시보드 설정 탭에서 토글 및 일괄 마이그레이션(평문↔암호화) 가능. 채팅 내용은 항상 암호화.

### SQLite → Aurora RDS 마이그레이션

로컬 개발 시 생성된 SQLite 데이터를 Aurora RDS로 이전할 때:

```bash
cd backend
python scripts/migrate_sqlite_to_rds.py
```

---

## 7. API 엔드포인트

### 채팅 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/chat` | 동기 채팅 (단일 응답) |
| `POST` | `/api/chat/stream` | 스트리밍 채팅 (SSE) |
| `GET` | `/api/chat/suggested` | 추천 질문 목록 |

### 관리자 API (`Authorization: Bearer <JWT>` 헤더 필요)

**인증**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/admin/auth/verify` | Google ID Token 검증 → JWT 발급 (8시간 유효) |

**권한 관리**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/admin/permissions` | 등록된 관리자 이메일 목록 |
| `POST` | `/api/admin/permissions` | 이메일 추가 |
| `DELETE` | `/api/admin/permissions/{email}` | 이메일 제거 |

**문서 관리**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/admin/upload-pdf` | PDF 업로드 → Markdown 변환 |
| `POST` | `/api/admin/upload-md` | Markdown 직접 업로드 |
| `POST` | `/api/admin/upload-faq-md` | FAQ Markdown 업로드 |
| `POST` | `/api/admin/import-catalog` | 카탈로그 일괄 가져오기 |
| `GET` | `/api/admin/documents` | 문서 목록 |
| `GET` | `/api/admin/documents/{id}` | 문서 상세 |
| `POST` | `/api/admin/documents/{id}/approve` | 문서 승인 → 인덱싱 대상 포함 |
| `POST` | `/api/admin/documents/{id}/reject` | 문서 반려 |
| `POST` | `/api/admin/documents/{id}/restore` | 문서 복원 |
| `DELETE` | `/api/admin/documents/{id}` | 문서 삭제 |
| `POST` | `/api/admin/documents/{id}/retry` | 처리 재시도 |
| `POST` | `/api/admin/reindex` | FAISS 인덱스 전체 재구성 + S3 동기화 |

**FAQ 관리**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/admin/faqs` | FAQ 목록 |
| `POST` | `/api/admin/faqs` | FAQ 생성 |
| `PUT` | `/api/admin/faqs/{id}` | FAQ 수정 |
| `DELETE` | `/api/admin/faqs/{id}` | FAQ 삭제 |

**프롬프트 관리**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/admin/prompts` | 프롬프트 목록 |
| `POST` | `/api/admin/prompts` | 프롬프트 생성 |
| `PUT` | `/api/admin/prompts/{key}` | 프롬프트 수정 |
| `DELETE` | `/api/admin/prompts/{key}` | 프롬프트 삭제 |

**모니터링**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/admin/sessions` | 세션 목록 |
| `GET` | `/api/admin/sessions/{id}` | 세션 상세 |
| `GET` | `/api/admin/logs` | 처리 로그 |
| `GET` | `/api/admin/audit-logs` | 관리자 감시 로그 |
| `GET` | `/api/admin/chat-logs` | 상담 로그 (start_date, end_date, session_id 필터) |
| `GET` | `/api/admin/chat-logs/export` | 상담 로그 Excel 내보내기 |

**설정**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/admin/settings/model` | 현재 모델 + OpenAI 사용 가능 모델 목록 |
| `PUT` | `/api/admin/settings/model` | LLM 모델 변경 (.env 갱신 + 캐시 clear, 재시작 불필요) |
| `GET` | `/api/admin/settings/encryption` | 카테고리별 암호화 설정 + 암호화/평문 레코드 수 |
| `PUT` | `/api/admin/settings/encryption/{category}` | 암호화 ON/OFF 토글 (faq / prompt / document) |
| `POST` | `/api/admin/settings/encryption/migrate` | 해당 카테고리 전체 레코드 일괄 암호화↔복호화 |

**데이터 관리** (사용자 정의 데이터 테이블)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/admin/data-tables` | 테이블 목록 |
| `POST` | `/api/admin/data-tables` | 테이블 생성 → RDS에 실제 `cdata_{id}` SQL 테이블 CREATE |
| `GET` | `/api/admin/data-tables/export-all` | 모든 테이블을 개요+시트별로 묶어 Excel 1개 다운로드 |
| `DELETE` | `/api/admin/data-tables/{id}` | 테이블 삭제 → `cdata_{id}` DROP TABLE |
| `GET` | `/api/admin/data-tables/{id}` | 테이블 상세 (컬럼 + 데이터 행) |
| `POST` | `/api/admin/data-tables/{id}/columns` | 컬럼 추가 → ALTER TABLE ADD COLUMN |
| `PUT` | `/api/admin/data-tables/{id}/columns/{cid}` | 컬럼 이름 변경 → ALTER TABLE RENAME COLUMN |
| `POST` | `/api/admin/data-tables/{id}/columns/{cid}/reorder` | 컬럼 순서 위/아래 이동 |
| `DELETE` | `/api/admin/data-tables/{id}/columns/{cid}` | 컬럼 삭제 → ALTER TABLE DROP COLUMN |
| `POST` | `/api/admin/data-tables/{id}/rows` | 행 추가 → INSERT INTO |
| `PUT` | `/api/admin/data-tables/{id}/rows/{rid}` | 행 수정 → UPDATE |
| `DELETE` | `/api/admin/data-tables/{id}/rows/{rid}` | 행 삭제 → DELETE |
| `GET` | `/api/admin/data-tables/{id}/export` | 개별 테이블 Excel 내보내기 |
| `POST` | `/api/admin/data-tables/{id}/import` | CSV / Excel 파일로 행 일괄 가져오기 |

**DB 브라우저** (RDS 전체 테이블 조회)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/admin/db/tables` | RDS 전체 테이블 목록 + 각 테이블 한국어 설명 |
| `GET` | `/api/admin/db/tables/{name}` | 테이블 데이터 페이지네이션 조회 (암호화 필드 자동 복호화) |

---

## 8. AWS 인프라 및 배포

### 인프라 구성

```
GitHub main 브랜치 push
        │
        ▼
GitHub Actions (self-hosted runner — EC2 위에서 직접 실행)
        │
        ├─ 1. git fetch && git reset --hard origin/main
        ├─ 2. backend/.env 생성 (GitHub Secrets → 환경변수 주입)
        ├─ 3. source backend/venv/bin/activate
        ├─ 4. pip install -r backend/requirements.txt
        ├─ 5. cd frontend && npm install && npm run build
        └─ 6. sudo systemctl restart chatbot
                │
                ▼
        EC2 인스턴스
        ├─ 백엔드: uvicorn (포트 8888)
        ├─ 프론트엔드: Vite 빌드 정적 파일
        └─ FAISS 인덱스: EC2 로컬 (/data/faiss_index/)
```

### AWS 서비스 역할

| 서비스 | 용도 |
|--------|------|
| EC2 | 백엔드(FastAPI) + 프론트엔드(빌드 결과물) 호스팅 |
| Aurora RDS | 운영 데이터베이스 (PostgreSQL 호환, 고가용성) |
| S3 | FAISS 인덱스 + 문서 파일(PDF, MD, JSON, 청크, 임베딩) 영구 저장 |

### S3 버킷 구조

```
s3://<bucket>/document-chatbot/
├── faiss/
│   ├── index.faiss        ← FAISS 벡터 인덱스
│   └── index.pkl          ← 메타데이터 (문서 ID 매핑)
└── documents/
    └── <logical_name>/
        └── v<N>/
            ├── document.md
            ├── chunks.json
            └── embeddings.npy
```

### GitHub Secrets (배포 환경변수)

| 시크릿 이름 | 용도 |
|------------|------|
| `OPENAI_API_KEY` | OpenAI API 인증 |
| `ENCRYPTION_KEY` | Fernet 암호화 키 (base64) |
| `ADMIN_PASSWORD` | 레거시 (현재 Google OAuth로 대체, 유지 가능) |
| `DATABASE_URL` | Aurora RDS 연결 문자열 |
| `AWS_ACCESS_KEY_ID` | AWS 자격증명 |
| `AWS_SECRET_ACCESS_KEY` | AWS 자격증명 |
| `AWS_S3_BUCKET` | S3 버킷명 |
| `CHANNEL_TALK_URL` | 채널톡 상담원 연결 URL |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID (프론트 + 백엔드 공용) |
| `JWT_SECRET` | JWT 서명 비밀키 (8시간 세션 토큰) |
| `ADMIN_EMAIL` | 최초 부트스트랩 관리자 이메일 (DB 없이도 항상 접근 가능) |
| `LANGSMITH_API_KEY` | LangSmith 추적 |
| `LANGSMITH_PROJECT` | LangSmith 프로젝트명 |

---

## 9. 보안 설계

### Guardrail (guardrail_service.py)

감지 순서 및 항목:

| 우선순위 | 감지 항목 | 처리 방식 |
|---------|----------|----------|
| 1 | 프롬프트 인젝션 (DAN mode, 역할극, 시스템 무시 시도) | 차단 + 안내 응답 |
| 2 | 개인정보 (주민등록번호, 신용카드, 계좌번호 패턴) | 차단 + 안내 응답 |
| 3 | 욕설 / 비하 | 차단 + 안내 응답 |
| 4 | 경쟁사 언급 (코드스테이츠, 패스트캠퍼스, 엘리스 등) | 차단 + 안내 응답 |
| 5 | 분노 / 비난 표현 ("최악", "사기", "형편없" 등) | 차단 + 안내 응답 |

### 데이터 암호화

- **알고리즘**: Fernet (AES-128-CBC + HMAC-SHA256)
- **대상**: 사용자 이름, 메시지 내용, 상담 질문/답변, FAQ 전체 내용
- **식별자**: 암호화된 값은 `enc::` 접두사로 구분하여 선택적 복호화

### 관리자 인증 (Google OAuth 2.0 + JWT)

```
1. 관리자 → Google One Tap 로그인 → Google ID Token 발급
2. POST /api/admin/auth/verify  { credential: "<Google ID Token>" }
   → google-auth로 토큰 검증
   → 이메일이 ADMIN_EMAIL 또는 admin_users 테이블에 있으면 허용
   → JWT(8시간 유효, HS256) 발급

3. 이후 모든 /api/admin/* 요청:
   Authorization: Bearer <JWT>

4. 401 응답 시 프론트엔드가 토큰 삭제 + 페이지 리로드
```

부트스트랩: `.env`의 `ADMIN_EMAIL`은 DB 미등록 상태에서도 항상 접근 허용 → 최초 설정 후 `admin_users`에 추가 이메일 등록 가능.

### 관리자 감시 로그 (admin_audit_logs)

모든 관리자 작업(문서 업로드/승인/삭제, FAQ 수정, 프롬프트 변경)이 `admin_audit_logs` 테이블에 기록됨

---

## 10. 프론트엔드 구조

### 페이지 구성

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/` | `ChatPage.tsx` | 메인 채팅 인터페이스 |
| `/admin` | `AdminPage.tsx` | 관리자 대시보드 (8개 탭) |
| `/admin/sessions/:id` | `AdminSessionPage.tsx` | 세션 상세 |

**AdminPage 탭 구성**

| 탭 | 설명 |
|----|------|
| 문서 관리 | PDF/Markdown 업로드, 승인/반려, 재시도 |
| FAQ 관리 | FAQ 조회/생성/수정/삭제 |
| 프롬프트 | 시스템 프롬프트 런타임 편집 |
| 로그/내보내기 | 상담 로그 필터 조회 + Excel 내보내기 |
| 데이터 관리 | 커스텀 SQL 테이블 CRUD + 컬럼 이름/순서 변경 + CSV·Excel 가져오기·내보내기 |
| DB 브라우저 | RDS 전체 테이블 탐색 + 암호화 필드 복호화 표시 |
| 설정 | LLM 모델 선택 + 카테고리별 암호화 ON/OFF + 일괄 마이그레이션 |
| 권한 관리 | 관리자 이메일 추가/제거 |

### 핵심 커스텀 훅 (useChat.ts)

```typescript
const {
    messages,            // 메시지 목록
    isLoading,           // 응답 대기 중
    suggestedQuestions,  // 추천 질문 버튼
    sendMessage,         // 메시지 전송
    stopGenerating,      // 응답 중단
    loadConversation,    // 대화 이력 로드
} = useChat()
```

### 스트리밍 응답 처리

```typescript
// Server-Sent Events — 토큰 단위 수신 → 메시지 실시간 업데이트
await chatApi.streamMessage(
    sessionId, message, history,
    onToken,  // 토큰마다 화면 업데이트
    onDone,   // 완료 시 source 정보 수신
    onError
)
```

### 세션 저장소 (sessionStorage)

```typescript
"chatConversations:v2"  // 대화 목록 (제목, 메시지, 세션ID)
"chatCurrentConvId:v2"  // 현재 대화 ID
"adminToken"            // 관리자 JWT (탭 세션 한정, 8시간 유효)
```

---

## 11. 관리자 대시보드 기능

### 인증 흐름

Google One Tap 로그인 → ID Token 전송 → 백엔드 검증 → JWT 발급 → sessionStorage 저장 → 이후 모든 API에 Bearer 자동 첨부. 401 수신 시 자동 로그아웃.

### 설정 탭

**LLM 모델 선택**
- OpenAI API에서 사용 가능한 채팅 모델 목록 실시간 조회 (TTS·이미지·임베딩·레거시 모델 자동 제외)
- 라디오 카드 방식 — 모델별 설명·속도·컨텍스트·입출력 단가($/1M tok) 표시
- 추천순·지능순·가성비순·가격순·속도순 정렬, 클릭마다 오름/내림 토글
- 선택 후 "선택한 모델로 적용" → `.env` 즉시 갱신 + 설정 캐시 clear → 재시작 없이 반영

**암호화 설정**

```
카테고리별 암호화 관리:
  ┌──────────────────┬────────┬───────┬───────┐
  │ 카테고리          │ 암호화  │ 암호화 │ 평문  │
  │                  │ ON/OFF │  건수 │  건수 │
  ├──────────────────┼────────┼───────┼───────┤
  │ FAQ 내용          │ 토글   │   N건 │   M건 │
  │ 프롬프트 내용     │ 토글   │   N건 │   M건 │
  │ 문서 파일명·검토  │ 토글   │   N건 │   M건 │
  │ 채팅 내용         │ 항상 ON│  (고정)│       │
  └──────────────────┴────────┴───────┴───────┘

토글: .env 갱신 → 이후 쓰기 시 반영
마이그레이션 버튼: 기존 레코드 전체를 즉시 암호화↔복호화
```

### 권한 관리 탭

- **최상위 관리자 카드**: `.env`의 `ADMIN_EMAIL` 계정을 상단에 별도 표시. 삭제 불가·모든 권한 보유
- **관리자 목록**: 이메일·추가자(added_by)·추가 일시 표시. 현재 로그인 계정에 "나" 뱃지
- **관리자 추가/제거**: 이메일 입력 후 추가, 불필요 시 제거
- **최상위 관리자 이메일 변경**: 슈퍼어드민 본인 로그인 시에만 변경 폼 노출. 변경 후 2초 뒤 자동 로그아웃

### 데이터 관리 탭 (커스텀 SQL 테이블)

비개발자도 브라우저에서 구조화 데이터를 관리할 수 있는 기능:

```
1. 테이블 생성 → RDS에 cdata_{id} CREATE
2. 컬럼 추가 (text/number/date) → ALTER TABLE ADD COLUMN
3. 컬럼 이름 변경 → ALTER TABLE RENAME COLUMN
4. 컬럼 순서 변경 (↑↓) → sort_order 재정렬
5. 행 CRUD → INSERT / UPDATE / DELETE
6. CSV / Excel 가져오기 → 헤더 자동 매핑 후 일괄 INSERT
7. Excel 내보내기 (개별) → 선택 테이블 .xlsx
8. Excel 내보내기 (전체) → 개요 시트 + 테이블별 시트로 구성
```

- 컬럼 타입 → SQL 매핑: `text` → TEXT, `number` → NUMERIC, `date` → DATE
- 생성된 테이블은 DB 브라우저 탭에서도 즉시 확인 가능

### DB 브라우저 탭

RDS Aurora의 전체 테이블을 읽기 전용으로 탐색:

- 모든 시스템 테이블에 한국어 설명 표시
- `cdata_*` 테이블은 데이터 관리에서 입력한 테이블명/설명으로 표시
- 암호화된 필드(`enc::` 접두사) 자동 복호화 후 원문 표시
- 페이지네이션 지원 (기본 50행, 최대 200행/페이지)

---

## 12. RAG 품질 평가 결과 (RAGAS)

평가 일시: 2026-05-13 | 평가 도구: [RAGAS](https://github.com/explodinggradients/ragas)
총 질문 수: 52개 (RAGAS 평가 47개 + Hallucination 테스트 5개)

### RAGAS 4대 지표

| 지표 | 점수 | 설명 |
|------|------|------|
| **Faithfulness** | **0.9656** (96.6%) | 답변이 검색된 문서 내용에 근거한 비율. 높을수록 환각 없음 |
| **Answer Relevancy** | **0.4737** (47.4%) | 답변이 질문에 얼마나 직접적으로 대응하는지 |
| **Context Precision** | **0.7554** (75.5%) | 검색된 문서 중 실제로 필요한 문서 비율 (검색 정밀도) |
| **Context Recall** | **0.9220** (92.2%) | 정답 도출에 필요한 문서를 빠짐없이 검색했는지 (검색 재현율) |

### Hallucination 테스트

| 항목 | 결과 |
|------|------|
| 테스트 케이스 | 5개 (문서에 없는 정보 질문) |
| 올바른 거절 | 5/5 |
| **통과율** | **100%** |

테스트된 거절 케이스: 수료율, 취업률, 강사 이름, 환불 정책, 장학금 제도 질문 → 전부 "확인 불가" 응답으로 정상 처리

### 해석

- **Faithfulness(97%)** 및 **Context Recall(92%)** 이 높아 검색된 문서를 충실히 활용하고 필요한 문서를 잘 찾아냄
- **Answer Relevancy(47%)** 가 낮은 이유: 상담형 답변 특성상 공감/도입 문장, 후속 질문 안내 등이 포함되어 "직접 답변" 비율이 낮게 측정됨 (지표 특성상 불이익)
- **Hallucination 0건**: 문서에 없는 내용을 만들어내지 않음

---

## 13. 디렉토리 구조

```
document-chatbot_practice/
├── .github/
│   └── workflows/
│       └── deploy.yml              ← CI/CD (EC2 self-hosted runner)
│
├── backend/
│   ├── app/
│   │   ├── main.py                 ← FastAPI 애플리케이션 진입점
│   │   ├── config.py               ← 설정 (pydantic-settings, .env 로드)
│   │   ├── db/
│   │   │   ├── models.py           ← SQLAlchemy ORM 모델 (custom_tables, custom_columns 포함)
│   │   │   ├── database.py         ← Aurora RDS 연결 및 세션
│   │   │   ├── crud.py             ← CRUD 유틸리티
│   │   │   └── migrations.py       ← 스키마 마이그레이션
│   │   ├── routers/
│   │   │   ├── chat.py             ← 채팅 API 라우터
│   │   │   └── admin.py            ← 관리자 API 라우터
│   │   ├── services/
│   │   │   ├── rag_service.py      ← FAISS 벡터 검색 + 하이브리드 검색
│   │   │   ├── document_service.py ← 검색 전략 결정 (build_retrieval_plan)
│   │   │   ├── openai_service.py   ← gpt-5-mini 호출 + SSE 스트리밍
│   │   │   ├── faq_service.py      ← FAQ 유사도 매칭
│   │   │   ├── guardrail_service.py← 입력 안전 필터
│   │   │   ├── admin_service.py    ← 문서 업로드/처리/승인 워크플로우
│   │   │   ├── prompt_service.py   ← Aurora RDS 기반 프롬프트 런타임 관리
│   │   │   ├── storage_service.py  ← AWS S3 파일 입출력
│   │   │   ├── transformation_service.py ← FAQ Markdown → DB 변환
│   │   │   └── response_formatter.py← 응답 마크다운 포매팅
│   │   ├── models/
│   │   │   ├── chat.py             ← Pydantic 요청/응답 스키마
│   │   │   └── session.py
│   │   └── utils/
│   │       ├── crypto.py           ← Fernet 암호화/복호화
│   │       └── pdf_converter.py    ← PDF → Markdown 변환
│   ├── scripts/
│   │   └── migrate_sqlite_to_rds.py ← SQLite → Aurora RDS 데이터 이전
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 ← 라우팅 설정
│   │   ├── pages/
│   │   │   ├── ChatPage.tsx
│   │   │   ├── AdminPage.tsx
│   │   │   └── AdminSessionPage.tsx
│   │   ├── components/chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── InputBar.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── SuggestedQuestions.tsx
│   │   │   └── HistoryPanel.tsx
│   │   ├── hooks/useChat.ts
│   │   ├── services/api.ts
│   │   └── types/index.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── data/
│   ├── faiss_index/                ← FAISS 인덱스 (git 제외, S3 동기화)
│   ├── faq/                        ← FAQ JSON
│   ├── docs/                       ← 원본 문서
│   ├── managed_docs/               ← 관리 대상 Markdown
│   ├── managed_chunks/             ← 청크 파일
│   ├── managed_embeddings/         ← 임베딩 벡터
│   └── managed_json/               ← JSON 변환본
│
└── scripts/                        ← 유틸리티 스크립트 (PDF 처리 등)
```

---

## 문서 업로드 → 서비스 적용 흐름

```
1. 관리자가 Markdown 문서 업로드
   POST /api/admin/upload-md
        │
        ▼
2. 자동 처리
   청크 분할 (1200자/150자 overlap)
   → OpenAI 임베딩 생성
   → ChunkRecord Aurora RDS 저장
   → 파일 S3 업로드
   status: "uploaded" → "review"
        │
        ▼
3. 관리자 승인
   POST /api/admin/documents/{id}/approve
   is_active = true, status = "ready"
        │
        ▼
4. FAISS 인덱스 재구성
   POST /api/admin/reindex
   → 활성 문서 전체 로드
   → 인덱스 재빌드
   → EC2 로컬 저장 + S3 동기화
        │
        ▼
5. 새 문서 내용이 검색에 즉시 반영
```

---

## 14. 변경 이력

### 2026-05-17

**Google OAuth 2.0 관리자 인증 전환**
- 비밀번호 로그인 제거 → Google One Tap 로그인으로 전환
- 백엔드: `google-auth[requests]`로 ID Token 검증 → `PyJWT`로 8시간 JWT 발급
- `admin_users` 테이블 추가 — 허용 이메일 목록 관리
- 부트스트랩 관리자: `.env`의 `ADMIN_EMAIL`은 DB 미등록 상태에서도 항상 접근 가능
- 프론트엔드: `adminPassword` → `adminToken` (sessionStorage), 401 수신 시 자동 로그아웃

**런타임 LLM 모델 선택**
- 설정 탭 신규 추가: OpenAI API에서 사용 가능한 채팅 모델 목록 실시간 조회
- 드롭다운 선택 후 "적용" → `.env` 갱신 + `get_settings()` 캐시 clear → 재시작 없이 즉시 반영
- 새 모델 출시 시 자동 목록 갱신 (instruct/fine-tuned 모델 필터 제외)

**권한 관리 탭**
- 관리자 이메일 추가/제거 UI
- `ADMIN_EMAIL`(기본 관리자)은 제거 불가 처리

**챗봇 답변 톤 개선**
- 말투를 따뜻하고 친근한 상담사 스타일로 조정
- 이모티콘: 자연스러울 때 1-2개 허용 (억지 사용 금지, 응답당 최대 2개)

**카테고리별 암호화 관리**
- 설정 탭에 암호화 섹션 추가
- FAQ 내용 / 프롬프트 내용 / 문서 파일명의 암호화 ON/OFF 토글 (채팅은 항상 ON)
- 카테고리별 암호화/평문 레코드 수 현황 표시
- 일괄 마이그레이션 버튼: 기존 레코드를 암호화↔평문 전환
- 새 데이터 저장 시 해당 설정 자동 적용 (토글 직후부터 반영)
- `.env`에 `ENCRYPT_FAQ` / `ENCRYPT_PROMPT` / `ENCRYPT_DOCUMENT` 추가 (기본값 `true`)

**데이터 관리 탭 기능 확장**
- **컬럼 이름 변경**: 이름 클릭 → 인라인 편집 → Enter 저장 / Escape 취소 (ALTER TABLE RENAME COLUMN)
- **컬럼 순서 변경**: ↑↓ 버튼으로 인접 컬럼과 위치 교환 (sort_order 재정렬)
- **CSV / Excel 가져오기**: 헤더 행이 컬럼명과 일치하면 자동 매핑 → 일괄 INSERT (UTF-8 BOM 지원)
- **전체 내보내기**: 모든 테이블을 개요 시트 + 테이블별 시트로 묶어 Excel 1개 다운로드

**권한 관리 탭 UI 개선**
- 최상위 관리자(`ADMIN_EMAIL`) 별도 카드로 상단 강조 표시 — 삭제 불가·모든 권한 보유 명시
- 관리자 목록에 추가자(added_by)·추가 일시 표시
- 현재 로그인 계정에 "나" 뱃지 표시
- `/admin/permissions` 응답에 `superadmin`, `current_user`, `added_by`, `created_at` 필드 추가
- **최상위 관리자 이메일 변경**: 슈퍼어드민 본인 로그인 시에만 변경 폼 노출
  - `PUT /admin/settings/superadmin` — `.env`의 `ADMIN_EMAIL` 갱신 + 캐시 clear
  - 변경 성공 시 2초 후 자동 로그아웃 (권한 이전)
  - 비슈퍼어드민 요청 시 403 반환

**LLM 모델 설정 전면 개편**
- 드롭다운 → 라디오 카드 방식으로 교체: 모델별 특징·속도·입출력 가격 한눈에 비교
- 실제 OpenAI API 가격 표시 (입력/출력 per 1M tokens 기준)
- TTS·이미지 생성·임베딩 모델 필터: `realtime·audio·tts·whisper·dall·embedding·moderation·vision` 키워드 포함 시 목록 제외
- 레거시 모델 UI에서 제거 (`gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo`, `o1`, `o1-mini`)
- GPT-5 계열 추가 (`gpt-5` 접두사 필터 포함)
  - `gpt-5-mini`: $0.25/$2.00 per 1M tok, 400K ctx, 지능 9/추천 10 — 현재 최고 가성비
  - `gpt-5`: $2.50/$15.00 per 1M tok — 최고 성능 플래그십
- 5가지 정렬 기준: **추천순 · 지능순 · 가성비순 · 가격순 · 속도순** (클릭 시 오름/내림 토글, ↑↓ 표시)
- 가성비 = 지능 점수 ÷ 총 가격으로 동적 계산
- 뱃지 체계: 최신(보라) · 추천(초록) · 레거시(주황) · 현재(청록)

### 2026-05-16

**데이터 관리 ↔ DB 브라우저 연동**
- 데이터 관리 탭에서 테이블 생성 시 RDS에 실제 SQL 테이블(`cdata_{id}`) 자동 생성
- 컬럼 추가/삭제가 `ALTER TABLE ADD/DROP COLUMN`으로 실제 스키마 변경
- 행 CRUD가 `INSERT / UPDATE / DELETE INTO cdata_{id}` 실제 SQL DML로 동작
- DB 브라우저에서 `cdata_*` 테이블을 데이터 관리 테이블명·설명으로 표시
- DB 브라우저 전체 테이블에 한국어 설명 추가
- DB 브라우저 암호화 필드(`enc::`) 자동 복호화 후 원문 표시
- 기존 CustomRow EAV JSON 방식 제거

### 2026-05-15

**챗봇 응답 품질 개선**
- 대화 이력(`history`) 기반 맥락 파악 후 불필요한 되묻기 방지
- 한 메시지에 여러 질문이 있을 때 통합해서 한 번에 답변
- 이전 대화에서 약속한 내용 이행 (거절/주제 전환 시 예외 처리)
- 단독 "채널톡" 키워드로 핸드오프 오인식 방지
- LLM이 "관리자 콘솔" 등 내부 언어 노출하지 않도록 규칙 추가
- 채널톡 URL을 LLM 컨텍스트에 주입하여 링크 직접 제공

**관리자 페이지 개선**
- 대화 로그 조회 버튼 작동 수정 및 세션 ID 선택 사항으로 변경
- 로그인 비밀번호 표시/숨기기 토글 추가
- 데이터 관리 탭 신규 추가 (커스텀 테이블 CRUD + Excel 내보내기)
- DB 브라우저 탭 신규 추가 (RDS Aurora 전체 테이블 탐색)

**용어 정정**
- 제공 물품·지참 사항 관련 FAQ, 문서, 스크립트에서 맥락별 용어 통일
