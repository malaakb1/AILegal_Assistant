import React, { useRef } from 'react';
import { Upload, FileText, X, AlertCircle, CheckCircle, Plus, FolderOpen, ArrowLeft } from 'lucide-react';
import { FileData } from '../types/legislation';

interface FileUploadPageProps {
  primaryFile: FileData | null;
  comparisonFiles: FileData[];
  onPrimaryFileChange: (file: FileData | null) => void;
  onComparisonFilesChange: (files: FileData[]) => void;
  onStartProcessing: () => void;
}

const FileUploadPage: React.FC<FileUploadPageProps> = ({
  primaryFile,
  comparisonFiles,
  onPrimaryFileChange,
  onComparisonFilesChange,
  onStartProcessing
}) => {
  const primaryFileRef = useRef<HTMLInputElement>(null);
  const comparisonFilesRef = useRef<HTMLInputElement>(null);

  const handlePrimaryFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileData: FileData = {
        id: Date.now().toString(),
        name: file.name,
        file,
        size: file.size,
        type: file.type
      };
      onPrimaryFileChange(fileData);
    }
  };

  const handleComparisonFilesUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const newFiles: FileData[] = files.map(file => ({
      id: Date.now().toString() + Math.random(),
      name: file.name,
      file,
      size: file.size,
      type: file.type
    }));

    const totalFiles = [...comparisonFiles, ...newFiles];
    if (totalFiles.length > 6) {
      alert('يمكنك رفع 6 ملفات كحد أقصى للمقارنة');
      return;
    }

    onComparisonFilesChange(totalFiles);
  };

  const removePrimaryFile = () => {
    onPrimaryFileChange(null);
    if (primaryFileRef.current) {
      primaryFileRef.current.value = '';
    }
  };

  const removeComparisonFile = (fileId: string) => {
    const updatedFiles = comparisonFiles.filter(file => file.id !== fileId);
    onComparisonFilesChange(updatedFiles);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const canStartProcessing = primaryFile && comparisonFiles.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-100 via-beige-50 to-gold-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 pt-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mb-6 shadow-xl">
            <FolderOpen className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold text-darktext mb-3">إعداد المستندات</h1>
          <p className="text-xl text-darktext-light max-w-2xl mx-auto leading-relaxed">
            قم برفع ملف التشريع الأساسي والقوانين المرجعية للحصول على تحليل شامل ومقارنة دقيقة
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-gold-200">
            <div className="bg-gradient-to-r from-gold-500 to-gold-600 p-8">
              <div className="flex items-center text-white">
                <FileText className="w-10 h-10 ml-4" />
                <div>
                  <h2 className="text-3xl font-bold">التشريع الأساسي</h2>
                  <p className="text-gold-100 mt-2 text-lg">الملف الرئيسي للتحليل والمقارنة</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              {!primaryFile ? (
                <div className="text-center">
                  <div className="border-4 border-dashed border-gold-300 rounded-2xl p-12 bg-gradient-to-br from-beige-50 to-gold-50 hover:from-beige-100 hover:to-gold-100 transition-colors cursor-pointer group"
                       onClick={() => primaryFileRef.current?.click()}>
                    <Upload className="w-20 h-20 text-gold-500 mx-auto mb-6 group-hover:text-gold-600 group-hover:scale-110 transition-all" />
                    <h3 className="text-2xl font-bold text-darktext mb-3">ارفع ملف التشريع</h3>
                    <p className="text-lg text-darktext-light mb-8">اسحب الملف هنا أو اضغط للاختيار</p>
                    <div className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-gold-500 to-gold-600 text-white rounded-xl font-bold text-lg hover:from-gold-600 hover:to-gold-700 transition-all shadow-lg">
                      <Plus className="w-6 h-6 ml-3" />
                      اختيار ملف PDF
                    </div>
                  </div>
                  <input
                    ref={primaryFileRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePrimaryFileUpload}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-14 h-14 bg-green-500 rounded-xl flex items-center justify-center ml-4 shadow-md">
                        <FileText className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-darktext text-lg mb-1">{primaryFile.name}</h3>
                        <p className="text-green-700 font-semibold">{formatFileSize(primaryFile.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                      <button
                        onClick={removePrimaryFile}
                        className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors shadow-md"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-gold-200">
            <div className="bg-gradient-to-r from-gold-500 to-gold-600 p-8">
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center">
                  <FileText className="w-10 h-10 ml-4" />
                  <div>
                    <h2 className="text-3xl font-bold">ملفات المقارنة</h2>
                    <p className="text-gold-100 mt-2 text-lg">القوانين المرجعية للمقارنة</p>
                  </div>
                </div>
                <div className="bg-white bg-opacity-30 px-4 py-2 rounded-full">
                  <span className="font-bold text-xl">{comparisonFiles.length}/6</span>
                </div>
              </div>
            </div>

            <div className="p-8">
              <div className="mb-6">
                <input
                  ref={comparisonFilesRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleComparisonFilesUpload}
                  className="hidden"
                />
                <button
                  onClick={() => comparisonFilesRef.current?.click()}
                  disabled={comparisonFiles.length >= 6}
                  className={`w-full border-4 border-dashed rounded-2xl p-10 transition-all ${
                    comparisonFiles.length >= 6
                      ? 'border-gray-300 bg-gray-100 cursor-not-allowed'
                      : 'border-gold-300 bg-gradient-to-br from-beige-50 to-gold-50 hover:from-beige-100 hover:to-gold-100 cursor-pointer'
                  }`}
                >
                  <Upload className={`w-16 h-16 mx-auto mb-4 ${
                    comparisonFiles.length >= 6 ? 'text-gray-400' : 'text-gold-500'
                  }`} />
                  <h3 className={`text-xl font-bold mb-2 ${
                    comparisonFiles.length >= 6 ? 'text-gray-500' : 'text-darktext'
                  }`}>
                    {comparisonFiles.length >= 6 ? 'تم الوصول للحد الأقصى' : 'إضافة ملفات المقارنة'}
                  </h3>
                  <p className={`text-lg ${comparisonFiles.length >= 6 ? 'text-gray-400' : 'text-darktext-light'}`}>
                    {comparisonFiles.length >= 6
                      ? 'يمكنك رفع 6 ملفات كحد أقصى'
                      : 'يمكنك رفع عدة ملفات PDF في نفس الوقت'
                    }
                  </p>
                </button>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto">
                {comparisonFiles.map((file, index) => (
                  <div
                    key={file.id}
                    className="bg-gradient-to-r from-beige-100 to-gold-100 border-2 border-gold-200 rounded-xl p-4 flex items-center justify-between hover:from-beige-200 hover:to-gold-200 transition-all shadow-sm"
                  >
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center ml-4 shadow-md">
                        <span className="text-white font-bold text-lg">{index + 1}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-darktext text-base">{file.name}</h4>
                        <p className="text-gold-700 font-medium text-sm">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeComparisonFile(file.id)}
                      className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors shadow-md"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}

                {comparisonFiles.length === 0 && (
                  <div className="text-center py-12 text-darktext-light">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-gold-300" />
                    <p className="text-lg">لم يتم رفع أي ملفات للمقارنة بعد</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-10 border-2 border-gold-200">
          {!canStartProcessing ? (
            <div className="bg-gradient-to-r from-amber-50 to-amber-100 border-2 border-amber-300 rounded-2xl p-8 mb-8">
              <div className="flex items-center">
                <AlertCircle className="w-10 h-10 text-amber-600 ml-5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-amber-800 text-2xl mb-2">متطلبات البدء</h3>
                  <p className="text-amber-700 text-lg">
                    يجب رفع ملف التشريع الأساسي وملف واحد على الأقل للمقارنة لبدء العملية
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-2xl p-8 mb-8">
              <div className="flex items-center">
                <CheckCircle className="w-10 h-10 text-green-600 ml-5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-green-800 text-2xl mb-2">جاهز للبدء</h3>
                  <p className="text-green-700 text-lg">
                    تم رفع جميع الملفات المطلوبة. يمكنك الآن بدء عملية التحليل والمقارنة
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="text-center p-6 bg-gradient-to-br from-beige-100 to-gold-100 rounded-2xl border-2 border-gold-200 shadow-md">
              <div className="text-4xl font-bold text-gold-600 mb-3">
                {primaryFile ? '1' : '0'}
              </div>
              <p className="text-darktext font-bold text-lg">التشريع الأساسي</p>
            </div>
            <div className="text-center p-6 bg-gradient-to-br from-beige-100 to-gold-100 rounded-2xl border-2 border-gold-200 shadow-md">
              <div className="text-4xl font-bold text-gold-600 mb-3">
                {comparisonFiles.length}
              </div>
              <p className="text-darktext font-bold text-lg">ملفات المقارنة</p>
            </div>
            <div className="text-center p-6 bg-gradient-to-br from-beige-100 to-gold-100 rounded-2xl border-2 border-gold-200 shadow-md">
              <div className="text-4xl font-bold text-gold-600 mb-3">
                {(primaryFile ? 1 : 0) + comparisonFiles.length}
              </div>
              <p className="text-darktext font-bold text-lg">إجمالي الملفات</p>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={onStartProcessing}
              disabled={!canStartProcessing}
              className={`inline-flex items-center px-16 py-6 rounded-2xl text-2xl font-bold shadow-2xl transition-all duration-300 ${
                canStartProcessing
                  ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-white hover:from-gold-600 hover:to-gold-700 hover:shadow-[0_20px_60px_rgba(201,162,39,0.4)] transform hover:scale-105'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span className="ml-4">بدء المعالجة والتحليل</span>
              <ArrowLeft className="w-7 h-7" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUploadPage;
