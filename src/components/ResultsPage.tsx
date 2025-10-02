import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2, Home, RotateCcw, Download, Sparkles, Search, X } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { saveAs } from "file-saver";

const API_URL = "http://127.0.0.1:8000";

/* ===========================
   أنواع البيانات
=========================== */
interface SimilarArticle {
  matched_article_identifier: string;
  matched_article_title?: string;
  reason_for_similarity: string;
  matched_article_full_text: string;
}

interface CountryComparison {
  country_name: string;
  status: "processing" | "completed" | "failed" | "pending";
  similar_articles: SimilarArticle[];
  error?: string;
}

interface ReportEntry {
  base_article_info: {
    article_number: string;
    article_title?: string;
    article_text: string;
  };
  country_comparisons: CountryComparison[];
}

/* ===== نتائج الاقتراح الذكي ===== */
type SuggestionEvidence = {
  source?: string;
  quote?: string;
  why_relevant?: string;
};

type SuggestionRationale = {
  summary?: string;
  evidence?: SuggestionEvidence[];
  comparative_table?: { jurisdiction?: string; alignment?: string; note?: string }[];
  constitutional_check_uae?: {
    assessment?: string;
    principles?: string[];
    notes?: string;
  };
  risk_assessment?: string;
  implementation_impact?: string;
};

type Suggestion = {
  decision?: "keep" | "amend" | string;
  rationale?: SuggestionRationale;
  proposed_text?: string | null;
  footnotes?: { type?: string; source?: string; pointer?: string }[];
  error?: string;
};

/* ===========================
   DeepQAModal — واجهة تفاعلية واضحة
=========================== */

type QAQuestion = { id: string; label: string; type?: string };
type DeepSearchStartResponse = {
  article_title?: string;
  questions?: QAQuestion[];
  prefill?: Record<string, string>;
};

type DeepSearchResultItem = {
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  why?: string;
};

type AppliedScope = {
  law_subject?: string; // أضفناه هنا
  geo?: string;
  timeframe?: string;
  sources?: string[] | string;
  topic_refine?: string;
};

type DeepSearchExecuteResponse = {
  queries: string[];
  results: DeepSearchResultItem[];
  note?: string;
  took_ms?: number;
  applied_scope?: AppliedScope;
};

interface DeepQAModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  articleIndex: number;
  apiBase?: string;
}

const geoPresets = [
  { value: "global", label: "جميع دول العالم" },
  { value: "uae_federal", label: "الإمارات (اتحادي)" },
  { value: "uae_local", label: "الإمارات (محلي: دبي/أبوظبي…)" },
  { value: "international_orgs", label: "منظمات دولية (UNCITRAL/OECD/World Bank…)" },
  { value: "custom", label: "تحديد يدوي (دولة/ولاية/منظمة)" },
];

const timeframePresets = [
  { value: "last_5_years", label: "آخر 5 سنوات" },
  { value: "last_10_years", label: "آخر 10 سنوات" },
  { value: "last_20_years", label: "آخر 20 سنة" },
  { value: "since_specific_year", label: "منذ سنة محددة…" },
  { value: "no_limit", label: "بدون تقييد زمني" },
];

const sourceOptions = [
  { value: "legislation", label: "تشريعات/لوائح" },
  { value: "case_law", label: "سوابق قضائية" },
  { value: "standards", label: "معايير/إرشادات دولية" },
  { value: "research", label: "بحوث أكاديمية" },
  { value: "gov_reports", label: "تقارير حكومية" },
  { value: "official_news", label: "أخبار/نشرات رسمية" },
];

const DeepQAModal: React.FC<DeepQAModalProps> = ({
  open,
  onClose,
  jobId,
  articleIndex,
  apiBase = API_URL,
}) => {
  const [loadingQ, setLoadingQ] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // قيم النموذج
  // -->> تعديل 1: إضافة حالة جديدة لموضوع القانون الرئيسي <<--
  const [lawSubject, setLawSubject] = useState("");
  const [geoPreset, setGeoPreset] = useState("global");
  const [geoCustom, setGeoCustom] = useState("");
  const [timePreset, setTimePreset] = useState("last_10_years");
  const [sinceYear, setSinceYear] = useState<string>("");
  const [selectedSources, setSelectedSources] = useState<string[]>(["legislation", "standards"]);
  const [topicRefine, setTopicRefine] = useState("");
  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execData, setExecData] = useState<DeepSearchExecuteResponse | null>(null);
  const [articleTitle, setArticleTitle] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoadingQ(true);
    setExecError(null);
    setExecData(null);
    setArticleTitle("");
    axios
      .post<DeepSearchStartResponse>(`${apiBase}/deep-search/start`, {
        job_id: jobId,
        article_index: articleIndex,
      })
      .then(({ data }) => {
        setArticleTitle(data?.article_title || "");
        const p = data?.prefill || {};
        
        // -->> تعديل 2: التعامل مع القيمة المبدئية لحقل موضوع القانون <<--
        if (p["law_subject"]) setLawSubject(p["law_subject"]);
        if (p["topic_refine"]) setTopicRefine(p["topic_refine"]);
        
        if (p["geo"]) {
          if (p["geo"] === "جميع دول العالم") setGeoPreset("global");
          else {
            setGeoPreset("custom");
            setGeoCustom(p["geo"]);
          }
        }
        if (p["timeframe"]) {
          const map: Record<string, string> = {
            "آخر 5 سنوات": "last_5_years",
            "آخر 10 سنوات": "last_10_years",
            "آخر 20 سنة": "last_20_years",
            "بدون تقييد زمني": "no_limit",
          };
          setTimePreset(map[p["timeframe"]] || "last_10_years");
        }
      })
      .catch(() => {
        // تجاهل؛ الواجهة التفاعلية تعمل حتى لو فشل التحضير
      })
      .finally(() => setLoadingQ(false));
  }, [open, apiBase, jobId, articleIndex]);

  function toggleSource(v: string) {
    setSelectedSources((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  const scopePreview = useMemo(() => {
    const geo =
      geoPreset === "custom"
        ? (geoCustom || "—").trim()
        : geoPresets.find((g) => g.value === geoPreset)?.label;

    let timeLabel = timeframePresets.find((t) => t.value === timePreset)?.label;
    if (timePreset === "since_specific_year" && sinceYear) timeLabel = `منذ ${sinceYear}`;
    if (timePreset === "no_limit") timeLabel = "بدون تقييد زمني";

    const srcLabels = sourceOptions
      .filter((s) => selectedSources.includes(s.value))
      .map((s) => s.label)
      .join("، ");

    return {
      law_subject: lawSubject || "—",
      geo,
      timeframe: timeLabel,
      sources: srcLabels || "—",
      topic_refine: topicRefine || "—",
    };
  }, [lawSubject, geoPreset, geoCustom, timePreset, sinceYear, selectedSources, topicRefine]);

  async function handleExecute() {
    setExecError(null);
    setExecuting(true);
    setExecData(null);

    // -->> تعديل 3: إضافة تحقق من أن حقل موضوع القانون ليس فارغًا <<--
    if (!lawSubject.trim()) {
      setExecError("حقل 'موضوع القانون الرئيسي' إلزامي ويجب تعبئته.");
      setExecuting(false);
      return;
    }
    
    // تحقّقات بسيطة
    if (geoPreset === "custom" && !geoCustom.trim()) {
      setExecError("الرجاء تحديد جهة/دولة عندما تختار (تحديد يدوي).");
      setExecuting(false);
      return;
    }
    if (timePreset === "since_specific_year" && !/^\d{4}$/.test(sinceYear)) {
      setExecError("أدخل سنة صحيحة مكوّنة من 4 أرقام (مثال: 2016).");
      setExecuting(false);
      return;
    }
    if (selectedSources.length === 0) {
      setExecError("اختر نوعًا واحدًا على الأقل من المصادر.");
      setExecuting(false);
      return;
    }

    const geoString =
      geoPreset === "global"
        ? "جميع دول العالم"
        : geoPreset === "uae_federal"
        ? "الإمارات (اتحادي)"
        : geoPreset === "uae_local"
        ? "الإمارات (محلي)"
        : geoPreset === "international_orgs"
        ? "منظمات دولية"
        : geoCustom.trim();

    const timeframeString =
      timePreset === "since_specific_year"
        ? `منذ ${sinceYear}`
        : timePreset === "last_5_years"
        ? "آخر 5 سنوات"
        : timePreset === "last_10_years"
        ? "آخر 10 سنوات"
        : timePreset === "last_20_years"
        ? "آخر 20 سنة"
        : "بدون تقييد زمني";

    const scope = {
      // -->> تعديل 4: إضافة حقل `law_subject` إلى الكائن المرسل <<--
      law_subject: lawSubject.trim(),
      geo: geoString,
      timeframe: timeframeString,
      sources: selectedSources,
      topic_refine: topicRefine.trim(),
    };

    try {
      const { data } = await axios.post<DeepSearchExecuteResponse>(`${apiBase}/deep-search/execute`, {
        job_id: jobId,
        article_index: articleIndex,
        scope,
      });
      setExecData(data);
    } catch (e: any) {
      setExecError(e?.response?.data?.error || "فشلت عملية البحث. حاول تضييق النطاق أو جرّب لاحقًا.");
    } finally {
      setExecuting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      aria-modal
      role="dialog"
    >
      <div className="w-[min(980px,95vw)] max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">تخصيص البحث المعمّق</h2>
            {articleTitle && (
              <p className="mt-1 text-sm text-gray-600">
                للمادة: <span className="font-medium">{articleTitle}</span>
              </p>
            )}
          </div>
          <button className="rounded-lg px-3 py-1 text-sm hover:bg-gray-100" onClick={onClose} disabled={executing}>
            إغلاق
          </button>
        </div>

        {loadingQ && (
          <div className="mb-4 flex items-center text-sm text-gray-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> يجري التحضير…
          </div>
        )}
        
        {/* -->> تعديل 5: إضافة قسم حقل موضوع القانون الرئيسي في الواجهة <<-- */}
        <div className="mb-5">
            <label className="mb-1 block font-semibold">
            ما هو موضوع القانون الرئيسي؟ (إلزامي)
            </label>
            <p className="mb-2 text-sm text-gray-600">
            هذا هو أهم حقل لتوجيه البحث. مثال: "قانون المنافسة"، "قانون حماية البيانات الشخصية".
            </p>
            <input
            className="w-full rounded-xl border border-gray-300 p-2 text-sm outline-none ring-blue-500/50 focus:border-blue-500 focus:ring-2"
            placeholder="اكتب هنا موضوع القانون العام..."
            value={lawSubject}
            onChange={(e) => setLawSubject(e.target.value)}
            />
        </div>

        {/* النطاق الجغرافي */}
        <div className="mb-5">
          <label className="mb-1 block font-semibold">ما النطاق الجغرافي؟</label>
          <p className="mb-2 text-sm text-gray-600">اختر “جميع دول العالم” أو حدّد دولة/ولاية/منظمة بعينها.</p>
          <div className="flex flex-wrap gap-2">
            {geoPresets.map((g) => (
              <button
                key={g.value}
                onClick={() => setGeoPreset(g.value)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  geoPreset === g.value ? "border-blue-600 bg-blue-50" : "border-gray-300"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          {geoPreset === "custom" && (
            <input
              className="mt-3 w-full rounded-xl border border-gray-300 p-2 text-sm outline-none focus:border-blue-500"
              placeholder="مثال: فرنسا، السعودية، ولاية كاليفورنيا، منظمة OECD…"
              value={geoCustom}
              onChange={(e) => setGeoCustom(e.target.value)}
            />
          )}
        </div>

        {/* الإطار الزمني */}
        <div className="mb-5">
          <label className="mb-1 block font-semibold">ما الإطار الزمني؟</label>
          <p className="mb-2 text-sm text-gray-600">إذا لم يهمّك التقادم الزمني اختر “بدون تقييد زمني”.</p>
          <div className="flex flex-wrap gap-2">
            {timeframePresets.map((t) => (
              <button
                key={t.value}
                onClick={() => setTimePreset(t.value)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  timePreset === t.value ? "border-blue-600 bg-blue-50" : "border-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {timePreset === "since_specific_year" && (
            <input
              className="mt-3 w-48 rounded-xl border border-gray-300 p-2 text-sm outline-none focus:border-blue-500"
              placeholder="مثال: 2016"
              value={sinceYear}
              onChange={(e) => setSinceYear(e.target.value)}
              inputMode="numeric"
              maxLength={4}
            />
          )}
        </div>

        {/* نوع المصادر */}
        <div className="mb-5">
          <label className="mb-1 block font-semibold">نوع المصادر المطلوبة؟</label>
          <p className="mb-2 text-sm text-gray-600">اختر المصادر الأكثر صلة بمجال بحثك.</p>
          <div className="flex flex-wrap gap-2">
            {sourceOptions.map((s) => {
              const active = selectedSources.includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => toggleSource(s.value)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    active ? "border-blue-600 bg-blue-50" : "border-gray-300"
                  }`}
                  aria-pressed={active}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* موضوع أدق */}
        <div className="mb-6">
          <label className="mb-1 block font-semibold">اضبط الموضوع الدقيق للمادة (اختياري)</label>
          <p className="mb-2 text-sm text-gray-600">
            أمثلة: “تعريفات”، “نطاق التطبيق”، أو اتركه فارغًا للبحث العام ضمن المادة.
          </p>
          <input
            className="w-full rounded-xl border border-gray-300 p-2 text-sm outline-none focus:border-blue-500"
            placeholder="اكتب كلمات مفتاحية دقيقة مرتبطة بالمادة"
            value={topicRefine}
            onChange={(e) => setTopicRefine(e.target.value)}
          />
        </div>
        
        {/* معاينة النطاق */}
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
          <div className="mb-1 font-semibold">معاينة نطاق البحث:</div>
          <div className="flex flex-wrap gap-2">
            {/* -->> تعديل 6: إضافة معاينة حقل موضوع القانون <<-- */}
            <Chip label={`موضوع القانون: ${scopePreview.law_subject}`} />
            <Chip label={`النطاق الجغرافي: ${scopePreview.geo}`} />
            <Chip label={`الزمن: ${scopePreview.timeframe}`} />
            <Chip label={`المصادر: ${scopePreview.sources}`} />
            <Chip label={`الموضوع الدقيق: ${scopePreview.topic_refine}`} />
          </div>
        </div>

        {!!execError && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{execError}</div>}
        
        {/* زر البدء */}
        <div className="mb-2 flex items-center justify-end gap-2">
          <button
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={handleExecute}
            disabled={executing}
          >
            {executing ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                جاري البحث…
              </>
            ) : (
              <>
                <Search className="mr-2 inline h-4 w-4" />
                ابدأ البحث
              </>
            )}
          </button>
        </div>

        {/* نتائج التنفيذ */}
        {execData && (
          <div className="mt-5 space-y-4">
            {execData.applied_scope && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                <div className="font-semibold mb-1">نطاق البحث المطبّق:</div>
                <div className="flex flex-wrap gap-2">
                    {execData.applied_scope.law_subject && <Chip label={`موضوع القانون: ${execData.applied_scope.law_subject}`} />}
                    {execData.applied_scope.geo && <Chip label={`النطاق: ${execData.applied_scope.geo}`} />}
                    {execData.applied_scope.timeframe && <Chip label={`الزمن: ${execData.applied_scope.timeframe}`} />}
                    {execData.applied_scope.sources && <Chip label={`المصادر: ${Array.isArray(execData.applied_scope.sources) ? execData.applied_scope.sources.join("، ") : execData.applied_scope.sources}`} />}
                    {execData.applied_scope.topic_refine && <Chip label={`الموضوع الدقيق: ${execData.applied_scope.topic_refine}`} />}
                </div>
              </div>
            )}
            {/* ... باقي عرض النتائج يبقى كما هو ... */}
            {Array.isArray(execData.queries) && execData.queries.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-gray-700">استعلامات مُنشأة:</p>
                <ul className="list-disc pr-5 text-sm text-gray-800 space-y-1">
                  {execData.queries.map((q, i) => (
                    <li key={i} className="break-words">{q}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-3">
              {(execData.results || []).map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noreferrer" className="block rounded-lg border p-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-blue-700">{r.title}</h4>
                    <span className="text-xs text-gray-500">score: {r.score ?? 0}</span>
                  </div>
                  <p className="break-all text-xs text-gray-500">{r.url}</p>
                  {r.snippet && <p className="mt-1 text-sm text-gray-800">{r.snippet}</p>}
                  {r.why && (
                    <div className="mt-2 inline-block rounded bg-purple-50 px-2 py-1 text-xs text-purple-700">
                      لماذا: {r.why}
                    </div>
                  )}
                </a>
              ))}
              {(execData.results || []).length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
                  لا توجد نتائج مطابقة. حاول تضييق النطاق أو تغيير نوع المصادر.
                </div>
              )}
            </div>
            {(execData.note || execData.took_ms) && (
              <p className="mt-2 text-xs text-gray-500">
                {execData.note ? `${execData.note} — ` : ""}المدة: {execData.took_ms}ms
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function Chip({ label }: { label: string }) {
  return <span className="rounded-full bg-white px-3 py-1 text-xs text-gray-700 shadow-sm ring-1 ring-gray-200">{label}</span>;
}

/* ===========================
   الصفحة الرئيسية لعرض النتائج
=========================== */
const ResultsPage: React.FC = () => {
    // ... الكود هنا لم يتغير، يمكنك تركه كما هو ...
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const { primaryFileName, comparisonFileNames } = (location.state as any) || {
        primaryFileName: "الملف الأساسي",
        comparisonFileNames: [],
    };

    const [report, setReport] = useState<ReportEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [editableData, setEditableData] = useState<{ [key: string]: string }>({});
    const [aiPerRow, setAiPerRow] = useState<{
        [rowIndex: number]: { loading: boolean; data?: Suggestion; error?: string };
    }>({});
    const [qaOpen, setQaOpen] = useState(false);
    const [qaArticleIndex, setQaArticleIndex] = useState<number | null>(null);
    const [loadingStates, setLoadingStates] = useState<{ [key: string]: boolean }>({});
    const [isExporting, setIsExporting] = useState(false);
    const tableRef = useRef<HTMLTableElement>(null);

    useEffect(() => {
        const initialLoadingStates: { [key: string]: boolean } = {};
        initialLoadingStates[primaryFileName] = true;
        (comparisonFileNames || []).forEach((name: string) => {
        initialLoadingStates[name] = true;
        });
        setLoadingStates(initialLoadingStates);

        if (!jobId) return;

        const intervalId = setInterval(async () => {
        try {
            const { data, status } = await axios.get(`${API_URL}/results/${jobId}`);
            if (status === 200 && Array.isArray(data) && data.length > 0) {
            setReport(data);
            const allDone = data.every((entry: any) =>
                entry.country_comparisons.every((c: any) => c.status === "completed" || c.status === "failed")
            );
            if (allDone) {
                clearInterval(intervalId);
            }
            const ls: Record<string, boolean> = {};
            ls[primaryFileName] = false;
            (comparisonFileNames || []).forEach((n: string) => (ls[n] = false));
            setLoadingStates(ls);
            }
        } catch (err: any) {
            if (!err.response || err.response.status !== 202) {
            setError("فشلت عملية جلب النتائج. الرجاء المحاولة مرة أخرى.");
            clearInterval(intervalId);
            }
        }
        }, 5000);

        return () => clearInterval(intervalId);
    }, [jobId, primaryFileName, comparisonFileNames]);

    const handleStartNew = () => navigate("/");
    const handleBackToUpload = () => navigate("/");
    const handleEditableChange = (index: number, value: string) => {
        setEditableData((prev) => ({ ...prev, [`editable-${index}`]: value }));
    };
    const adjustTextareaHeight = (element: HTMLTextAreaElement | null) => {
        if (element) {
        element.style.height = "auto";
        element.style.height = `${element.scrollHeight}px`;
        }
    };
    const handleGenerateSuggestion = async (articleIndex: number) => {
        setAiPerRow((prev) => ({ ...prev, [articleIndex]: { loading: true } }));
        try {
        const { data } = await axios.post(`${API_URL}/suggest-amendment`, {
            job_id: jobId,
            article_index: articleIndex,
        });
        setAiPerRow((prev) => ({ ...prev, [articleIndex]: { loading: false, data } }));
        } catch (e: any) {
        setAiPerRow((prev) => ({
            ...prev,
            [articleIndex]: { loading: false, error: "فشل توليد الاقتراح. حاول مرة أخرى." },
        }));
        }
    };
    const exportToJSON = () => {
        if (!report || report.length === 0) return;
        const dataStr = JSON.stringify(report, null, 2);
        const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
        saveAs(blob, "comparison_results.json");
    };
    const exportToWord = async () => {
        if (!tableRef.current || isExporting) return;
        setIsExporting(true);
        try {
        const tableClone = tableRef.current.cloneNode(true) as HTMLTableElement;
        tableClone.querySelectorAll("p, span, div").forEach((el) => {
            if (
            el.textContent &&
            (el.textContent.includes("وجه التشابه") || el.classList.contains("reason-for-similarity"))
            ) {
            (el as HTMLElement).style.backgroundColor = "#ede9fe";
            (el as HTMLElement).style.color = "#6d28d9";
            (el as HTMLElement).style.padding = "2px 6px";
            (el as HTMLElement).style.borderRadius = "6px";
            (el as HTMLElement).style.display = "inline-block";
            }
        });
        const htmlString = `
            <!DOCTYPE html>
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <title>Export HTML to Word Document</title>
                <style>
                @page WordSection1 { size: 29.7cm 21cm; mso-page-orientation: landscape; margin: 2cm 1.5cm 2cm 1.5cm; }
                div.WordSection1 { page: WordSection1; }
                body { font-family: "Arial", sans-serif; direction: rtl; background: #f9fafb; }
                table { border-collapse: collapse; width: 100%; background: #fff; }
                th, td { border: 1px solid #dddddd; text-align: right; padding: 8px; vertical-align: top; }
                th { background-color: #f2f2f2; }
                h1 { text-align: center; margin-bottom: 24px; }
                h4 { margin: 0 0 5px 0; }
                p { margin: 0; white-space: pre-wrap; }
                .reason-for-similarity { background: #ede9fe !important; color: #6d28d9 !important; padding: 2px 6px; border-radius: 6px; display: inline-block; }
                </style>
            </head>
            <body>
                <div class="WordSection1">
                <h1>تقرير المقارنة النهائي</h1>
                <p style="text-align:center;color:#555;margin-bottom:24px;">نتائج مقارنة ${primaryFileName}</p>
                ${tableClone.outerHTML}
                </div>
            </body>
            </html>
        `;
        const blob = new Blob(["\ufeff", htmlString], { type: "application/msword" });
        saveAs(blob, "comparison_report.doc");
        } catch (err) {
        console.error("خطأ أثناء تصدير Word:", err);
        alert("حدث خطأ أثناء تصدير الملف. يرجى المحاولة مرة أخرى.");
        } finally {
        setIsExporting(false);
        }
    };
    const exportToPDF = () => {
        if (!tableRef.current || isExporting) return;
        setIsExporting(true);
        html2canvas(tableRef.current, { scale: 2, useCORS: true })
        .then((canvas) => {
            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
            pdf.save("report.pdf");
            setIsExporting(false);
        })
        .catch((err) => {
            console.error("خطأ أثناء تصدير PDF:", err);
            alert("حدث خطأ أثناء تصدير الملف.");
            setIsExporting(false);
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6" dir="rtl">
        <div className="mx-auto max-w-full px-4 lg:px-8">
            <div className="mb-6 rounded-xl bg-white p-6 shadow-lg">
            <div className="flex flex-col items-center justify-between sm:flex-row">
                <div className="mb-4 text-center sm:mb-0 sm:text-right">
                <h1 className="mb-2 text-3xl font-bold text-gray-900">تقرير المقارنة النهائي</h1>
                <p className="text-gray-600">نتائج مقارنة {primaryFileName}</p>
                </div>
                <div className="flex flex-wrap justify-center space-x-reverse gap-2">
                <button
                    onClick={exportToPDF}
                    disabled={isExporting}
                    className="flex items-center rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:bg-red-400"
                >
                    {isExporting ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <Download className="ml-2 h-5 w-5" />}
                    تصدير PDF
                </button>
                <button
                    onClick={exportToWord}
                    disabled={isExporting}
                    className="flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
                >
                    {isExporting ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <Download className="ml-2 h-5 w-5" />}
                    تصدير WORD
                </button>
                <button
                    onClick={exportToJSON}
                    className="flex items-center rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700"
                >
                    <Download className="ml-2 h-5 w-5" /> تصدير JSON
                </button>
                <button
                    onClick={handleBackToUpload}
                    className="flex items-center rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700"
                >
                    <RotateCcw className="ml-2 h-5 w-5" /> مقارنة جديدة
                </button>
                <button
                    onClick={handleStartNew}
                    className="flex items-center rounded-lg bg-gray-600 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700"
                >
                    <Home className="ml-2 h-5 w-5" /> الرئيسية
                </button>
                </div>
            </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
            <div className="overflow-x-auto">
                <table ref={tableRef} className="w-full text-right text-sm">
                <thead className="bg-gray-100">
                    <tr>
                    <th className="sticky right-0 min-w-[300px] border-l bg-yellow-100 px-3 py-3 font-semibold text-gray-600">
                        <div className="flex items-center justify-center">
                        {loadingStates[primaryFileName] && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                        {primaryFileName}
                        </div>
                    </th>
                    {comparisonFileNames.map((fileName: string) => (
                        <th key={fileName} className="min-w-[300px] border-l px-3 py-3 font-semibold text-gray-600">
                        <div className="flex items-center justify-center">
                            {loadingStates[fileName] && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                            {fileName}
                        </div>
                        </th>
                    ))}
                    <th className="min-w-[300px] border-l bg-green-50 px-3 py-3 font-semibold text-gray-600">
                        تعديلات إدارة التشريعات (قابل للتحرير)
                    </th>
                    <th className="min-w-[360px] bg-purple-50 px-3 py-3 font-semibold text-gray-600">
                        الذكاء الاصطناعي: اقتراح & بحث معمّق
                    </th>
                    </tr>
                </thead>
                <tbody>
                    {report.length === 0 ? (
                    <tr>
                        <td colSpan={comparisonFileNames.length + 3} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                            <p className="mt-4 text-lg font-semibold text-gray-700">جاري استخراج المواد والمقارنة...</p>
                        </div>
                        </td>
                    </tr>
                    ) : (
                    report.map((articleEntry, index) => (
                        <tr key={index} className="border-t border-gray-200">
                        {/* المادة الأساسية */}
                        <td className="sticky right-0 border-l bg-yellow-50 px-3 py-4 align-top shadow-md">
                            <h4 className="mb-2 font-bold text-gray-800">
                            {articleEntry.base_article_info.article_number} -{" "}
                            {articleEntry.base_article_info.article_title || "بدون عنوان"}
                            </h4>
                            <p className="whitespace-pre-wrap text-gray-700">
                            {articleEntry.base_article_info.article_text}
                            </p>
                        </td>

                        {/* الأعمدة المقارنة */}
                        {comparisonFileNames.map((fileName: string) => {
                            const countryName = fileName.replace(".pdf", "");
                            const comp = articleEntry.country_comparisons.find((c: any) =>
                            c.country_name.includes(countryName)
                            );
                            return (
                            <td key={fileName} className="border-l px-3 py-4 align-top">
                                {comp && comp.status === "completed" ? (
                                comp.similar_articles.length > 0 ? (
                                    comp.similar_articles.map((sim: any, i: number) => (
                                    <div key={i} className="mb-3">
                                        <p className="font-semibold text-blue-700">
                                        {sim.matched_article_identifier}
                                        {sim.matched_article_title && ` - ${sim.matched_article_title}`}
                                        </p>
                                        <div
                                        className="reason-for-similarity-box my-1 inline-block rounded-lg border border-violet-300 bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700"
                                        style={{ boxShadow: "0 1px 4px #ede9fe", margin: "4px 0" }}
                                        >
                                        {sim.reason_for_similarity}
                                        </div>
                                        <p className="whitespace-pre-wrap text-gray-700">{sim.matched_article_full_text}</p>
                                    </div>
                                    ))
                                ) : (
                                    <span className="text-gray-400">لا يوجد تشابه</span>
                                )
                                ) : (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                                    <span className="mr-2 text-blue-600">جاري المقارنة...</span>
                                </div>
                                )}
                            </td>
                            );
                        })}

                        {/* ملاحظات المستخدم */}
                        <td className="border-l bg-green-50 px-3 py-4 align-top">
                            <textarea
                            ref={(el) => adjustTextareaHeight(el)}
                            value={editableData[`editable-${index}`] || ""}
                            onChange={(e) => handleEditableChange(index, e.target.value)}
                            placeholder="أدخل تعديلاتك هنا..."
                            className="min-h-[120px] w-full resize-none overflow-hidden rounded-lg border border-green-200 bg-white p-2 text-sm text-green-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                        </td>

                        {/* الذكاء الاصطناعي: اقتراح & بحث معمّق */}
                        <td className="bg-purple-50 px-3 py-4 align-top">
                            {/* أزرار التحكم */}
                            <div className="mb-3 flex flex-col gap-2">
                            <button
                                onClick={() => handleGenerateSuggestion(index)}
                                disabled={aiPerRow[index]?.loading}
                                className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
                            >
                                {aiPerRow[index]?.loading ? (
                                <>
                                    <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />
                                    جاري التوليد...
                                </>
                                ) : (
                                <>
                                    <Sparkles className="ml-2 inline h-4 w-4" />
                                    توليد اقتراح
                                </>
                                )}
                            </button>

                            <button
                                onClick={() => {
                                setQaArticleIndex(index);
                                setQaOpen(true);
                                }}
                                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                                <Search className="ml-2 inline h-4 w-4" />
                                بحث معمّق
                            </button>
                            </div>

                            {/* عرض نتيجة الاقتراح */}
                            {aiPerRow[index]?.error && (
                            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                                {aiPerRow[index]?.error}
                            </div>
                            )}

                            {aiPerRow[index]?.data && (
                            <div className="space-y-2">
                                <div className="text-xs">
                                <span className="font-semibold text-gray-700">القرار: </span>
                                <span
                                    className={
                                    aiPerRow[index]?.data?.decision === "amend" ? "text-red-600" : "text-green-700"
                                    }
                                >
                                    {aiPerRow[index]?.data?.decision === "amend" ? "تعديل" : "إبقاء"}
                                </span>
                                </div>

                                {aiPerRow[index]?.data?.rationale?.summary && (
                                <div className="rounded-lg border border-purple-200 bg-white p-3">
                                    <p className="whitespace-pre-wrap text-sm text-gray-800">
                                    {aiPerRow[index]?.data?.rationale?.summary}
                                    </p>
                                </div>
                                )}

                                {/* أدلة */}
                                {Array.isArray(aiPerRow[index]?.data?.rationale?.evidence) &&
                                aiPerRow[index]?.data?.rationale?.evidence!.length > 0 && (
                                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                                    <p className="mb-1 text-xs font-semibold text-gray-700">الأدلة:</p>
                                    <ul className="list-disc space-y-1 pr-5">
                                        {aiPerRow[index]?.data?.rationale?.evidence!.map((evi, i) => (
                                        <li key={i} className="text-xs text-gray-700">
                                            <span className="font-medium">[{evi.source}]</span> {evi.quote}{" "}
                                            {evi.why_relevant ? (
                                            <span className="text-gray-500">— {evi.why_relevant}</span>
                                            ) : null}
                                        </li>
                                        ))}
                                    </ul>
                                    </div>
                                )}

                                {/* نص مُقترح إن كان القرار تعديل */}
                                {aiPerRow[index]?.data?.decision === "amend" &&
                                aiPerRow[index]?.data?.proposed_text && (
                                    <div className="rounded-lg border border-red-200 bg-white p-3">
                                    <p className="mb-1 text-xs font-semibold text-red-700">النص المُقترح:</p>
                                    <pre className="whitespace-pre-wrap text-sm text-gray-800">
                                        {aiPerRow[index]?.data?.proposed_text}
                                    </pre>
                                    </div>
                                )}

                                {/* فحص دستوري */}
                                {aiPerRow[index]?.data?.rationale?.constitutional_check_uae && (
                                <div className="rounded-lg border border-green-200 bg-white p-3">
                                    <p className="mb-1 text-xs font-semibold text-green-700">الفحص الدستوري (الإمارات):</p>
                                    <p className="text-xs text-gray-700">
                                    التقييم: {aiPerRow[index]?.data?.rationale?.constitutional_check_uae?.assessment}
                                    </p>
                                    {Array.isArray(aiPerRow[index]?.data?.rationale?.constitutional_check_uae?.principles) && (
                                    <p className="text-xs text-gray-700">
                                        المبادئ:{" "}
                                        {aiPerRow[index]?.data?.rationale?.constitutional_check_uae?.principles?.join("، ")}
                                    </p>
                                    )}
                                    {aiPerRow[index]?.data?.rationale?.constitutional_check_uae?.notes && (
                                    <p className="text-xs text-gray-700">
                                        ملاحظات: {aiPerRow[index]?.data?.rationale?.constitutional_check_uae?.notes}
                                    </p>
                                    )}
                                </div>
                                )}
                            </div>
                            )}
                        </td>
                        </tr>
                    ))
                    )}
                </tbody>
                </table>
            </div>
            </div>
        </div>

        {/* مودال البحث المعمّق */}
        {qaOpen && qaArticleIndex !== null && (
            <DeepQAModal open={qaOpen} onClose={() => setQaOpen(false)} jobId={jobId!} articleIndex={qaArticleIndex} apiBase={API_URL} />
        )}
        </div>
    );
};

export default ResultsPage;