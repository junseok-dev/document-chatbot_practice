"""
RAG 파이프라인 RAGAS 평가 스크립트.

사용법:
    cd c:/Workspaces/document-chatbot_practice
    python scripts/evaluate_rag.py

결과:
    data/eval_results/eval_YYYYMMDD_HHMMSS.json  - 질문별 상세 결과
    data/eval_results/ragas_YYYYMMDD_HHMMSS.csv  - RAGAS 메트릭 CSV
"""

import asyncio
import io
import json
import sys
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv
load_dotenv(ROOT / "backend" / ".env")

from app.config import get_settings
from app.services.rag_service import get_rag_service
from app.services.faq_service import search_faq
from app.services.openai_service import get_ai_response

from openai import OpenAI as OpenAIClient
from ragas import EvaluationDataset, evaluate
from ragas.dataset_schema import SingleTurnSample
from ragas.embeddings import OpenAIEmbeddings as RagasOpenAIEmbeddings
from ragas.llms import llm_factory
from ragas.metrics.collections import Faithfulness, AnswerRelevancy, ContextPrecision, ContextRecall


def _split_contexts(context_str: str) -> list[str]:
    if not context_str:
        return []
    return [c.strip() for c in context_str.split("\n\n---\n\n") if c.strip()]


def _check_hallucination(answer: str) -> bool:
    no_info_signals = [
        "죄송", "담당", "문의", "확인이 필요", "정확한 정보",
        "안내해 드리기 어렵", "별도 문의", "채널톡", "playdata@",
    ]
    return any(signal in answer for signal in no_info_signals)


async def _collect_data(testset: list, rag) -> tuple[list, list, list]:
    ragas_samples = []
    detail_results = []
    hallucination_results = []

    for i, item in enumerate(testset, 1):
        q = item["question"]
        ground_truth = item["ground_truth"]
        q_type = item["type"]

        print(f"[{i:02d}/{len(testset)}] {item['id']} - {q[:40]}...")

        faq_answer = search_faq(q)
        if faq_answer:
            answer, contexts, source = faq_answer, [], "faq"
        else:
            context_str = rag.search(q, top_k=4)
            contexts = _split_contexts(context_str)
            answer = await get_ai_response(q, context_str)
            source = "document" if context_str else "ai"

        detail_results.append({
            "id": item["id"],
            "question": q,
            "answer": answer,
            "contexts": contexts,
            "ground_truth": ground_truth,
            "source": source,
            "type": q_type,
            "category": item["category"],
            "difficulty": item["difficulty"],
        })

        if q_type == "no_answer":
            hallucination_results.append({
                "id": item["id"],
                "question": q,
                "answer": answer,
                "correctly_refused": _check_hallucination(answer),
            })
            continue

        ragas_samples.append(
            SingleTurnSample(
                user_input=q,
                response=answer,
                retrieved_contexts=contexts if contexts else ["(검색 결과 없음)"],
                reference=ground_truth or "",
            )
        )
        # ragas_samples 내 인덱스를 detail_results에 기록 (나중에 점수 매핑용)
        detail_results[-1]["_ragas_idx"] = len(ragas_samples) - 1

    return ragas_samples, detail_results, hallucination_results


def _print_dots(testset: list, detail_results: list, hallucination_results: list, ragas_df) -> None:
    import os
    os.system("")  # Windows ANSI 활성화

    GREEN = "\033[92m"
    RED   = "\033[91m"
    RESET = "\033[0m"

    hall_map = {r["id"]: r["correctly_refused"] for r in hallucination_results}
    detail_map = {r["id"]: r for r in detail_results}

    dots = []
    for item in testset:
        d = detail_map[item["id"]]
        if item["type"] == "no_answer":
            passed = hall_map.get(item["id"], False)
        else:
            idx = d.get("_ragas_idx")
            if idx is not None and idx < len(ragas_df):
                faith = ragas_df.iloc[idx].get("faithfulness")
                passed = bool(faith >= 0.5) if faith is not None and faith == faith else False
            else:
                passed = False
        dots.append((item["id"], passed))

    cols = 13
    total = len(dots)
    passed_count = sum(1 for _, p in dots if p)

    print("\n" + "=" * 44)
    print("  결과 도트  (초록=통과  빨강=실패)")
    print("=" * 44)
    for i, (qid, passed) in enumerate(dots):
        dot = f"{GREEN}●{RESET}" if passed else f"{RED}●{RESET}"
        print(f" {dot}", end="")
        if (i + 1) % cols == 0 or i == total - 1:
            start_id = dots[i - (i % cols)][0]
            end_id   = dots[i][0]
            print(f"  {start_id}~{end_id}")
    print(f"\n  통과 {passed_count} / 실패 {total - passed_count} / 전체 {total}")
    print("=" * 44)


def _run_ragas(ragas_samples: list, settings) -> object:
    openai_client = OpenAIClient(api_key=settings.openai_api_key)
    eval_llm = llm_factory("gpt-4o-mini", client=openai_client)
    eval_embeddings = RagasOpenAIEmbeddings(
        client=openai_client,
        model="text-embedding-3-small",
    )
    dataset = EvaluationDataset(samples=ragas_samples)
    return evaluate(
        dataset,
        metrics=[
            Faithfulness(llm=eval_llm),
            AnswerRelevancy(llm=eval_llm, embeddings=eval_embeddings),
            ContextPrecision(llm=eval_llm),
            ContextRecall(llm=eval_llm),
        ],
    )


def main():
    settings = get_settings()
    rag = get_rag_service()

    testset = json.loads(
        (ROOT / "data" / "testset.json").read_text(encoding="utf-8")
    )["testset"]

    print(f"총 {len(testset)}개 질문 처리 중...\n")

    ragas_samples, detail_results, hallucination_results = asyncio.run(
        _collect_data(testset, rag)
    )

    print(f"\nRAGAS 평가 실행 중 ({len(ragas_samples)}개)...")
    result = _run_ragas(ragas_samples, settings)

    scores = (
        result.to_pandas()[
            ["faithfulness", "answer_relevancy", "context_precision", "context_recall"]
        ]
        .mean()
        .round(4)
        .to_dict()
    )

    hallucination_pass = sum(1 for r in hallucination_results if r["correctly_refused"])
    hallucination_total = len(hallucination_results)

    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_questions": len(testset),
        "ragas_evaluated": len(ragas_samples),
        "hallucination_tested": hallucination_total,
        "scores": scores,
        "hallucination": {
            "pass": hallucination_pass,
            "fail": hallucination_total - hallucination_pass,
            "pass_rate": round(hallucination_pass / hallucination_total, 4) if hallucination_total else None,
            "detail": hallucination_results,
        },
        "detail": detail_results,
    }

    output_dir = ROOT / "data" / "eval_results"
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    json_path = output_dir / f"eval_{ts}.json"
    csv_path = output_dir / f"ragas_{ts}.csv"

    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    result.to_pandas().to_csv(csv_path, index=False, encoding="utf-8-sig")

    ragas_df = result.to_pandas()
    _print_dots(testset, detail_results, hallucination_results, ragas_df)

    print("\n" + "=" * 40)
    print("  RAGAS 평가 결과")
    print("=" * 40)
    print(f"  Faithfulness      : {scores['faithfulness']:.3f}")
    print(f"  Answer Relevancy  : {scores['answer_relevancy']:.3f}")
    print(f"  Context Precision : {scores['context_precision']:.3f}")
    print(f"  Context Recall    : {scores['context_recall']:.3f}")
    print(f"  Hallucination 방어 : {hallucination_pass}/{hallucination_total}")
    print("=" * 40)
    print(f"\n  JSON : {json_path}")
    print(f"  CSV  : {csv_path}")


if __name__ == "__main__":
    main()
