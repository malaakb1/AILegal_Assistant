import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Loader2, FolderOpen, ArrowRight, Home } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

interface ClassificationResult {
  filename: string;
  category: string;
  storage_path: string;
  confidence: number;
}

interface SmartStoragePageProps {
  onBackToHome: () => void;
}

const SmartStoragePage: React.FC<SmartStoragePageProps> = ({ onBackToHome }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await axios.post<ClassificationResult>(
        `${API_URL}/files/classify-upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'فشلت عملية التصنيف والتخزين. يرجى المحاولة مرة أخرى.');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const resetForm = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-100 via-beige-50 to-gold-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onBackToHome}
            className="flex items-center text-gold-700 hover:text-gold-800 font-medium transition-colors"
          >
            <Home className="w-5 h-5 ml-2" />
            العودة للرئيسية
          </button>
        </div>

        <div className="text-center mb-10">
          <div className="flex items-center justify-center w-24 h-24 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mb-6 mx-auto shadow-xl">
            <FolderOpen className="h-12 w-12 text-white" />
          </div>
          <h1 className="text-5xl font-bold text-darktext mb-4">التخزين الذكي للوثائق</h1>
          <p className="text-xl text-darktext-light max-w-2xl mx-auto">
            ارفع ملفك القانوني وسيتم تصنيفه تلقائيًا وحفظه في المكان المناسب
          </p>
        </div>

        {!result ? (
          <div className="bg-white rounded-3xl shadow-2xl p-10 border border-gold-200">
            {!file ? (
              <div className="text-center">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-gold-300 rounded-2xl p-16 bg-gradient-to-br from-beige-50 to-gold-50 hover:from-beige-100 hover:to-gold-100 transition-all cursor-pointer group"
                >
                  <Upload className="w-20 h-20 text-gold-500 mx-auto mb-6 group-hover:scale-110 transition-transform" />
                  <h3 className="text-2xl font-bold text-darktext mb-3">ارفع المستند القانوني</h3>
                  <p className="text-lg text-darktext-light mb-6">
                    اسحب الملف هنا أو اضغط للاختيار
                  </p>
                  <div className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-gold-500 to-gold-600 text-white rounded-xl font-bold text-lg hover:from-gold-600 hover:to-gold-700 transition-all shadow-lg">
                    <Upload className="w-6 h-6 ml-3" />
                    اختيار ملف PDF
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-beige-100 to-gold-100 border-2 border-gold-300 rounded-2xl p-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-16 h-16 bg-gold-500 rounded-xl flex items-center justify-center ml-5">
                        <FileText className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-darktext text-xl mb-1">{file.name}</h3>
                        <p className="text-gold-700 font-medium text-lg">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <CheckCircle className="w-10 h-10 text-green-600" />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 text-red-700 text-lg">
                    {error}
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex-1 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-bold py-5 px-6 rounded-xl text-xl shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-6 h-6 ml-3 animate-spin" />
                        جاري التصنيف والتخزين...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-6 h-6 ml-3" />
                        بدء التصنيف والتخزين
                      </>
                    )}
                  </button>
                  <button
                    onClick={resetForm}
                    disabled={uploading}
                    className="px-8 py-5 bg-white border-2 border-gold-300 text-gold-700 font-bold rounded-xl text-xl hover:bg-gold-50 transition-all disabled:opacity-60"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-2xl p-10 border-2 border-green-400">
            <div className="text-center mb-8">
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-4xl font-bold text-green-700 mb-3">تم التصنيف والتخزين بنجاح!</h2>
              <p className="text-xl text-darktext-light">تم معالجة المستند وحفظه في المكان المناسب</p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="bg-gradient-to-r from-beige-100 to-gold-100 rounded-2xl p-6 border border-gold-200">
                <h3 className="text-lg font-semibold text-darktext mb-2">اسم الملف</h3>
                <p className="text-xl text-darktext-light">{result.filename}</p>
              </div>

              <div className="bg-gradient-to-r from-beige-100 to-gold-100 rounded-2xl p-6 border border-gold-200">
                <h3 className="text-lg font-semibold text-darktext mb-2">التصنيف</h3>
                <p className="text-xl text-gold-700 font-bold">{result.category}</p>
              </div>

              <div className="bg-gradient-to-r from-beige-100 to-gold-100 rounded-2xl p-6 border border-gold-200">
                <h3 className="text-lg font-semibold text-darktext mb-2">مسار التخزين</h3>
                <p className="text-lg text-darktext-light font-mono bg-white p-3 rounded-lg border border-gold-200 break-all">
                  {result.storage_path}
                </p>
              </div>

              <div className="bg-gradient-to-r from-beige-100 to-gold-100 rounded-2xl p-6 border border-gold-200">
                <h3 className="text-lg font-semibold text-darktext mb-2">مستوى الثقة</h3>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-white rounded-full h-4 overflow-hidden border border-gold-200">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-2xl font-bold text-green-600">
                    {(result.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={resetForm}
                className="flex-1 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-bold py-5 px-6 rounded-xl text-xl shadow-lg transition-all"
              >
                رفع ملف آخر
              </button>
              <button
                onClick={onBackToHome}
                className="px-8 py-5 bg-white border-2 border-gold-300 text-gold-700 font-bold rounded-xl text-xl hover:bg-gold-50 transition-all"
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SmartStoragePage;
