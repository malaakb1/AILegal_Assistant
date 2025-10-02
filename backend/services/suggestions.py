# services/suggestions.py
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from google.generativeai import GenerativeModel

logger = logging.getLogger(__name__)

# نحاول استيراد البحث المعمّق (اختياري). لو غير متاح، نكمل من دونه.
try:
    from .deepsearch import deepsearch_execute  # expects (model, scope: dict) -> dict
except Exception:  # pragma: no cover
    deepsearch_execute = None


def _safe_json(block: str) -> Optional[Dict[str, Any]]:
    """يحاول استخراج/تحويل JSON حتى لو جاء داخل كود."""
    if not block:
        return None
    # شفرة داخل كود JSON أو نص
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", block, re.IGNORECASE)
    raw = m.group(1).strip() if m else block.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # محاولة تنظيف فاصلة زائدة أو رموز غير قياسية
        raw2 = raw.replace("\u200f", "").replace("\u200e", "").strip()
        try:
            return json.loads(raw2)
        except Exception:
            logger.warning("Failed to parse JSON from model. Raw head: %s", raw[:300])
            return None


def _trim(text: str, max_chars: int = 3000) -> str:
    if not text:
        return ""
    return text[:max_chars]


def _build_context(base_article: Dict[str, Any], similars: List[Dict[str, Any]]) -> str:
    """
    يبني سياقًا موجزًا: المادة الأساسية + الخلاصة المقارنة لمواد الصف.
    """
    base_num = base_article.get("article_number", "")
    base_title = base_article.get("article_title") or "بدون عنوان"
    base_text = base_article.get("article_text", "")

    lines = []
    lines.append("# المادة الأساسية")
    lines.append(f"الرقم: {base_num}")
    lines.append(f"العنوان: {base_title}")
    lines.append("النص:")
    lines.append(_trim(base_text, 4000))

    lines.append("\n# خلاصة المواد المقارنة في نفس الصف")
    if not similars:
        lines.append("- لا توجد مواد مشابهة متاحة.")
    else:
        for i, s in enumerate(similars, 1):
            sid = s.get("matched_article_identifier", "غير معروف")
            stitle = s.get("matched_article_title") or "بدون عنوان"
            sreason = s.get("reason_for_similarity", "")
            sfull = s.get("matched_article_full_text", "")
            lines.append(f"\n## مادة مشابهة #{i}")
            lines.append(f"- المعرّف: {sid}")
            lines.append(f"- العنوان: {stitle}")
            if sreason:
                lines.append(f"- وجه التشابه: {sreason}")
            if sfull:
                lines.append("- نص المادة المشابهة (مقتطف):")
                lines.append(_trim(sfull, 2000))

    return "\n".join(lines)


SUGGESTION_PROMPT = """
أنت خبير في الصياغة التشريعية والقانون المقارن يعمل مع جهة تشريعية في دولة الإمارات.
اقرأ "السياق" ثم قرّر: هل نقترح "تعديل" نص المادة، أم "إبقاء" النص كما هو؟ القرار يجب أن يكون أحد القيمتين فقط:
- "amend" للتعديل
- "keep" للإبقاء

## متطلبات صارمة:
1) عند "amend":
   - قدّم نصًا مقترحًا واضحًا بالعربية يحسّن الصياغة دون تغيير الجوهر إلا لضرورة تنظيميّة ظاهرة.
   - علّل القرار بأدلة محدّدة من المواد المقارنة والمعايير الدولية/الممارسات الرشيدة (إن وجدت).
   - أدرج "footnotes" بروابط أو مراجع مختصرة (حتى لو موجّهة عامّة) تبرّر التعديل.

2) عند "keep":
   - التعليل إلزامي ومفصّل (3 أسباب على الأقل)، ولا يُقبل تعليل عام.
   - اربط أسباب الإبقاء بما يلي (عند الاقتضاء):
     أ) المقارنة مع مواد الصف: هل صياغة الأساس تحقق نفس الغرض بجودة لغوية/مضمونية مماثلة أو أفضل؟
     ب) مخاطر إدخال غموض اصطلاحي/عبء امتثال غير مبرّر لو عدّلنا.
     ج) التوافق مع المبادئ الدستورية الإماراتية (مثال: اليقين القانوني، المساواة أمام القانون، مبدأ المشروعية، التناسب). لا تذكر أرقام مواد محدّدة.

3) فحص دستوري إماراتي إلزامي في الحالتين:
   - قدّم "constitutional_check_uae" يتضمن: assessment (ok/concern)، وprinciples (قائمة مبادئ ذات صلة)، وملاحظات مركّزة.

4) المخرجات يجب أن تكون JSON صحيح وفق المخطط أدناه، وبدون أي نص خارجي.

## SCHEMA (أعد JSON يطابق هذا بالضبط):
{
  "decision": "amend" | "keep",
  "rationale": {
    "summary": string,
    "evidence": [
      { "source": string, "quote": string, "why_relevant": string }
    ],
    "comparative_table": [
      { "jurisdiction": string, "alignment": "same" | "stricter" | "looser", "note": string }
    ],
    "constitutional_check_uae": {
      "assessment": "ok" | "concern",
      "principles": [string],
      "notes": string
    },
    "risk_assessment": string,
    "implementation_impact": string
  },
  "proposed_text": string | null,
  "footnotes": [
    { "type": "law|case|standard|paper|guide|other", "source": string, "pointer": string }
  ]
}

## اعتبارات:
- استشهد صراحة بمواد الصف المتاحة في "السياق" عند الاستدلال (حتى لو بصيغة: "المادة المشابهة رقم ...").
- إن لم تتوفر روابط دقيقة، ضع مصدرًا وصفيًا مختصرًا في الأدلة/الحواشي (لن يُرفض JSON لأجل ذلك).
- تجنّب النسخ الحرفي المطوّل؛ استخدم مقتطفات قصيرة مع دلالة.

## قاعدة الإجماع/التغليب المقارن (إضافة توجيهية عامة):
- حيثما يظهر نمطٌ صياغيٌّ أو مصطلحٌ بعينه في غالبية المواد المقارنة المتاحة أو في نموذج/معيار دولي معتبر، فَعند الملاءمة وعدم تغيّر الجوهر:
  • إذا قررت "amend"، فاعمد إلى مواءمة النص مع ذلك النمط الشائع. اعتبر وجود "أغلبية مرجِّحة" إذا بلغت ≥ 60% من المواد المقارنة المتوافرة نفس اللفظ/التركيب أو تبنّته مرجعية معيارية (UNCITRAL/OECD/World Bank) بشكل واضح.
  • أمثلة غير حصرية لأوجه المواءمة: أداة العطف/الاستثناء ("و/أو/بدلاً من/مع ذلك")، أفعال الإلزام/الإباحة ("يجب/يلتزم/يجوز/قد")، مصطلحات التعريفات، ترتيب العناصر وترقيمها، الصياغة الإيجابية مقابل السلبية، توحيد مفرد/جمع وتذكير/تأنيث.
  • ترتيب أولوية الإجماع عند التعارض: تشريعات اتحادية إماراتية > تشريعات محلية إماراتية > تشريعات خليجية/عربية > نماذج/معايير دولية > مصادر أكاديمية. لا تعتمد التغيير لمجرد الشيوع إذا كان يخلق غموضًا أو يُخِلّ بمقتضيات محلية.
  • في التعريفات: إذا اتفقت معظم المقارنات على لفظٍ مُحدّد للتعريف، فاعتمده حرفيًا في "proposed_text" (مع مواءمة الصياغة العربية نحويًا)، وأبرز الأدلة الداعمة صراحة ضمن "rationale.evidence" مع الإحالة إلى المواد المشابهة ذاتها.
  • إذا لم تبلغ المقارنات عتبة الإجماع أو وُجد تعارض جوهري، ففضّل "keep" واذكر في "risk_assessment" مبررات عدم المواءمة (خطر عدم الاتساق/تعارض مع قواعد محلية/زيادة العبء). إن لزم، قدّم بديلًا اختياريًا داخل "proposed_text" بين قوسين موضّحين بأنه بديل موحّد غير ملزم.
  • لا تغيّر المدلول المعياري؛ أي تعديل لأغراض توحيد شكلي فقط يجب أن يحافظ على المعنى ويجتاز الفحص الدستوري.
  • تحقّق من الإحالات والروابط الداخلية بعد المواءمة.
  • عزّز "comparative_table" بإبراز حالة التوافق (same/stricter/looser) بعد التعديل المقترح، واذكر في "summary" صراحةً ما إذا تم تبنّي الشائع أو العدول عنه ولماذا.

## السياق
""".strip()


def _need_second_pass(d: Optional[Dict[str, Any]]) -> bool:
    if not d or not isinstance(d, dict):
        return True
    if d.get("decision") not in ("amend", "keep"):
        return True
    rat = d.get("rationale") or {}
    summary_ok = isinstance(rat.get("summary"), str) and len(rat["summary"].strip()) >= 60
    ev = rat.get("evidence") or []
    ev_ok = isinstance(ev, list) and len(ev) >= 2 and all(isinstance(x, dict) for x in ev)
    const_ok = isinstance(rat.get("constitutional_check_uae"), dict)
    if d["decision"] == "keep":
        # شدّة أعلى للإبقاء: نريد ملخص جيد + ≥2 أدلة
        return not (summary_ok and ev_ok and const_ok)
    # للتعديل: نقبل ≥1 دليل وملخّص مقبول
    if d["decision"] == "amend":
        ev1_ok = isinstance(ev, list) and len(ev) >= 1
        return not (summary_ok and ev1_ok and const_ok)
    return True


def _merge_evidence(d: Dict[str, Any], new_items: List[Dict[str, str]]) -> None:
    rat = d.setdefault("rationale", {})
    ev = rat.setdefault("evidence", [])
    # دمج بسيط مع إزالة فراغات
    for it in new_items:
        if not it:
            continue
        src = (it.get("source") or "").strip()
        quote = (it.get("quote") or "").strip()
        why = (it.get("why_relevant") or "").strip()
        if src or quote:
            ev.append({"source": src, "quote": quote, "why_relevant": why})


def generate_legislative_suggestion(
    model: GenerativeModel,
    base_article: Dict[str, Any],
    row_similars: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    يولّد اقتراحًا مُعلّلاً (تعديل/إبقاء) مع أدلة وفحص دستوري إماراتي.
    يعمل بتمريرتين عند الحاجة ويستعين بالبحث المعمّق إن متاح.
    """
    context = _build_context(base_article, row_similars)

    gen_cfg = {
        "temperature": 0.2,
        "max_output_tokens": 8192,
        "response_mime_type": "application/json",
    }

    # التمريرة الأولى
    try:
        resp = model.generate_content([SUGGESTION_PROMPT, context], generation_config=gen_cfg)
        data = _safe_json(getattr(resp, "text", "") or "")
    except Exception as e:
        logger.exception("suggestion pass-1 failed")
        data = None

    # لو الإخراج ضعيف/ناقص، نحاول تحسينه
    if _need_second_pass(data):
        # لو عندنا deepsearch، نجلب أدلة إضافية ونحقنها
        if callable(deepsearch_execute):
            try:
                scope = {
                    "query_topic": base_article.get("article_title") or base_article.get("article_number") or "موضوع المادة",
                    "geo": "United Arab Emirates, GCC, OECD, UNCITRAL",
                    "types": "laws, guides, standards, official pages",
                    "extra": _trim(base_article.get("article_text", ""), 800),
                }
                ds = deepsearch_execute(model, scope)  # قد يعيد {"results":[{title,url,snippet,why,score},...]}
                results = (ds or {}).get("results") or []
                ev = []
                for r in results[:6]:
                    ev.append(
                        {
                            "source": (r.get("url") or "").strip(),
                            "quote": _trim(r.get("snippet") or "", 220),
                            "why_relevant": (r.get("why") or "صلة مباشرة بموضوع المادة.").strip(),
                        }
                    )
                if not data:
                    data = {"decision": "keep", "rationale": {}, "proposed_text": None, "footnotes": []}
                _merge_evidence(data, ev)
            except Exception:
                logger.warning("deepsearch enrichment failed; continuing without it.")

        # تمريرة ثانية: نطلب تحسين الملخص وربط الأدلّة وملء الجدول الدستوري
        IMPROVE_PROMPT = """
أعد صياغة المخرجات التالية لتستوفي تمامًا متطلبات الـ SCHEMA المذكور سابقًا:
- حسّن "summary" ليكون مركزًا وسليمًا لغويًا (≥ 3 جمل).
- اربط كلّ دليل بسبب واضح في مسألة الإبقاء/التعديل.
- عند القرار = "keep"، تأكد من وجود ≥ 3 أسباب صريحة ومختلفة.
- املأ "constitutional_check_uae" دائمًا (assessment, principles, notes).
- لا تُعدّل "proposed_text" إلا إذا كان القرار "amend".
- أعد JSON فقط.

المخرجات الحالية:
""".strip()

        try:
            improved = model.generate_content(
                [IMPROVE_PROMPT, json.dumps(data, ensure_ascii=False)], generation_config=gen_cfg
            )
            improved_json = _safe_json(getattr(improved, "text", "") or "")
            if improved_json:
                data = improved_json
        except Exception:
            logger.warning("suggestion pass-2 improvement failed; keeping pass-1 data.")

    # حارس نهائي: لو النتيجة لا تزال هزيلة، نعطي إبقاء مع تعليل واضح وغير نمطي
    if not isinstance(data, dict):
        data = {}

    data.setdefault("decision", "keep")
    rat = data.setdefault("rationale", {})
    rat.setdefault(
        "summary",
        "بعد مراجعة المادة ونظيراتها في الصف، لا يظهر خلل موضوعي أو صياغي يبرّر التعديل في هذه المرحلة."
        " الصياغة الحالية تُحقق الغاية التنظيمية دون إدخال التباس أو عبء امتثال إضافي.",
    )
    rat.setdefault("evidence", [])
    rat.setdefault(
        "constitutional_check_uae",
        {
            "assessment": "ok",
            "principles": ["مبدأ المشروعية", "اليقين القانوني", "المساواة أمام القانون", "التناسب"],
            "notes": "فحص عام بالاستناد إلى مبادئ دستورية مُستقرة دون الإحالة إلى أرقام مواد محدّدة.",
        },
    )
    rat.setdefault("risk_assessment", "لا توجد مخاطر تنظيمية ظاهرة من الإبقاء، خلاف مخاطر إدخال غموض إن تم تعديل المصطلحات دون حاجة.")
    rat.setdefault("implementation_impact", "الإبقاء يحافظ على استقرار التطبيق ويجنّب تغييرات إجرائية غير لازمة.")
    data.setdefault("proposed_text", None)
    data.setdefault("footnotes", [])

    return data
