/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  UserSquare2, 
  ClipboardCheck, 
  FileBox, 
  Settings, 
  LogOut,
  Menu,
  X,
  GraduationCap,
  Printer
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { UserRole } from '../../types';
import { ROLES } from '../../constants';

interface ShellProps {
  children: React.ReactNode;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export const Shell: React.FC<ShellProps> = ({ children, activeSection, onSectionChange }) => {
  const { profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.SUPERVISION_DIRECTOR] },
    { id: 'teachers', label: 'إدارة المعلمين', icon: UserSquare2, roles: [UserRole.ADMIN, UserRole.SUPERVISION_DIRECTOR] },
    { id: 'evaluations', label: 'التقييمات', icon: ClipboardCheck, roles: [UserRole.ADMIN, UserRole.SUPERVISION_DIRECTOR, UserRole.SCHOOL_DIRECTOR, UserRole.SCHOOL_VICE_PRINCIPAL, UserRole.SUPERVISOR] },
    { id: 'users', label: 'المستخدمين', icon: Users, roles: [UserRole.ADMIN] },
    { id: 'reports', label: 'التقارير', icon: FileBox, roles: [UserRole.ADMIN, UserRole.SUPERVISION_DIRECTOR] },
    { id: 'printSettings', label: 'إعدادات الطباعة', icon: Printer, roles: [UserRole.ADMIN] },
    { id: 'settings', label: 'الإعدادات', icon: Settings, roles: [UserRole.ADMIN] },
  ];

  const filteredMenu = menuItems.filter(item => profile?.role && item.roles.includes(profile.role));

  const handleSectionChange = (id: string) => {
    onSectionChange(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-white overflow-hidden print:bg-white print:h-auto print:overflow-visible" dir="rtl">
      {/* Mobile Header */}
      <div className="flex md:hidden fixed top-0 left-0 right-0 h-16 items-center justify-between px-4 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/5 z-[60]">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
            <GraduationCap size={22} className="text-blue-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xs leading-tight">نظام الأوائل</span>
            <span className="text-[9px] text-white/40 leading-tight">تقييم الأداء</span>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="rounded-xl p-2 hover:bg-white/5 transition-colors"
          aria-label={isMobileMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar - Desktop and Mobile Overlay */}
      <AnimatePresence>
        {(isMobileMenuOpen || window.innerWidth >= 768) && (
          <motion.aside
            initial={window.innerWidth < 768 ? { x: '100%' } : false}
            animate={{ 
              x: 0,
              width: window.innerWidth < 768 ? '280px' : (isSidebarOpen ? 260 : 80)
            }}
            exit={window.innerWidth < 768 ? { x: '100%' } : undefined}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed md:relative z-[70] flex flex-col h-full border-l border-white/10 bg-white/5 backdrop-blur-3xl transition-all shadow-2xl md:shadow-none print:hidden",
              !isMobileMenuOpen && "hidden md:flex"
            )}
          >
            <div className="hidden md:flex h-20 items-center justify-between px-6">
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 overflow-hidden"
                  >
                    <div className="flex h-10 w-10 min-w-[40px] items-center justify-center rounded-xl bg-blue-500/20">
                      <GraduationCap className="text-blue-400" />
                    </div>
                    <div className="truncate">
                      <h2 className="text-sm font-bold">تقييم الأداء الوظيفي</h2>
                      <p className="text-[10px] text-white/40">نسخة 2026</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="rounded-lg p-2 hover:bg-white/5"
              >
                {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>

            {/* Mobile Sidebar Header */}
            <div className="flex md:hidden h-20 items-center gap-3 px-6 border-b border-white/10 mb-2">
              <div className="flex h-10 w-10 min-w-[40px] items-center justify-center rounded-xl bg-blue-500/20">
                <GraduationCap className="text-blue-400" />
              </div>
              <div className="truncate">
                <h2 className="text-sm font-bold">نظام الأوائل</h2>
                <p className="text-[10px] text-white/40">تقييم الأداء الوظيفي</p>
              </div>
            </div>

            <nav className="flex-1 space-y-2 px-3 pt-4">
              {filteredMenu.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all",
                      isActive 
                        ? "bg-white/10 text-white border border-white/10" 
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-bg"
                        className="absolute inset-0 rounded-xl border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                      />
                    )}
                    <Icon size={20} className={cn("relative z-10", isActive && "text-blue-400")} />
                    {(isSidebarOpen || window.innerWidth < 768) && (
                      <span className="relative z-10 flex-1 text-right text-sm font-medium">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto p-4 flex flex-col gap-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <Users size={16} className="text-blue-400" />
                  </div>
                  {(isSidebarOpen || window.innerWidth < 768) && (
                    <div className="truncate">
                      <p className="text-xs font-bold truncate">{profile?.name || 'مستخدم'}</p>
                      <p className="text-[10px] text-white/40 truncate">{ROLES.find(r => r.value === profile?.role)?.label || 'غير محدد'}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 px-2">
                <button
                  onClick={() => auth.signOut()}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-red-400 transition-all hover:bg-red-500/10"
                >
                  <LogOut size={20} />
                  {(isSidebarOpen || window.innerWidth < 768) && <span className="text-sm font-medium">خروج من النظام</span>}
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Backdrop for mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-[65] bg-black/60 md:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 flex flex-col mt-16 md:mt-0 print:p-0 print:m-0 print:bg-white print:text-black print:overflow-visible print:h-auto print:block">
        {/* Background Blobs for Liquid Effect */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden print:hidden">
          <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[10%] h-[600px] w-[600px] rounded-full bg-purple-600/10 blur-[150px]" />
        </div>

        <div className="mx-auto max-w-7xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
