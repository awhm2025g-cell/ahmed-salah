/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './components/layout/Shell';
import { Dashboard } from './pages/Dashboard';
import { TeachersPage } from './pages/TeachersPage';
import { EvaluationsPage } from './pages/EvaluationsPage';
import { UsersPage } from './pages/UsersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrintSettingsPage } from './pages/PrintSettingsPage';
import { Loader2 } from 'lucide-react';
import { LiquidBackground } from './components/ui/Glass';
import { UserRole, EducationStage } from './types';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Toaster, toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { RealtimeNotifications } from './components/RealtimeNotifications';

const AppContent: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const [activeSection, setActiveSection] = useState(() => {
    if (profile?.role === UserRole.SCHOOL_DIRECTOR || 
        profile?.role === UserRole.SCHOOL_VICE_PRINCIPAL || 
        profile?.role === UserRole.SUPERVISOR) {
      return 'evaluations';
    }
    return 'dashboard';
  });
  const [sectionParams, setSectionParams] = useState<any>(null);
  const [setupMode, setSetupMode] = useState(false);

  const handleSectionChange = (section: string, params?: any) => {
    setActiveSection(section);
    setSectionParams(params || null);
  };

  useEffect(() => {
    const handleNavigate = (e: any) => {
      const { detail } = e;
      if (typeof detail === 'string') {
        setActiveSection(detail);
      } else if (detail && detail.section) {
        setActiveSection(detail.section);
        setSectionParams(detail.params);
      }
    };
    window.addEventListener('navigate', handleNavigate);
    return () => window.removeEventListener('navigate', handleNavigate);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0f172a] text-white">
        <LiquidBackground />
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <p className="animate-pulse text-blue-200/60">جاري تحميل النظام...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Handle first time admin setup if no profile exists
  if (user && !profile) {
    const handleSetupAdmin = async () => {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          name: user.displayName || 'Admin',
          email: user.email,
          role: UserRole.ADMIN,
          stage: EducationStage.ALL,
          active: true,
          createdAt: serverTimestamp()
        });
        window.location.reload();
      } catch (e: any) {
        console.error(e);
        toast.error('فشل في تهيئة الحساب: ' + (e.message?.includes('offline') ? 'أنت غير متصل بالإنترنت' : e.message));
      }
    };

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[#0f172a] p-4 text-center text-white">
        <LiquidBackground />
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-bold">مرحباً بك في نظام تقييم المعلمين</h1>
          <p className="text-white/60">لم يتم العثور على ملف تعريف لمستخدمك. إذا كنت المسؤول الأول، يرجى تهيئة حسابك.</p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleSetupAdmin}
              className="rounded-xl bg-blue-600 px-8 py-3 font-bold shadow-lg transition-all hover:bg-blue-500"
            >
              تهيئة حساب أدمن
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="text-xs text-white/40 hover:text-white/60 underline"
            >
              إعادة المحاولة
            </button>
          </div>
          <p className="text-[10px] text-white/20 mt-8">حالة الاتصال: {navigator.onLine ? 'متصل' : 'غير متصل'}</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const role = profile?.role;
    
    switch (activeSection) {
      case 'dashboard': 
        if (role === UserRole.ADMIN || role === UserRole.SUPERVISION_DIRECTOR) return <Dashboard onNavigate={handleSectionChange} />;
        return <EvaluationsPage initialParams={sectionParams} onNavigate={handleSectionChange} />;
      case 'teachers': 
        if (role === UserRole.ADMIN || role === UserRole.SUPERVISION_DIRECTOR) return <TeachersPage onNavigate={handleSectionChange} />;
        return <EvaluationsPage initialParams={sectionParams} onNavigate={handleSectionChange} />;
      case 'evaluations': 
        return <EvaluationsPage initialParams={sectionParams} onNavigate={handleSectionChange} />;
      case 'users': 
        if (role === UserRole.ADMIN) return <UsersPage />;
        return <EvaluationsPage initialParams={sectionParams} onNavigate={handleSectionChange} />;
      case 'reports': 
        if (role === UserRole.ADMIN || role === UserRole.SUPERVISION_DIRECTOR) return <ReportsPage />;
        return <EvaluationsPage initialParams={sectionParams} onNavigate={handleSectionChange} />;
      case 'settings': 
        if (role === UserRole.ADMIN) return <SettingsPage />;
        return <EvaluationsPage initialParams={sectionParams} onNavigate={handleSectionChange} />;
      case 'printSettings':
        if (role === UserRole.ADMIN) return <PrintSettingsPage />;
        return <EvaluationsPage initialParams={sectionParams} onNavigate={handleSectionChange} />;
      default: 
        return <Dashboard />;
    }
  };

  return (
    <Shell activeSection={activeSection} onSectionChange={handleSectionChange}>
      <Toaster position="top-center" reverseOrder={false} />
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="h-full"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <RealtimeNotifications />
      <AppContent />
    </AuthProvider>
  );
}
