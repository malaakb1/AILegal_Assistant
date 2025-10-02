# backend/main.py
#  source venv/Scripts/activate 
# uvicorn main:app --reload  

from __future__ import annotations

import os
import json
import logging
import uuid
import shutil
import time
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import aiofiles
import google.generativeai as genai
from google.api_core import exceptions
from fastapi import BackgroundTasks, FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from api.ai_routes import router as ai_router
from api.file_routes import router as file_router


# خدمات المشروع
from services.extraction import extract_law
from services.comparison import compare_single_article_with_api, normalize_similarities
from services.suggestions import generate_legislative_suggestion
from services.deepsearch import deepsearch_questions as ds_questions, deepsearch_execute as ds_execute

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
# -----------------------
# إعدادات عامة وتسجيلات
# -----------------------
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Smart Legislation Assistant API",
    description="An API for intelligent comparison of legal texts using Generative AI.",
    version="3.1.0"
)

app.include_router(ai_router) # يفعّل مسار /ai/chat
app.include_router(file_router)

# CORS (عدّل origins للإنتاج)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------
# مجلدات + تهيئة النموذج
# -----------------------
BACKEND_ROOT = Path(__file__).parent.resolve()
DATA_DIR = BACKEND_ROOT / "data"
DEMO_DIR = BACKEND_ROOT / "demo_files"
DATA_DIR.mkdir(exist_ok=True)
DEMO_DIR.mkdir(exist_ok=True)

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY environment variable not set. Please create a .env file.")

genai.configure(api_key=API_KEY)
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-pro") # تم تحديثه لنموذج أحدث
model = genai.GenerativeModel(MODEL_NAME)

# -----------------------
# نماذج الطلبات (Pydantic)
# -----------------------
class DemoRequest(BaseModel):
    primary_file: str
    comparison_files: list[str]

class SuggestionRequest(BaseModel):
    job_id: str
    article_index: int  # فهرس الصف (المادة) في النتائج الحية

class DeepSearchStartRequest(BaseModel):
    job_id: str
    article_index: int

class DeepSearchExecRequest(BaseModel):
    job_id: str
    article_index: int
    scope: dict

# -------------------------------------------
# وظيفة الخلفية: استخراج + مقارنة مادة بمادة
# -------------------------------------------
def run_article_by_article_process(primary_file_path: Path, cmp_file_paths: List[Path], job_id: str) -> None:
    """
    سير العمل:
    1) استخراج المواد من جميع الملفات (إن لم تكن مُستخرجة).
    2) رفع ملفات الـ JSON إلى Gemini (File API).
    3) المقارنة مادة بمادة، وتحديث النتائج لحظياً في ملف results_{job_id}.json.
    """
    uploaded_files: Dict[str, Any] = {}
    live_results_path = DATA_DIR / f"results_{job_id}.json"

    try:
        # 1) استخراج
        logger.info(f"Job [{job_id}] - Phase 1: Extracting all documents...")
        primary_json_path = primary_file_path.with_suffix(".json")
        if not primary_json_path.exists():
            extract_law(primary_file_path, model, primary_json_path)
        if not primary_json_path.exists():
            raise FileNotFoundError(f"Primary file extraction failed for {primary_file_path.name}.")

        cmp_json_paths: List[Path] = []
        for p in cmp_file_paths:
            cmp_json = p.with_suffix(".json")
            if not cmp_json.exists():
                extract_law(p, model, cmp_json)
            if cmp_json.exists():
                cmp_json_paths.append(cmp_json)
            else:
                logger.warning(f"Job [{job_id}] - Skipping {p.name} as its extraction failed.")

        # 2) رفع
        logger.info(f"Job [{job_id}] - Phase 2: Uploading all JSON files to Google...")
        up_primary = _upload_with_retries(primary_json_path, uploaded_files)
        for json_path in cmp_json_paths:
            _upload_with_retries(json_path, uploaded_files)
        if up_primary is None:
            raise RuntimeError("Primary file could not be uploaded; stopping job.")

        # 3) تهيئة هيكل النتائج
        logger.info(f"Job [{job_id}] - Phase 3: Starting article-by-article comparison...")
        base_articles: List[Dict[str, Any]] = json.loads(primary_json_path.read_text("utf-8"))

        def get_clean_name(path: Path) -> str:
            name_part = path.stem.replace(f"{job_id}_", "", 1)
            name_part = name_part.replace("primary_", "", 1)
            name_part = name_part.replace("cmp_", "", 1)
            return name_part

        comparison_articles_data: Dict[str, List[Dict[str, Any]]] = {
            get_clean_name(path): json.loads(path.read_text("utf-8")) for path in cmp_json_paths
        }

        consolidated_report: List[Dict[str, Any]] = [
            {
                "base_article_info": base_art,
                "country_comparisons": [
                    {"country_name": get_clean_name(orig_path), "status": "pending", "similar_articles": []}
                    for orig_path in cmp_file_paths
                ],
            }
            for base_art in base_articles
        ]
        live_results_path.write_text(json.dumps(consolidated_report, ensure_ascii=False, indent=4), encoding="utf-8")

        # 4) مقارنة مادة بمادة
        for idx, base_article in enumerate(base_articles):
            logger.info(f"Job [{job_id}] - Processing Article #{idx + 1} / {len(base_articles)}")
            for cmp_idx, cmp_json_path in enumerate(cmp_json_paths):
                country_name = get_clean_name(cmp_file_paths[cmp_idx])
                logger.info(f"  -> Comparing with '{country_name}'")

                up_cmp = uploaded_files.get(cmp_json_path.name)
                if up_cmp is None:
                    consolidated_report[idx]["country_comparisons"][cmp_idx]["status"] = "failed"
                    live_results_path.write_text(
                        json.dumps(consolidated_report, ensure_ascii=False, indent=4), encoding="utf-8"
                    )
                    continue
                try:
                    raw_sims = compare_single_article_with_api(
                        article=base_article,
                        primary_file_upload=up_primary,
                        comparison_file_upload=up_cmp,
                        model=model,
                    )
                    similarities = normalize_similarities(raw_sims)

                    formatted_similarities = []
                    for sim in similarities:
                        article_id = sim.get("المادة_المشابهة_في_الملف_الثاني")
                        full_text = "النص غير متوفر"
                        if article_id and country_name in comparison_articles_data:
                            found_article = next(
                                (art for art in comparison_articles_data[country_name] if art.get("article_number") == article_id),
                                None,
                            )
                            if found_article:
                                full_text = found_article.get("article_text", "النص غير متوفر")
                        formatted_sim = {
                            "matched_article_identifier": sim.get("المادة_المشابهة_في_الملف_الثاني"),
                            "matched_article_title": sim.get("عنوان_المادة_المشابهة"),
                            "reason_for_similarity": sim.get("وجه_التشابه"),
                            "matched_article_full_text": full_text,
                        }
                        formatted_similarities.append(formatted_sim)

                    consolidated_report[idx]["country_comparisons"][cmp_idx]["status"] = "completed"
                    consolidated_report[idx]["country_comparisons"][cmp_idx]["similar_articles"] = formatted_similarities

                except Exception as e:
                    logger.error(
                        f"Job [{job_id}] - Failed to compare article #{idx + 1} with {country_name}. Error: {e}"
                    )
                    consolidated_report[idx]["country_comparisons"][cmp_idx]["status"] = "failed"
                    consolidated_report[idx]["country_comparisons"][cmp_idx]["error"] = str(e)

                live_results_path.write_text(
                    json.dumps(consolidated_report, ensure_ascii=False, indent=4), encoding="utf-8"
                )
                logger.info(f"Job [{job_id}] - Updated results for Article #{idx + 1} vs {country_name}.")

            logger.info(f"Job [{job_id}] - Finished all comparisons for Article #{idx + 1}.")

        logger.info(f"Job [{job_id}] - All processing tasks have been completed successfully.")

    except Exception as e:
        logger.error(f"Job [{job_id}] - A critical error occurred: {e}", exc_info=True)
        error_report = {
            "status": "failed",
            "error_message": "A critical error occurred in the backend process.",
            "error_details": str(e),
        }
        live_results_path.write_text(json.dumps(error_report, ensure_ascii=False, indent=4), encoding="utf-8")

    finally:
        logger.info(f"Job [{job_id}] - Phase 4: Cleaning up uploaded files...")
        for file_name, uploaded_file in uploaded_files.items():
            try:
                genai.delete_file(uploaded_file.name)
                logger.info(f"Job [{job_id}] - Cleaned up: {file_name}")
            except Exception as e:
                logger.warning(f"Job [{job_id}] - Could not clean up file {file_name} ({uploaded_file.name}): {e}")

def _upload_with_retries(path: Path, uploaded_files_dict: Dict, retries=3):
    for i in range(retries):
        try:
            file = genai.upload_file(path=path, display_name=path.name, mime_type="text/plain")
            uploaded_files_dict[path.name] = file
            logger.info(f"Uploaded {path.name} as {file.name}")
            return file
        except (exceptions.ServiceUnavailable, exceptions.InternalServerError) as e:
            logger.warning(f"Upload failed for {path.name} (attempt {i+1}/{retries}): {e}")
            if i < retries - 1:
                time.sleep(5 * (i + 1))
    logger.error(f"Failed to upload {path.name} after {retries} attempts.")
    return None

# --------------------------------
# أدوات مساعدة للواجهات الجديدة
# --------------------------------
def _load_row(job_id: str, article_index: int) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    يحضّر المادة الأساسية + يجمع كل المواد المشابهة المكتملة في نفس الصف.
    """
    live_results_path = DATA_DIR / f"results_{job_id}.json"
    if not live_results_path.exists():
        raise FileNotFoundError("LIVE_RESULTS_NOT_READY")
    data = json.loads(live_results_path.read_text("utf-8"))
    if not isinstance(data, list) or article_index < 0 or article_index >= len(data):
        raise IndexError("ARTICLE_INDEX_OUT_OF_RANGE")

    row = data[article_index]
    base = row["base_article_info"]
    logger.info(f"Loaded base article: title={base.get('article_title')!r}")

    sim_list: List[Dict[str, Any]] = []
    for comp in row.get("country_comparisons", []):
        if comp.get("status") == "completed":
            sim_list.extend(comp.get("similar_articles", []))
    return base, sim_list

# -------------------
# نقاط النهاية (API)
# -------------------
@app.post("/process-demo", summary="Start a new demo comparison job")
async def process_demo(request: DemoRequest, background_tasks: BackgroundTasks):
    job_id = uuid.uuid4().hex
    logger.info(f"Received new DEMO job with ID: {job_id}. Requested files: {request.dict()}")

    demo_primary_path = DEMO_DIR / request.primary_file
    if not demo_primary_path.exists():
        return JSONResponse(status_code=404, content={"error": f"Demo file not found: {request.primary_file}"})

    job_primary_path = DATA_DIR / f"{job_id}_primary_{request.primary_file}"
    shutil.copy(demo_primary_path, job_primary_path)

    job_cmp_paths: List[Path] = []
    for cmp_file in request.comparison_files:
        demo_cmp_path = DEMO_DIR / cmp_file
        if not demo_cmp_path.exists():
            logger.warning(f"Comparison demo file NOT FOUND: {demo_cmp_path.resolve()}. Skipping.")
            continue
        job_cmp_path = DATA_DIR / f"{job_id}_cmp_{cmp_file}"
        shutil.copy(demo_cmp_path, job_cmp_path)
        job_cmp_paths.append(job_cmp_path)

    if not job_cmp_paths:
        return JSONResponse(status_code=404, content={"error": "No valid comparison demo files were found."})

    background_tasks.add_task(run_article_by_article_process, job_primary_path, job_cmp_paths, job_id)
    return JSONResponse(status_code=202, content={"id": job_id, "status": "processing"})

@app.post("/process", summary="Start a new comparison job from upload")
async def process_files(
    background_tasks: BackgroundTasks,
    primary: UploadFile = File(...),
    comparisons: List[UploadFile] = File(...),
):
    job_id = uuid.uuid4().hex
    logger.info(f"Received new UPLOAD job with ID: {job_id}")

    primary_path = DATA_DIR / f"{job_id}_primary_{primary.filename}"
    async with aiofiles.open(primary_path, "wb") as f:
        await f.write(await primary.read())

    cmp_paths: List[Path] = []
    for uf in comparisons:
        p = DATA_DIR / f"{job_id}_cmp_{uf.filename}"
        async with aiofiles.open(p, "wb") as f:
            await f.write(await uf.read())
        cmp_paths.append(p)

    background_tasks.add_task(run_article_by_article_process, primary_path, cmp_paths, job_id)
    return JSONResponse(status_code=202, content={"id": job_id, "status": "processing"})

@app.get("/results/{job_id}", summary="Fetch live comparison results")
async def get_live_results(job_id: str):
    live_results_path = DATA_DIR / f"results_{job_id}.json"
    if live_results_path.exists():
        results = json.loads(live_results_path.read_text("utf-8"))
        if isinstance(results, dict) and results.get("status") == "failed":
            return JSONResponse(status_code=500, content=results)
        return JSONResponse(status_code=200, content=results)

    try:
        primary_file_path = next(DATA_DIR.glob(f"{job_id}_primary_*"))
    except StopIteration:
        return JSONResponse(status_code=404, content={"status": "error", "message": "Job ID not found."})

    primary_json_path = primary_file_path.with_suffix(".json")
    if not primary_json_path.exists():
        return JSONResponse(status_code=202, content={"status": "extracting", "message": "Extracting base file. Please wait."})

    base_articles = json.loads(primary_json_path.read_text("utf-8"))
    cmp_files = list(DATA_DIR.glob(f"{job_id}_cmp_*"))

    def get_clean_name(path: Path) -> str:
        name_part = path.stem.replace(f"{job_id}_", "", 1)
        return name_part.replace("primary_", "", 1).replace("cmp_", "", 1)

    initial_structure = [
        {
            "base_article_info": base_art,
            "country_comparisons": [
                {"country_name": get_clean_name(p), "status": "pending", "similar_articles": []}
                for p in cmp_files
            ],
        }
        for base_art in base_articles
    ]

    return JSONResponse(
        status_code=202,
        content={
            "status": "initializing",
            "message": "Base file extracted. Preparing for comparison.",
            "data": initial_structure,
        },
    )

# -------------------------------
# الاقتراح التشريعي (مع الدستور)
# -------------------------------
@app.post("/suggest-amendment", summary="Generate AI-backed legislative suggestion for a row")
async def suggest_amendment(req: SuggestionRequest):
    try:
        base, row_similars = _load_row(req.job_id, req.article_index)
        result = generate_legislative_suggestion(model, base, row_similars)
        return JSONResponse(status_code=200, content=result)
    except FileNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Job ID {req.job_id} not found or results are not ready."})
    except Exception as e:
        logger.exception("suggest-amendment failed")
        return JSONResponse(status_code=500, content={"error": str(e)})

# -------------------------------
# البحث المعمّق (الأسئلة + التنفيذ)
# -------------------------------
@app.post("/deep-search/start", summary="Start Deep Search Q&A for an article")
async def deep_search_start(req: DeepSearchStartRequest):
    """
    **تعديل رئيسي:** تحديث قسم الـ fallback ليتوافق مع هيكل الأسئلة الجديد والإلزامي.
    """
    try:
        base, _ = _load_row(req.job_id, req.article_index)
        qs = ds_questions(model, base)
        return JSONResponse(status_code=200, content=qs)
    except Exception as e:
        logger.exception("deep-search/start failed, providing fallback questions")
        # Fallback موحّد الشكل ليتوافق مع الواجهة ويضمن وجود الحقول المطلوبة
        fallback_questions = {
            "article_title": "تعذر تحميل عنوان المادة",
            "questions": [
                {
                    "id": "law_subject",
                    "label": "ما هو موضوع القانون الرئيسي؟ (إلزامي)",
                    "type": "input",
                    "placeholder": "مثال: قانون المنافسة، قانون حماية البيانات..."
                },
                {
                    "id": "subject_refine",
                    "label": "ما هو الموضوع الدقيق لهذه المادة؟ (اختياري)",
                    "type": "input",
                    "placeholder": "مثال: تعريفات، نطاق التطبيق، الجزاءات..."
                },
                {
                    "id": "geo",
                    "label": "ما النطاق الجغرافي؟",
                    "type": "input",
                },
                {
                    "id": "timeframe",
                    "label": "ما الإطار الزمني؟",
                    "type": "input",
                },
                {
                    "id": "sources",
                    "label": "ما نوع المصادر المطلوبة؟",
                    "type": "textarea",
                },
            ],
            "prefill": {
                "law_subject": "",
                "geo": "جميع دول العالم",
                "timeframe": "آخر 10 سنوات",
                "sources": "تشريعات، معايير دولية، بحوث",
                "subject_refine": ""
            },
            "note": f"fallback_mode: {str(e)}"
        }
        return JSONResponse(status_code=200, content=fallback_questions)


@app.post("/deep-search/execute", summary="Execute Deep Search after Q&A clarifications")
async def deep_search_execute(req: DeepSearchExecRequest):
    """
    **تعديل رئيسي:** إضافة التحقق من وجود `law_subject` الإلزامي.
    """
    try:
        base, _ = _load_row(req.job_id, req.article_index)
        # ندمج المادة داخل النطاق المُخصّص من الواجهة
        scope = {"base_article": base, **(req.scope or {})}
        
        # التأكد من وجود موضوع القانون قبل التنفيذ
        if not scope.get("law_subject"):
            return JSONResponse(
                status_code=400, 
                content={"error": "Bad Request: 'law_subject' is a mandatory field in the scope."}
            )

        results = ds_execute(model, scope)
        return JSONResponse(status_code=200, content=results)
    except FileNotFoundError:
        return JSONResponse(status_code=404, content={"error": f"Job ID {req.job_id} not found or results are not ready."})
    except Exception as e:
        logger.exception("deep-search/execute failed")
        return JSONResponse(status_code=500, content={"error": str(e)})