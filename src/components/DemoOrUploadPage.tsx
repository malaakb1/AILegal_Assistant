import React from 'react';
import { FileUp, Rocket } from 'lucide-react';

interface DemoOrUploadPageProps {
  onSelectDemo: () => void;
  onSelectUpload: () => void;
}

const DemoOrUploadPage: React.FC<DemoOrUploadPageProps> = ({ onSelectDemo, onSelectUpload }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-beige-100 via-beige-50 to-gold-50 p-8">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-darktext mb-4">اختر طريقة البدء</h1>
        <p className="text-xl text-darktext-light mt-2">يمكنك تشغيل مقارنة سريعة باستخدام ملفات الديمو الجاهزة، أو رفع ملفاتك الخاصة.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-10 w-full max-w-5xl">
        <div
          onClick={onSelectDemo}
          className="bg-white rounded-3xl shadow-2xl p-10 text-center cursor-pointer transition-all duration-300 hover:shadow-[0_20px_60px_rgba(201,162,39,0.3)] hover:scale-105 border-2 border-gold-200 hover:border-gold-500 group"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-lg">
            <Rocket className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-darktext mb-4">تشغيل الديمو</h2>
          <p className="text-lg text-darktext-light leading-relaxed">
            ابدأ عملية المقارنة فورًا باستخدام مجموعة من القوانين المعدة مسبقًا لتجربة سريعة وفعالة.
          </p>
          <div className="mt-6 inline-block bg-gradient-to-r from-beige-100 to-gold-100 px-6 py-2 rounded-full text-gold-700 font-semibold border border-gold-300">
            تجربة سريعة
          </div>
        </div>

        <div
          onClick={onSelectUpload}
          className="bg-white rounded-3xl shadow-2xl p-10 text-center cursor-pointer transition-all duration-300 hover:shadow-[0_20px_60px_rgba(201,162,39,0.3)] hover:scale-105 border-2 border-gold-200 hover:border-gold-500 group"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform shadow-lg">
            <FileUp className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-darktext mb-4">رفع ملفات خاصة</h2>
          <p className="text-lg text-darktext-light leading-relaxed">
            قم برفع ملف التشريع الأساسي الخاص بك مع ملفات المقارنة لبدء عملية تحليل واستخراج كاملة.
          </p>
          <div className="mt-6 inline-block bg-gradient-to-r from-beige-100 to-gold-100 px-6 py-2 rounded-full text-gold-700 font-semibold border border-gold-300">
            ملفاتك الخاصة
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoOrUploadPage;
