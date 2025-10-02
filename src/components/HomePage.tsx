import React from 'react';
import { Scale, FolderOpen, GitCompare } from 'lucide-react';

interface HomePageProps {
  onSelectStorage: () => void;
  onSelectComparison: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onSelectStorage, onSelectComparison }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-100 via-beige-50 to-gold-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 pt-12">
          <div className="flex items-center justify-center mb-8">
            <Scale className="h-20 w-20 text-gold-600 ml-4" />
          </div>
          <h1 className="text-6xl font-bold text-darktext mb-4">منصّة ذكية للمحامي</h1>
          <p className="text-2xl text-darktext-light max-w-3xl mx-auto leading-relaxed">
            أداة قانونية متطورة تجمع بين التخزين الذكي للوثائق والدراسة المقارنة المتقدمة
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 max-w-6xl mx-auto">
          <div
            onClick={onSelectStorage}
            className="group bg-white rounded-3xl shadow-xl p-10 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 border-2 border-gold-200 hover:border-gold-500"
          >
            <div className="flex items-center justify-center w-24 h-24 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mb-8 mx-auto group-hover:scale-110 transition-transform duration-300">
              <FolderOpen className="h-12 w-12 text-white" />
            </div>

            <h2 className="text-3xl font-bold text-darktext mb-4 text-center">التخزين الذكي للوثائق</h2>

            <div className="space-y-4 text-darktext-light text-lg leading-relaxed">
              <p className="text-center mb-6">
                نظام متقدم لتنظيم وحفظ المستندات القانونية بطريقة ذكية
              </p>

              <div className="bg-beige-100 rounded-xl p-6 space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center ml-4 flex-shrink-0 mt-1">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-darktext mb-1">استخراج النص بتقنية OCR</h3>
                    <p className="text-base">تحويل المستندات الممسوحة ضوئيًا إلى نصوص قابلة للبحث والتحليل</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center ml-4 flex-shrink-0 mt-1">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-darktext mb-1">التصنيف التلقائي</h3>
                    <p className="text-base">تصنيف المستندات تلقائيًا حسب النوع والمحتوى باستخدام الذكاء الاصطناعي</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center ml-4 flex-shrink-0 mt-1">
                    <span className="text-white font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-darktext mb-1">التنظيم السحابي</h3>
                    <p className="text-base">حفظ المستندات في مجلدات منظمة على Azure Blob Storage</p>
                  </div>
                </div>
              </div>
            </div>

            <button className="mt-8 w-full bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-bold py-4 px-6 rounded-xl text-xl shadow-lg transition-all duration-300">
              ابدأ التخزين الذكي
            </button>
          </div>

          <div
            onClick={onSelectComparison}
            className="group bg-white rounded-3xl shadow-xl p-10 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 border-2 border-gold-200 hover:border-gold-500"
          >
            <div className="flex items-center justify-center w-24 h-24 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mb-8 mx-auto group-hover:scale-110 transition-transform duration-300">
              <GitCompare className="h-12 w-12 text-white" />
            </div>

            <h2 className="text-3xl font-bold text-darktext mb-4 text-center">الدراسة المقارنة</h2>

            <div className="space-y-4 text-darktext-light text-lg leading-relaxed">
              <p className="text-center mb-6">
                مقارنة شاملة للتشريعات مع القوانين المرجعية بدقة عالية
              </p>

              <div className="bg-beige-100 rounded-xl p-6 space-y-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center ml-4 flex-shrink-0 mt-1">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-darktext mb-1">مقارنة مادة بمادة</h3>
                    <p className="text-base">تحليل دقيق لكل مادة في التشريع مقابل القوانين المرجعية</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center ml-4 flex-shrink-0 mt-1">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-darktext mb-1">نتائج فورية</h3>
                    <p className="text-base">عرض النتائج بشكل تفاعلي مع تحديث مباشر لحالة المقارنة</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center ml-4 flex-shrink-0 mt-1">
                    <span className="text-white font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-darktext mb-1">اقتراحات وبحث معمق</h3>
                    <p className="text-base">اقتراحات تعديل ذكية وإمكانية البحث المعمق في المصادر القانونية</p>
                  </div>
                </div>
              </div>
            </div>

            <button className="mt-8 w-full bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-bold py-4 px-6 rounded-xl text-xl shadow-lg transition-all duration-300">
              ابدأ الدراسة المقارنة
            </button>
          </div>
        </div>

        <div className="mt-16 text-center">
          <div className="inline-block bg-white rounded-2xl shadow-lg p-8 border border-gold-200">
            <h3 className="text-2xl font-bold text-darktext mb-3">لماذا منصتنا؟</h3>
            <div className="grid md:grid-cols-3 gap-6 text-darktext-light">
              <div>
                <div className="text-4xl font-bold text-gold-600 mb-2">98%</div>
                <p className="text-lg">دقة في التصنيف</p>
              </div>
              <div>
                <div className="text-4xl font-bold text-gold-600 mb-2">24/7</div>
                <p className="text-lg">متاح على مدار الساعة</p>
              </div>
              <div>
                <div className="text-4xl font-bold text-gold-600 mb-2">AI</div>
                <p className="text-lg">مدعوم بالذكاء الاصطناعي</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
