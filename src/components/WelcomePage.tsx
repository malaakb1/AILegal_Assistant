import React from 'react';
import { Scale, Upload, BarChart3, FileText, ArrowLeft } from 'lucide-react';

interface WelcomePageProps {
  onStartComparison: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onStartComparison }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-100 via-beige-50 to-gold-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full text-center">
        <div className="mb-12">
          <div className="flex items-center justify-center mb-6">
            <Scale className="h-16 w-16 text-gold-600 ml-4" />
            <h1 className="text-5xl font-bold text-darktext">مساعد التشريع</h1>
          </div>
          <p className="text-xl text-darktext-light max-w-2xl mx-auto leading-relaxed">
            أداة ذكية لتحليل ومقارنة النصوص القانونية بكفاءة ودقة عالية باستخدام الذكاء الاصطناعي
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-white rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 border border-gold-200 hover:border-gold-400">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl flex items-center justify-center">
                <Upload className="h-8 w-8 text-white" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-darktext mb-2">ارفع الملفات</h3>
            <p className="text-darktext-light">
              قم برفع مسودة التشريع والقوانين المرجعية للمقارنة بسهولة
            </p>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 border border-gold-200 hover:border-gold-400">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl flex items-center justify-center">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-darktext mb-2">تحليل ذكي</h3>
            <p className="text-darktext-light">
              دع الذكاء الاصطناعي يحلل ويقارن النصوص القانونية بدقة متناهية
            </p>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 border border-gold-200 hover:border-gold-400">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl flex items-center justify-center">
                <FileText className="h-8 w-8 text-white" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-darktext mb-2">تقرير تفاعلي</h3>
            <p className="text-darktext-light">
              استعرض النتائج في تقرير تفاعلي مع إمكانية التصدير
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-10 shadow-xl mb-12 border border-gold-200">
          <h2 className="text-3xl font-bold text-darktext mb-8">كيف يعمل المساعد؟</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex items-center">
              <div className="bg-gradient-to-br from-gold-400 to-gold-600 rounded-full p-4 ml-4 flex-shrink-0">
                <span className="text-white font-bold text-xl">1</span>
              </div>
              <div className="text-right">
                <h3 className="font-bold text-darktext text-lg">ارفع الملفات</h3>
                <p className="text-darktext-light text-sm">مسودة التشريع والقوانين المرجعية</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-gradient-to-br from-gold-400 to-gold-600 rounded-full p-4 ml-4 flex-shrink-0">
                <span className="text-white font-bold text-xl">2</span>
              </div>
              <div className="text-right">
                <h3 className="font-bold text-darktext text-lg">تحليل تلقائي</h3>
                <p className="text-darktext-light text-sm">مقارنة ذكية بواسطة الذكاء الاصطناعي</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-gradient-to-br from-gold-400 to-gold-600 rounded-full p-4 ml-4 flex-shrink-0">
                <span className="text-white font-bold text-xl">3</span>
              </div>
              <div className="text-right">
                <h3 className="font-bold text-darktext text-lg">النتائج</h3>
                <p className="text-darktext-light text-sm">تقرير شامل قابل للتصدير</p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onStartComparison}
          className="bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-bold py-5 px-10 rounded-2xl text-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center mx-auto group"
        >
          <span className="ml-3">ابدأ عملية المقارنة الآن</span>
          <ArrowLeft className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default WelcomePage;