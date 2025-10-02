from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def _load_json(path: Path) -> List[Dict[str, Any]]:
    """حمِّل JSON بأمان وأرجع قائمة دائماً حتى عند الخطأ."""
    if not path.exists():
        logger.warning("الملف %s غير موجود – إهمال.", path)
        return []

    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                logger.error("المحتوى في %s ليس قائمة JSON – إهمال.", path)
                return []
            return data
    except json.JSONDecodeError as exc:
        logger.error("ملف JSON غير صالح %s: %s – إهمال.", path, exc)
        return []


def aggregate_results(primary_json: Path, workspace: Path, output: Path) -> None:
    """
    دمج مواد نص التشريع الأساسى مع نتائج المقارنات الموجودة فى المجلد workspace.
    يكتب ملفاً موحداً إلى `output`.
    """
    # --- تحميل المواد الأصلية ---
    articles: Dict[str, Dict[str, Any]] = {
        str(a["article"]): a for a in _load_json(primary_json)
    }

    # --- دمج أى ملفات *_diff.json ---
    for diff_file in workspace.glob("*_diff.json"):
        for change in _load_json(diff_file):
            art_no = str(change["article"])
            articles.setdefault(art_no, {}).update(change)

    # --- إخراج النتيجة ---
    merged = {
        "articles": sorted(articles.values(), key=lambda a: int(a["article"]))
    }
    output.write_text(
        json.dumps(merged, ensure_ascii=False, indent=4),
        encoding="utf-8",
    )
    logger.info("تم الحفظ ← %s", output)
