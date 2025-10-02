import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import HomePage from './components/HomePage';
import SmartStoragePage from './components/SmartStoragePage';
import WelcomePage from './components/WelcomePage';
import DemoOrUploadPage from './components/DemoOrUploadPage';
import FileUploadPage from './components/FileUploadPage';
import { FileData } from './types/legislation';

const API_URL = 'http://127.0.0.1:8000';

const DEMO_FILES = {
  primary: 'TashreaDraft-Copy.json',
  comparisons: ['JordanLaw-Copy.json','DubaiLaw-Copy.json']
};

function App() {
  const [currentView, setCurrentView] = useState<'home' | 'storage' | 'welcome' | 'choice' | 'upload'>('home');
  const [primaryFile, setPrimaryFile] = useState<FileData | null>(null);
  const [comparisonFiles, setComparisonFiles] = useState<FileData[]>([]);
  const navigate = useNavigate();

  const handleStartProcessing = async () => {
    if (!primaryFile) return;
    const formData = new FormData();
    formData.append('primary', primaryFile.file, primaryFile.name);
    comparisonFiles.forEach(fileData => {
      formData.append('comparisons', fileData.file, fileData.name);
    });
    try {
      const { data } = await axios.post(`${API_URL}/process`, formData);
      if (data.id) {
        navigate(`/results/${data.id}`, {
          state: {
            primaryFileName: primaryFile.name,
            comparisonFileNames: comparisonFiles.map(f => f.name)
          }
        });
      }
    } catch (error) {
      console.error('Error starting processing job:', error);
      alert('فشل بدء عملية المعالجة.');
    }
  };

  const handleSelectDemo = async () => {
    try {
        const payload = {
            primary_file: DEMO_FILES.primary,
            comparison_files: DEMO_FILES.comparisons
        };
        const { data } = await axios.post(`${API_URL}/process-demo`, payload);
        if (data.id) {
            navigate(`/results/${data.id}`, {
                state: {
                    primaryFileName: DEMO_FILES.primary.replace('.json', '.pdf'),
                    comparisonFileNames: DEMO_FILES.comparisons.map(f => f.replace('.json', '.pdf'))
                }
            });
        }
    } catch (error) {
        console.error('Error starting demo processing job:', error);
        alert('فشل بدء عملية الديمو. تأكد من وجود ملفات الديمو في الواجهة الخلفية.');
    }
  };

  const handleSelectUpload = () => {
    setCurrentView('upload');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'home':
        return (
          <HomePage
            onSelectStorage={() => setCurrentView('storage')}
            onSelectComparison={() => setCurrentView('welcome')}
          />
        );
      case 'storage':
        return <SmartStoragePage onBackToHome={() => setCurrentView('home')} />;
      case 'welcome':
        return <WelcomePage onStartComparison={() => setCurrentView('choice')} />;
      case 'choice':
        return <DemoOrUploadPage onSelectDemo={handleSelectDemo} onSelectUpload={handleSelectUpload} />;
      case 'upload':
        return (
          <FileUploadPage
            primaryFile={primaryFile}
            comparisonFiles={comparisonFiles}
            onPrimaryFileChange={setPrimaryFile}
            onComparisonFilesChange={setComparisonFiles}
            onStartProcessing={handleStartProcessing}
          />
        );
      default:
        return (
          <HomePage
            onSelectStorage={() => setCurrentView('storage')}
            onSelectComparison={() => setCurrentView('welcome')}
          />
        );
    }
  };

  return <div dir="rtl">{renderContent()}</div>;
}

export default App;
