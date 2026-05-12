"""
PDF → MD 변환 + FAQ JSON 생성 스크립트

실행 방법:
  cd c:\\Workspaces\\document-chatbot_practice
  backend\\venv\\Scripts\\python scripts\\process_pdfs.py

PDF가 교체되면 이 스크립트를 다시 실행하면 됩니다.
"""

import json
import sys
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
import pytesseract
from dotenv import load_dotenv
from openai import OpenAI

# Windows Tesseract 기본 설치 경로
pytesseract.pytesseract.tesseract_cmd = r"C:\Users\Playdata\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "data" / "pdfs"
DOCS_DIR = ROOT / "data" / "docs"
FAQ_DIR = ROOT / "data" / "faq"

# 변환할 PDF → 저장할 MD 파일명
PDF_TO_MD = {
    "과정상세내용_AI 오케스트레이션.pdf": "course_ai_orchestration.md",
    "과정상세내용_MLOps 엔지니어.pdf": "course_mlops.md",
    "과정상세내용_머신러닝 엔지니어.pdf": "course_ml_engineer.md",
    "플레이데이터 캠퍼스 정보.pdf": "campus_info.md",
    "국민내일배움카드_발급자격.pdf": "national_training_card.md",
    "플레이데이터 소개서_편집본_260508.pdf": "playdata_intro.md",
    "홈페이지_소개.pdf": "homepage_intro.md",
    "국민내일배움카드 운영규정(고용노동부고시)(제2026-101호)(20260101).pdf": "national_training_card_regulation.md",
    "현장 실무인재 양성을 위한 직업능력개발훈련 운영규정(고용노동부고시)(제2026-32호)(20260505).pdf": "vocational_training_regulation.md",
}

QUESTION_LIST_PATH = PDF_DIR / "챗봇 예상 질문 리스트.md"


def extract_pdf_text(pdf_path: Path) -> str:
    """PDF에서 텍스트 + 표 추출 (페이지별)"""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            parts = []

            text = page.extract_text()
            if text and text.strip():
                parts.append(text.strip())

            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                rows = []
                for i, row in enumerate(table):
                    cells = [str(c).strip() if c else "" for c in row]
                    rows.append("| " + " | ".join(cells) + " |")
                    if i == 0:
                        rows.append("| " + " | ".join(["---"] * len(row)) + " |")
                parts.append("\n".join(rows))

            if parts:
                pages.append("\n\n".join(parts))

    return "\n\n---\n\n".join(pages)


def ocr_pdf_with_tesseract(pdf_path: Path) -> str:
    """이미지 기반 PDF를 Tesseract OCR로 처리 (한국어+영어)"""
    doc = pdfium.PdfDocument(str(pdf_path))
    pages_text = []
    total = len(doc)

    for i in range(total):
        print(f"    Tesseract OCR: {i + 1}/{total} 페이지...")
        page = doc[i]
        bitmap = page.render(scale=3)
        pil_image = bitmap.to_pil()
        text = pytesseract.image_to_string(pil_image, lang="kor+eng")
        if text.strip():
            pages_text.append(text.strip())

    return "\n\n".join(pages_text)


def structure_as_markdown(raw_text: str, client: OpenAI) -> str:
    """추출된 텍스트를 Markdown으로 구조화"""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "PDF에서 추출한 텍스트를 Markdown 형식으로 정리해주세요. "
                    "원본 내용을 그대로 유지하면서 헤딩(#, ##), 리스트, 표를 적절히 사용해주세요. "
                    "페이지 번호, 머리글, 바닥글처럼 반복되는 불필요한 내용은 제거해주세요."
                ),
            },
            {"role": "user", "content": raw_text},
        ],
        max_tokens=4000,
    )
    return response.choices[0].message.content.strip()


def parse_question_list(md_path: Path) -> list[dict]:
    """예상 질문 리스트 MD 파싱 → [{category, question, keywords}]"""
    questions = []
    with open(md_path, encoding="utf-8") as f:
        for line in f:
            if not line.startswith("|"):
                continue
            if "---" in line or "카테고리" in line:
                continue
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) != 3:
                continue
            category = parts[0].replace("**", "").strip()
            question = parts[1].strip()
            keywords = [k.strip() for k in parts[2].split(",") if k.strip()]
            if question:
                questions.append(
                    {"category": category, "question": question, "keywords": keywords}
                )
    return questions


def generate_faq_answers(
    questions: list[dict], context: str, client: OpenAI
) -> list[dict]:
    """질문 리스트 + 문서 컨텍스트로 FAQ 답변 생성"""
    faqs = []
    total = len(questions)

    for i, q in enumerate(questions, 1):
        print(f"  [{i}/{total}] {q['question'][:40]}...")

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "당신은 플레이데이터 교육 과정 안내 챗봇입니다. "
                        "아래 문서를 바탕으로 질문에 답변하세요. "
                        "문서에 없는 내용은 '담당자에게 문의해 주세요'로 안내하세요. "
                        "답변은 3~5문장, 친절한 존댓말로 작성하세요.\n\n"
                        f"[참고 문서]\n{context[:6000]}"
                    ),
                },
                {"role": "user", "content": q["question"]},
            ],
            max_tokens=400,
        )

        faqs.append(
            {
                "id": f"faq_{i:03d}",
                "category": q["category"],
                "keywords": q["keywords"],
                "question": q["question"],
                "answer": response.choices[0].message.content.strip(),
            }
        )

    return faqs


def build_suggested_questions(faqs: list[dict]) -> list[dict]:
    """카테고리별 대표 질문으로 추천 질문 목록 구성"""
    seen = set()
    suggested = []
    for faq in faqs:
        cat = faq["category"]
        if cat and cat not in seen:
            seen.add(cat)
            suggested.append(
                {
                    "id": f"sq_{len(suggested)+1:03d}",
                    "label": cat,
                    "query": faq["question"],
                }
            )
    return suggested


def main():
    load_dotenv(ROOT / "backend" / ".env")

    client = OpenAI()
    DOCS_DIR.mkdir(exist_ok=True)
    FAQ_DIR.mkdir(exist_ok=True)

    # ── 1단계: PDF → MD ───────────────────────────────────────────
    print("=" * 50)
    print("1단계: PDF → MD 변환")
    print("=" * 50)

    md_contents = []
    for pdf_name, md_name in PDF_TO_MD.items():
        pdf_path = PDF_DIR / pdf_name
        md_path = DOCS_DIR / md_name

        if not pdf_path.exists():
            print(f"  [SKIP] 파일 없음: {pdf_name}")
            continue

        print(f"  변환 중: {pdf_name}")
        raw_text = extract_pdf_text(pdf_path)

        if not raw_text.strip():
            print(f"  텍스트 추출 실패 → Tesseract OCR로 재시도: {pdf_name}")
            raw_text = ocr_pdf_with_tesseract(pdf_path)

        if not raw_text.strip():
            print(f"  [SKIP] OCR도 실패: {pdf_name}")
            continue

        md_content = structure_as_markdown(raw_text, client)
        md_path.write_text(md_content, encoding="utf-8")
        md_contents.append(md_content)
        print(f"  완료 → {md_path.name}")

    if not md_contents:
        print("\n변환된 MD 파일이 없습니다. PDF 파일을 확인해주세요.")
        sys.exit(1)

    # ── 2단계: FAQ JSON 생성 ──────────────────────────────────────
    print("\n" + "=" * 50)
    print("2단계: FAQ JSON 생성")
    print("=" * 50)

    if not QUESTION_LIST_PATH.exists():
        print(f"  [ERROR] 질문 리스트 없음: {QUESTION_LIST_PATH}")
        sys.exit(1)

    questions = parse_question_list(QUESTION_LIST_PATH)
    print(f"  질문 {len(questions)}개 파싱 완료\n")

    full_context = "\n\n".join(md_contents)
    faqs = generate_faq_answers(questions, full_context, client)
    suggested = build_suggested_questions(faqs)

    output = {"faqs": faqs, "suggested_questions": suggested}
    faq_path = FAQ_DIR / "faq.json"
    faq_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'=' * 50}")
    print(f"완료!")
    print(f"  MD 파일: {len(md_contents)}개 → {DOCS_DIR}")
    print(f"  FAQ: {len(faqs)}개, 추천 질문: {len(suggested)}개 → {faq_path}")


if __name__ == "__main__":
    main()
