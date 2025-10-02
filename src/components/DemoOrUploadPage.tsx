import React from 'react';
import { FileUp, Rocket } from 'lucide-react'; // تم تغيير الأيقونة هنا

interface DemoOrUploadPageProps {
  onSelectDemo: () => void;
  onSelectUpload: () => void;
}

const DemoOrUploadPage: React.FC<DemoOrUploadPageProps> = ({ onSelectDemo, onSelectUpload }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-100 p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800">اختر طريقة البدء</h1>
        <p className="text-lg text-gray-600 mt-2">يمكنك تشغيل مقارنة سريعة باستخدام ملفات الديمو الجاهزة، أو رفع ملفاتك الخاصة.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Demo Option */}
        <div 
          onClick={onSelectDemo}
          className="bg-white rounded-2xl shadow-lg p-8 text-center cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 border-4 border-transparent hover:border-blue-500"
        >
          {/* تم تغيير الأيقونة هنا */}
          <Rocket className="w-20 h-20 text-blue-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">تشغيل الديمو</h2>
          <p className="text-gray-600">
            ابدأ عملية المقارنة فورًا باستخدام مجموعة من القوانين المعدة مسبقًا لتجربة سريعة وفعالة.
          </p>
        </div>

        {/* Upload Option */}
        <div 
          onClick={onSelectUpload}
          className="bg-white rounded-2xl shadow-lg p-8 text-center cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 border-4 border-transparent hover:border-green-500"
        >
          <FileUp className="w-20 h-20 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">رفع ملفات خاصة</h2>
          <p className="text-gray-600">
            قم برفع ملف التشريع الأساسي الخاص بك مع ملفات المقارنة لبدء عملية تحليل واستخراج كاملة.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DemoOrUploadPage;