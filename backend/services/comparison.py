# services/comparison.py

from __future__ import annotations

import os
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, List, Dict, Union
from dotenv import load_dotenv

from google.generativeai import GenerativeModel
from google.generativeai.types import HarmCategory, HarmBlockThreshold, File
from google.api_core import exceptions

# --- 1. الإعدادات الأولية ---
load_dotenv()
logger = logging.getLogger(__name__)

# --- 2. النص التعريفي (Prompt) للمقارنة ---
# **تعديل رئيسي:** تم جعل التعليمات أكثر توازنًا للسماح بنتائج أكثر مرونة
_PROMPT_WITH_FILES = """
أنت خبير في القانون المقارن. مهمتك هي تحليل ومقارنة النصوص القانونية بدقة.

**المهمة:**
عليك تحليل **"المادة المستهدفة"** من القانون الأساسي (الملف الأول) ومقارنتها بجميع مواد قانون المقارنة (الملف الثاني) للعثور على أي مواد ذات صلة.

**المادة المستهدفة من الملف الأول:**
```json
{article_json}
```

**تعليمات التحليل:**
1.  **التركيز على المعنى:** ابحث عن المواد التي تتناول نفس الموضوع، أو لها نفس الغرض القانوني، أو تحتوي على أحكام مشابهة.
2.  **كن شاملاً:** إذا وجدت عدة مواد مشابهة، قم بإرجاعها جميعًا.
3.  **الدقة:** إذا لم تجد أي مادة مشابهة بشكل واضح، **يجب** أن تكون النتيجة قائمة فارغة `[]`. لا ترجع نتائج غير ذات صلة.

**قواعد صارمة لهيكلة المخرجات (JSON فقط):**
- المخرج **يجب** أن يكون قائمة JSON صالحة (`[]`).
- كل عنصر في القائمة هو كائن (`{{}}`) يمثل تشابهًا واحدًا.
- كل كائن **يجب** أن يحتوي على هذه المفاتيح الثلاثة **فقط**:
    - `"المادة_المشابهة_في_الملف_الثاني"`: القيمة الدقيقة لمفتاح `"article_number"` من المادة المشابهة.
    - `"عنوان_المادة_المشابهة"`: القيمة الدقيقة لمفتاح `"article_title"` (أو `null`).
    - `"وجه_التشابه"`: شرح موجز وواضح لنقاط التشابه الرئيسية.
"""

# --- 3. الدوال المساعدة ---
def _extract_json(block: str) -> Union[List[Dict[str, Any]], Dict[str, Any]]:
    """
    يستخرج كتلة JSON من استجابة النموذج، وقد يعيد قائمة أو كائنًا واحدًا.
    """
    match = re.search(r"```(json)?\s*([\s\S]+?)\s*```", block, re.IGNORECASE)
    
    json_string = match.group(2).strip() if match else block.strip()

    try:
        return json.loads(json_string)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse JSON from response block: {json_string}")
        raise ValueError("Could not parse JSON from the model's response.")

def normalize_similarities(data: Union[List[Dict[str, Any]], Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    يضمن أن تكون البيانات دائمًا قائمة من الكائنات.
    """
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return data
    logger.warning(f"Unexpected data type for normalization: {type(data)}. Returning empty list.")
    return []


# --- 4. دالة المقارنة الرئيسية ---
def compare_single_article_with_api(
    article: Dict[str, Any],
    primary_file_upload: File,
    comparison_file_upload: File,
    model: GenerativeModel,
) -> Union[List[Dict[str, Any]], Dict[str, Any]]:
    """
    تقارن مادة واحدة مع ملف كامل، وتعيد قائمة أو كائنًا بالتشابهات.
    """
    max_retries = 3
    for attempt in range(max_retries):
        try:
            article_prompt = _PROMPT_WITH_FILES.format(
                article_json=json.dumps(article, ensure_ascii=False, indent=2)
            )
            
            generation_config = {"temperature": 0, "response_mime_type": "application/json"}
            
            safety_settings = {
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            }
            
            request_options = {"timeout": 300}

            resp = model.generate_content(
                [article_prompt, primary_file_upload, comparison_file_upload],
                generation_config=generation_config,
                safety_settings=safety_settings,
                request_options=request_options
            )
            
            return _extract_json(resp.text)

        except (exceptions.ServiceUnavailable, exceptions.InternalServerError, exceptions.DeadlineExceeded) as e:
            logger.warning(f"API connection error on article '{article.get('article_number')}', attempt {attempt + 1}: {e}. Retrying...")
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
            else:
                logger.error(f"Max retries reached for article '{article.get('article_number')}'.")
                return {"error": "Max retries reached", "details": str(e)}
        
        except Exception as e:
            logger.error(f"An unexpected error occurred while comparing article '{article.get('article_number')}': {e}", exc_info=True)
            return {"error": "Unexpected error during comparison", "details": str(e)}
    
    return []
