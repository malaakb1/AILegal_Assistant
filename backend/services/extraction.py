# services/extraction.py

from __future__ import annotations
import os
import json
import logging
import re
from pathlib import Path
from typing import Any, List, Dict
from dotenv import load_dotenv
from google.generativeai import GenerativeModel, delete_file, configure, upload_file
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY not found in .env file")
configure(api_key=API_KEY)





_EXTRACT_PROMPT = """
    أنت خبير في معالجة المستندات القانونية.
    مهمتك هي تحليل ملف PDF المرفق بدقة.

    اتبع التعليمات التالية بدقة:
    1.  حدد كل "مادة" بشكل فردي.
    2.  لكل مادة، استخرج رقمها، وعنوانها (إن وجد)، والنص الكامل لها.
    3.  قم بتنسيق المخرجات النهائية على شكل مصفوفة JSON (list of objects) فقط.
    4.  كل كائن في المصفوفة يجب أن يمثل مادة واحدة ويحتوي على ثلاثة مفاتيح بالضبط:
        * `"article_number"`: ويحتوي على رقم المادة (مثال: "المادة ١").
        * `"article_title"`: ويحتوي على عنوان المادة. **إذا لم يكن للمادة عنوان، يجب أن تكون قيمة هذا المفتاح `null`**.
        * `"article_text"`: ويحتوي على النص الكامل للمادة (بدون الرقم والعنوان).

    لا تقم بإضافة أي نصوص أو شروحات خارج مصفوفة الـ JSON.
    """


#### 4. الدوال المساعدة (Helper Functions)
def _extract_json(block: str) -> Any:
    """يستخرج كتلة JSON من استجابة النموذج."""
    match = re.search(r"```(json)?\s*([\s\S]+?)\s*```", block, re.IGNORECASE)
    if not match:
        try:
            return json.loads(block)
        except json.JSONDecodeError:
            raise ValueError("Could not find or parse JSON in the model's response.")
    
    return json.loads(match.group(2).strip())

def _find_full_article(articles: List[Dict[str, Any]] | None, identifier: str) -> str:
    """
    يبحث عن النص الكامل لمادة معينة داخل قائمة المواد المستخرجة.
    """
    if not articles:
        return "لم يتم العثور على بيانات المصدر."
    
    for art in articles:
        if str(art.get("article_number")) == str(identifier) or (
            identifier and art.get("article_title") and identifier in str(art.get("article_title"))
        ):
            return art.get("article_text", "النص غير متوفر.")
            
    return f"لم يتم العثور على المادة '{identifier}' في ملف المصدر."


# في services/extraction.py

def extract_law(file_path: Path, model: GenerativeModel, output_json: Path) -> None:
    """
    يحلل ملف PDF ويستخرج المواد ويكتبها إلى ملف JSON.
    """
    logger.info(f"Extracting articles from {file_path.name}...")
    raw_response_text = ""
    try:
        uploaded_file = upload_file(path=file_path)
        
        # 💡 الإصلاح الأول: زيادة الحد الأقصى للإنتاج
        generation_config = {
            "temperature": 0,
            "max_output_tokens": 50000, # زيادة الحد الأقصى للسماح بمستندات كبيرة
        }

        resp = model.generate_content(
            [_EXTRACT_PROMPT, uploaded_file],
            generation_config=generation_config, # استخدام الإعدادات الجديدة
            safety_settings={
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            }
        )
        
        raw_response_text = resp.text
        articles: List[dict[str, Any]] = _extract_json(raw_response_text)
        
        output_json.write_text(
            json.dumps(articles, ensure_ascii=False, indent=4),
            encoding="utf-8",
        )
        logger.info(f"Extraction complete. Saved to → {output_json}")
        
        delete_file(uploaded_file.name)

    except Exception as e:
        logger.error(f"Failed during extraction for {file_path.name}: {e}")
        
        print("\n" + "="*20 + " DEBUG: RAW GEMINI RESPONSE " + "="*20)
        print("The following response could not be parsed as JSON:")
        print(raw_response_text)
        print("="*60 + "\n")
        
        error_info = {"error": str(e), "file": str(file_path), "raw_response": raw_response_text}
        
        # 💡 الإصلاح الثاني: تحديد ترميز utf-8 عند كتابة ملف الخطأ
        output_json.with_suffix(".error.json").write_text(
            json.dumps(error_info, ensure_ascii=False),
            encoding="utf-8" 
        )