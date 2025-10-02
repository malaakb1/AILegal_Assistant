import React from 'react';
import { Scale, Upload, BarChart3, FileText, ArrowLeft } from 'lucide-react';

interface WelcomePageProps {
  onStartComparison: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onStartComparison }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full text-center">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-center mb-6">
            <Scale className="h-16 w-16 text-blue-600 ml-4" />
            <h1 className="text-5xl font-bold text-gray-900">مساعد التشريع</h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            أداة ذكية لتحليل ومقارنة النصوص القانونية بكفاءة ودقة عالية باستخدام الذكاء الاصطناعي
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-center mb-4">
              <Upload className="h-12 w-12 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">ارفع الملفات</h3>
            <p className="text-gray-600">
              قم برفع مسودة التشريع والقوانين المرجعية للمقارنة بسهولة
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-center mb-4">
              <BarChart3 className="h-12 w-12 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">تحليل ذكي</h3>
            <p className="text-gray-600">
              دع الذكاء الاصطناعي يحلل ويقارن النصوص القانونية بدقة متناهية
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center justify-center mb-4">
              <FileText className="h-12 w-12 text-purple-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">تقرير تفاعلي</h3>
            <p className="text-gray-600">
              استعرض النتائج في تقرير تفاعلي مع إمكانية التصدير
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-xl p-8 shadow-lg mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">كيف يعمل المساعد؟</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex items-center">
              <div className="bg-blue-100 rounded-full p-3 ml-4">
                <span className="text-blue-600 font-bold text-xl">1</span>
              </div>
              <div className="text-right">
                <h3 className="font-semibold text-gray-900">ارفع الملفات</h3>
                <p className="text-gray-600 text-sm">مسودة التشريع والقوانين المرجعية</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-green-100 rounded-full p-3 ml-4">
                <span className="text-green-600 font-bold text-xl">2</span>
              </div>
              <div className="text-right">
                <h3 className="font-semibold text-gray-900">تحليل تلقائي</h3>
                <p className="text-gray-600 text-sm">مقارنة ذكية بواسطة الذكاء الاصطناعي</p>
              </div>
            </div>
            <div className="flex items-center">
              <div className="bg-purple-100 rounded-full p-3 ml-4">
                <span className="text-purple-600 font-bold text-xl">3</span>
              </div>
              <div className="text-right">
                <h3 className="font-semibold text-gray-900">النتائج</h3>
                <p className="text-gray-600 text-sm">تقرير شامل قابل للتصدير</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={onStartComparison}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl text-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center justify-center mx-auto group"
        >
          <span className="ml-2">ابدأ عملية المقارنة الآن</span>
          <ArrowLeft className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default WelcomePage;