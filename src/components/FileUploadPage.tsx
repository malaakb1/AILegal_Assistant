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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-full mb-4 shadow-lg">
            <FolderOpen className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">إعداد المستندات</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            قم برفع ملف التشريع الأساسي والقوانين المرجعية للحصول على تحليل شامل ومقارنة دقيقة
          </p>
        </div>



        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Primary File Section */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6">
              <div className="flex items-center text-white">
                <FileText className="w-8 h-8 ml-3" />
                <div>
                  <h2 className="text-2xl font-bold">التشريع الأساسي</h2>
                  <p className="text-blue-100 mt-1">الملف الرئيسي للتحليل والمقارنة</p>
                </div>
              </div>
            </div>

            <div className="p-8">
              {!primaryFile ? (
                <div className="text-center">
                  <div className="border-3 border-dashed border-blue-200 rounded-xl p-12 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer group"
                       onClick={() => primaryFileRef.current?.click()}>
                    <Upload className="w-16 h-16 text-blue-400 mx-auto mb-4 group-hover:text-blue-600 transition-colors" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">ارفع ملف التشريع</h3>
                    <p className="text-gray-600 mb-6">اسحب الملف هنا أو اضغط للاختيار</p>
                    <div className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                      <Plus className="w-5 h-5 ml-2" />
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
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center ml-4">
                        <FileText className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{primaryFile.name}</h3>
                        <p className="text-green-600 font-medium">{formatFileSize(primaryFile.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                      <button
                        onClick={removePrimaryFile}
                        className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Comparison Files Section */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-green-600 to-green-700 p-6">
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center">
                  <FileText className="w-8 h-8 ml-3" />
                  <div>
                    <h2 className="text-2xl font-bold">ملفات المقارنة</h2>
                    <p className="text-green-100 mt-1">القوانين المرجعية للمقارنة</p>
                  </div>
                </div>
                <div className="bg-white bg-opacity-20 px-3 py-1 rounded-full">
                  <span className="font-bold">{comparisonFiles.length}/6</span>
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
                  className={`w-full border-3 border-dashed rounded-xl p-8 transition-all ${
                    comparisonFiles.length >= 6
                      ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                      : 'border-green-200 bg-green-50 hover:bg-green-100 cursor-pointer'
                  }`}
                >
                  <Upload className={`w-12 h-12 mx-auto mb-3 ${
                    comparisonFiles.length >= 6 ? 'text-gray-400' : 'text-green-500'
                  }`} />
                  <h3 className={`text-lg font-semibold mb-2 ${
                    comparisonFiles.length >= 6 ? 'text-gray-500' : 'text-gray-900'
                  }`}>
                    {comparisonFiles.length >= 6 ? 'تم الوصول للحد الأقصى' : 'إضافة ملفات المقارنة'}
                  </h3>
                  <p className={`${comparisonFiles.length >= 6 ? 'text-gray-400' : 'text-gray-600'}`}>
                    {comparisonFiles.length >= 6 
                      ? 'يمكنك رفع 6 ملفات كحد أقصى'
                      : 'يمكنك رفع عدة ملفات PDF في نفس الوقت'
                    }
                  </p>
                </button>
              </div>

              {/* Files List */}
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {comparisonFiles.map((file, index) => (
                  <div
                    key={file.id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center ml-3">
                        <span className="text-blue-600 font-bold text-sm">{index + 1}</span>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm">{file.name}</h4>
                        <p className="text-gray-500 text-xs">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeComparisonFile(file.id)}
                      className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                {comparisonFiles.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>لم يتم رفع أي ملفات للمقارنة بعد</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status and Action Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!canStartProcessing ? (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6 mb-6">
              <div className="flex items-center">
                <AlertCircle className="w-8 h-8 text-amber-600 ml-4" />
                <div>
                  <h3 className="font-semibold text-amber-800 text-lg">متطلبات البدء</h3>
                  <p className="text-amber-700 mt-1">
                    يجب رفع ملف التشريع الأساسي وملف واحد على الأقل للمقارنة لبدء العملية
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-6">
              <div className="flex items-center">
                <CheckCircle className="w-8 h-8 text-green-600 ml-4" />
                <div>
                  <h3 className="font-semibold text-green-800 text-lg">جاهز للبدء</h3>
                  <p className="text-green-700 mt-1">
                    تم رفع جميع الملفات المطلوبة. يمكنك الآن بدء عملية التحليل والمقارنة
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {primaryFile ? '1' : '0'}
              </div>
              <p className="text-blue-800 font-medium">التشريع الأساسي</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {comparisonFiles.length}
              </div>
              <p className="text-green-800 font-medium">ملفات المقارنة</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-xl">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {(primaryFile ? 1 : 0) + comparisonFiles.length}
              </div>
              <p className="text-purple-800 font-medium">إجمالي الملفات</p>
            </div>
          </div>

          {/* Action Button */}
          <div className="text-center">
            <button
              onClick={onStartProcessing}
              disabled={!canStartProcessing}
              className={`inline-flex items-center px-12 py-4 rounded-xl text-xl font-bold shadow-lg transition-all duration-300 ${
                canStartProcessing
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl transform hover:scale-105'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span className="ml-3">بدء المعالجة والتحليل</span>
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUploadPage;