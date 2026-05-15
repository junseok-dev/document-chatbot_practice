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
11. [디렉토리 구조](#11-디렉토리-구조)

---

## 1. 프로젝트 개요

엔코어캠퍼스의 교육 과정(AI 오케스트레이션, ML 엔지니어, MLOps 등) 관련 문서와 FAQ를 기반으로 사용자 질문에 자동 답변하는 상담 챗봇입니다.

**주요 기능:**

- 과정 소개, 지원 대상, 커리큘럼, 운영 정책, 환불 규정 등 안내
- FAQ 우선 매칭 → 문서 검색(RAG) → LLM 생성 순의 다층 응답 구조
- 실시간 스트리밍 응답 (Server-Sent Events, 타이핑 효과)
- 관리자 대시보드: 문서 업로드/승인, FAQ 관리, 프롬프트 편집, 상담 기록 조회
- 개인정보 및 메시지 내용 Fernet 암호화 저장
- 경비 시스템(Guardrail): 프롬프트 인젝션, 욕설, 개인정보, 경쟁사 언급 감지 및 차단

---

## 2. 기술 스택

### 백엔드

| 분류 | 기술 |
|------|------|
| 웹 프레임워크 | FastAPI + Uvicorn |
| ORM | SQLAlchemy |
| 데이터베이스 | AWS Aurora RDS (PostgreSQL 호환) |
| LLM | OpenAI `gpt-5-mini` |
| 임베딩 | OpenAI `text-embedding-3-small` (1536차원) |
| 벡터 DB | FAISS (로컬 인덱스, S3 동기화) |
| LangChain | `langchain-openai`, `langchain-community`, `langchain-text-splitters` |
| PDF 처리 | `opendataloader-pdf` |
| 오브젝트 스토리지 | AWS S3 (`boto3`) |
| 암호화 | `cryptography` (Fernet 대칭 암호화) |
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
| OAuth | React OAuth Google |

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
| `documents` | 업로드 문서 메타 | `original_filename`, `error_message` |
| `chunks` | 문서 청크 | `content` |
| `faqs` | FAQ 항목 | `category`, `question`, `answer`, `keywords_json`, `aliases_json`, `search_hints_json` |
| `prompt_configs` | 시스템 프롬프트 관리 | — |
| `admin_audit_logs` | 관리자 작업 감시 로그 | — |
| `cancel_requests` | 취소/환불 요청 기록 | — |
| `processing_logs` | 문서 처리 상태 로그 | — |

### 암호화 방식

```python
# Fernet 대칭 암호화 (utils/crypto.py)
# 저장 형식: "enc::<base64_token>"
encrypt("민감한 텍스트")          # → "enc::gAAAAAB..."
decrypt_if_needed("enc::gAAAAAB...") # → "민감한 텍스트"
```

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

### 관리자 API (`X-Admin-Password` 헤더 필요)

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
| `GET` | `/api/admin/chat-logs` | 상담 로그 |
| `GET` | `/api/admin/chat-logs/export` | 상담 로그 Excel 내보내기 |

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
| `ADMIN_PASSWORD` | 관리자 API 인증 비밀번호 |
| `DATABASE_URL` | Aurora RDS 연결 문자열 |
| `AWS_ACCESS_KEY_ID` | AWS 자격증명 |
| `AWS_SECRET_ACCESS_KEY` | AWS 자격증명 |
| `AWS_S3_BUCKET` | S3 버킷명 |
| `CHANNEL_TALK_URL` | 채널톡 상담원 연결 URL |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |

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

### 관리자 인증

```
모든 /api/admin/* 요청에 헤더 필요:
X-Admin-Password: <ADMIN_PASSWORD>

프론트엔드 Axios interceptor가 sessionStorage의 비밀번호를 자동 추가
```

### 관리자 감시 로그 (admin_audit_logs)

모든 관리자 작업(문서 업로드/승인/삭제, FAQ 수정, 프롬프트 변경)이 `admin_audit_logs` 테이블에 기록됨

---

## 10. 프론트엔드 구조

### 페이지 구성

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/` | `ChatPage.tsx` | 메인 채팅 인터페이스 |
| `/admin` | `AdminPage.tsx` | 관리자 대시보드 |
| `/admin/sessions/:id` | `AdminSessionPage.tsx` | 세션 상세 |

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
"adminPassword"         // 관리자 비밀번호 (탭 세션 한정)
```

---

## 11. RAG 품질 평가 결과 (RAGAS)

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

## 12. 디렉토리 구조

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
│   │   │   ├── models.py           ← SQLAlchemy ORM 모델 (10개 테이블)
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
