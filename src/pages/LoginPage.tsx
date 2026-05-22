/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { GlassCard, GlassButton, LiquidBackground } from '../components/ui/Glass';
import { LogIn, GraduationCap } from 'lucide-react';
import { motion } from 'motion/react';

export const LoginPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء تسجيل الدخول");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-white" dir="rtl">
      <LiquidBackground />
      
      <GlassCard className="w-full max-w-sm border-white/10 bg-white/5 py-8 md:py-12 px-6 md:px-10 text-center rounded-3xl" hover={false}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mx-auto mb-6 flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl md:rounded-3xl bg-blue-500 shadow-lg shadow-blue-500/20"
        >
          <GraduationCap size={40} className="text-white" />
        </motion.div>

        <h1 className="mb-2 text-xl md:text-2xl font-bold tracking-tight">نظام تقييم الأداء الوظيفي</h1>
        <p className="mb-8 text-blue-300 text-xs md:text-sm">مدارس الأوائل الأهلية</p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/20 p-3 text-[10px] md:text-sm text-red-300 border border-red-500/20">
            {error}
          </div>
        )}

        <GlassButton 
          onClick={handleLogin}
          disabled={loading}
          className="group flex w-full items-center justify-center gap-3 bg-gradient-to-l from-blue-600 to-indigo-600 shadow-xl shadow-blue-900/40 py-4"
        >
          <LogIn size={20} className="transition-transform group-hover:translate-x-1" />
          <span className="text-sm md:text-base font-medium">
            {loading ? "جاري الدخول..." : "تسجيل الدخول عبر جوجل"}
          </span>
        </GlassButton>

        <div className="mt-10 md:mt-12 pt-6 md:pt-8 border-t border-white/5">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <p className="text-[9px] md:text-[10px] text-white/40 mb-1">تطوير وإشراف</p>
            <h2 className="text-xs md:text-sm font-bold text-white">أ. أحمد صلاح (أبو عمر)</h2>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
