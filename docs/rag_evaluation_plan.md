# RAG 정확도 평가 기획

## 목표

챗봇 파이프라인의 답변 품질을 수치로 측정하고 개선 포인트를 찾는다.
평가는 FAQ 레이어와 RAG 레이어를 **독립적으로** 진행한다.

---

## 파이프라인 구조

```
사용자 질문
    │
    ▼
[① FAQ 레이어]  키워드 가중치 매칭
    ├─ 매칭 → FAQ 답변 즉시 반환
    └─ 미매칭 ↓

[② RAG 레이어]  벡터 검색 → LLM 생성
```

---

## 평가 방법

### ① FAQ 레이어 — 수동 테스트셋

질문과 예상 매칭 결과를 직접 작성해 `search_faq()` 를 호출하고 결과를 비교한다.

**측정 지표:**
- **Hit Rate**: 매칭됐어야 할 질문이 실제로 잡힌 비율
- **Wrong Hit Rate**: 잘못된 FAQ가 매칭된 비율 (오매칭)
- **Miss Rate**: 매칭됐어야 하는데 RAG로 넘어간 비율

**테스트 케이스 구성 방향:**
- 동일 의미를 다르게 표현한 질문 (paraphrase)
- 키워드가 애매하게 겹치는 경계 케이스
- FAQ와 전혀 관련 없는 질문 (음성 케이스)
- 카테고리별로 균등하게 구성

### ② RAG 레이어 — RAGAS

```bash
pip install ragas
```

**측정 지표 (4개):**

| 지표 | 측정하는 것 |
|---|---|
| **Faithfulness** | 답변이 검색된 문서에 근거하는지 (hallucination 탐지) |
| **Answer Relevancy** | 답변이 질문에 실제로 답하는지 |
| **Context Precision** | 검색된 청크 중 진짜 관련 있는 비율 |
| **Context Recall** | 필요한 정보가 검색에서 누락되지 않았는지 |

**테스트셋 구성 방향:**
- FAQ로 처리되지 않고 문서 검색이 필요한 질문들로 구성
- 보유한 문서 종류별로 균등하게 커버
- 각 질문마다 `ground_truth` (정답 요약) 작성 필요

---

## 진행 순서

```
1. 환경 세팅 (ragas 설치, 백엔드 실행)
2. FAQ 테스트셋 작성 → eval_faq.py 실행
3. RAG 테스트셋 작성 (질문 + ground_truth)
4. eval_rag.py 실행 → RAGAS 4개 지표 확인
5. 결과 분석 → 임계값·top_k·청크 방식 조정
```

---

## 예상 개선 포인트

| 항목 | 잠재적 문제 |
|---|---|
| FAQ 매칭 임계값 | 너무 낮으면 오매칭, 너무 높으면 miss 증가 |
| RAG top_k 값 | 복합 질문에서 관련 청크 누락 가능 |
| 청크 분할 방식 | 섹션이 너무 길면 노이즈 포함 |
| 임베딩 모델 | 한국어 특화 모델 아님, 성능 한계 가능성 |

---

## 결과물 형식 (목표)

```
=== FAQ 레이어 ===
Hit Rate:        xx%
Wrong Hit Rate:  xx%
Miss Rate:       xx%

=== RAG 레이어 (RAGAS) ===
Faithfulness:      0.xx
Answer Relevancy:  0.xx
Context Precision: 0.xx
Context Recall:    0.xx
```
