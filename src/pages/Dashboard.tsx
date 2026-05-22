/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { 
  Users, 
  ClipboardCheck, 
  BarChart3,
  TrendingUp,
  BrainCircuit,
  Plus,
  ArrowUpRight,
  Target,
  Sparkles,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  X
} from 'lucide-react';
import { 
  getGradeLabel, 
  getGradeColor,
  EVALUATION_CRITERIA,
  STAGES
} from '../constants';
import { UserRole, EducationStage } from '../types';
import { ScoreChart } from '../components/dashboard/ScoreChart';
import { analyzeOverallPerformance } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'react-hot-toast';

interface DashboardProps {
  onNavigate?: (section: string, params?: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { profile, isAdmin, isSupervisor } = useAuth();
  const [staleEvaluations, setStaleEvaluations] = useState<any[]>([]);
  const [stats, setStats] = useState({
    teachersCount: 0,
    evaluationsCount: 0,
    averageScore: 0,
    activeUsers: 0,
    draftCount: 0,
    submittedCount: 0,
    approvedCount: 0,
    staleCount: 0
  });
  const [isStaleAlertDismissed, setIsStaleAlertDismissed] = useState(false);
  const [recentEvaluations, setRecentEvaluations] = useState<any[]>([]);
  const [stageStats, setStageStats] = useState<any[]>([]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  
  const currentCriteria = config?.criteria || EVALUATION_CRITERIA;
  const maxPossibleScore = currentCriteria.reduce((sum: number, c: any) => sum + (c.maxScore || 10), 0);

  // Cache key based on data signature
  const getCacheKey = (teachers: any[], evals: any[]) => {
    const lastEval = evals.length > 0 ? Math.max(...evals.map(e => e.createdAt?.seconds || 0)) : 0;
    return `ai_insight_${teachers.length}_${evals.length}_${lastEval}`;
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      const cSnap = await getDoc(doc(db, 'config', 'app'));
      const appConfig = cSnap.exists() ? cSnap.data() : null;
      setConfig(appConfig);

      const teachersSnap = await getDocs(collection(db, 'teachers'));
      const evalsSnap = await getDocs(collection(db, 'evaluations'));
      const usersSnap = await getDocs(collection(db, 'users'));

      let teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      let evals = evalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // Filter for Supervisor
      if (profile?.role === UserRole.SUPERVISOR) {
        teachers = teachers.filter(t => t.supervisorId === profile.uid || t.defaultEvaluatorId === profile.uid);
        const myTeacherIds = new Set(teachers.map(t => t.id));
        evals = evals.filter(e => myTeacherIds.has(e.teacherId) || e.evaluatorId === profile.uid);
      } else if (profile?.role !== UserRole.ADMIN && profile?.role !== UserRole.SUPERVISION_DIRECTOR && profile?.stage && profile.stage !== EducationStage.ALL) {
        // Stage-based filtering for other roles
        teachers = teachers.filter(t => t.stage === profile.stage);
        const myTeacherIds = new Set(teachers.map(t => t.id));
        evals = evals.filter(e => myTeacherIds.has(e.teacherId));
      }
      
      const rawAvg = evals.length > 0 
        ? evals.reduce((acc: number, curr: any) => acc + (curr.totalScore || 0), 0) / evals.length 
        : 0;
      
      const localCriteria = appConfig?.criteria || EVALUATION_CRITERIA;
      const localMaxScore = localCriteria.reduce((sum: number, c: any) => sum + (c.maxScore || 10), 0);
      const normalizedAvg = (rawAvg / localMaxScore) * 100;

      const staleEvals = evals.filter(e => {
        if (e.status !== 'draft' && e.status !== 'submitted') return false;
        const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const createdAt = e.createdAt?.toMillis ? e.createdAt.toMillis() : new Date(e.createdAt).getTime();
        return createdAt < fourteenDaysAgo;
      });

      setStaleEvaluations(staleEvals);

      setStats({
        teachersCount: teachersSnap.size,
        evaluationsCount: evalsSnap.size,
        averageScore: Math.round(normalizedAvg),
        activeUsers: usersSnap.size,
        draftCount: evals.filter(e => e.status === 'draft').length,
        submittedCount: evals.filter(e => e.status === 'submitted').length,
        approvedCount: evals.filter(e => e.status === 'approved').length,
        staleCount: staleEvals.length
      });

      // Calculate stage stats for the chart
      const sStats = STAGES.map(stage => {
        const stageEvals = evals.filter(e => {
          const teacher = teachers.find(t => t.id === e.teacherId);
          return teacher?.stage === stage.value;
        });
        const avg = stageEvals.length > 0
          ? (stageEvals.reduce((acc, curr) => acc + (curr.totalScore || 0), 0) / stageEvals.length / localMaxScore) * 100
          : 0;
        return {
          name: stage.label,
          score: Math.round(avg),
          count: stageEvals.length
        };
      });
      setStageStats(sStats);

      // Get 5 recent evaluations
      const q = query(collection(db, 'evaluations'), orderBy('createdAt', 'desc'), limit(5));
      const recentSnap = await getDocs(q);
      setRecentEvaluations(recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Check for cached AI insight
      const cacheKey = getCacheKey(teachers, evals);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setAiInsight(cached);
      } else if (evals.length >= 3) {
        // Auto-trigger if we have enough data and no cache
        triggerAI(teachers, evals);
      }
    };

    fetchDashboardData().catch(console.error);
  }, []);

  const triggerAI = async (teachers: any[], evals: any[]) => {
    setIsAiLoading(true);
    try {
      const insight = await analyzeOverallPerformance(teachers, evals);
      setAiInsight(insight);
      const cacheKey = getCacheKey(teachers, evals);
      localStorage.setItem(cacheKey, insight);
    } catch (e: any) {
      console.error(e);
      // Don't show error immediately on auto-trigger to avoid bad UX
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleGenerateAI = async () => {
    setIsAiLoading(true);
    try {
      const teachersSnap = await getDocs(collection(db, 'teachers'));
      const evalsSnap = await getDocs(collection(db, 'evaluations'));
      const teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const evals = evalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      const insight = await analyzeOverallPerformance(teachers, evals);
      setAiInsight(insight);
      const cacheKey = getCacheKey(teachers, evals);
      localStorage.setItem(cacheKey, insight);
    } catch (e: any) {
      console.error(e);
      setAiInsight(`عذراً، فشل في توليد التحليلات: ${e.message || 'خطأ غير معروف'}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 h-full flex flex-col text-right" dir="rtl">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-xl md:text-2xl font-bold text-white mb-1">لوحة التميز المؤسسي</h2>
          <p className="text-slate-400 text-[10px] md:text-sm flex items-center gap-2">
            <Calendar size={14} className="text-blue-400" />
            مرحباً بك، {profile?.name} • العام الدراسي {config?.academicYear || '1445-1446'}هـ
          </p>
        </motion.div>
        <div className="flex gap-2">
          {(isAdmin || isSupervisor) && (
            <GlassButton className="text-[10px] md:text-sm bg-white/5 border border-white/10 hover:bg-white/10 shadow-none from-transparent to-transparent py-2.5 px-4 rounded-xl">
              تصدير التحليلات
            </GlassButton>
          )}
          <GlassButton 
            onClick={() => onNavigate?.('evaluations')} 
            className="text-[10px] md:text-sm px-4 md:px-6 py-2.5 bg-gradient-to-l from-blue-600 to-indigo-600 rounded-xl font-bold shadow-lg shadow-blue-900/40 flex items-center gap-2 group"
          >
            <Plus size={18} className="group-hover:rotate-90 transition-transform" />
            تقييم جديد
          </GlassButton>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {stats.staleCount > 0 && !isStaleAlertDismissed && (isAdmin || isSupervisor) && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="col-span-full"
          >
            <GlassCard 
              className="bg-red-500/10 border-red-500/20 p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 group cursor-pointer hover:bg-red-500/15 transition-all relative overflow-hidden"
              onClick={() => onNavigate?.('evaluations', { staleOnly: true })}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-all duration-700" />
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 animate-bounce">
                  <Clock size={24} />
                </div>
                <div>
                  <h4 className="text-base font-black text-red-400">تنبيه عاجل: تقييمات متأخرة جداً</h4>
                  <p className="text-xs text-red-300/60 mt-1">يوجد {stats.staleCount} تقييم معلق منذ أكثر من 14 يوماً. نرجو المراجعة والاعتماد لإغلاق الدورة التقييمية.</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 relative z-10 self-end md:self-auto">
                <GlassButton className="bg-red-500 text-white text-[10px] md:text-xs py-2 px-6 rounded-xl font-bold shadow-lg shadow-red-900/40">
                  عرض المتأخرات
                </GlassButton>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsStaleAlertDismissed(true);
                  }}
                  className="p-2 hover:bg-red-500/20 rounded-xl text-red-500/40 hover:text-red-400 transition-colors"
                  title="إغلاق التنبيه"
                >
                  <X size={18} />
                </button>
              </div>
            </GlassCard>
          </motion.div>
        )}
        {[
          { label: 'إجمالي المعلمين', value: stats.teachersCount, icon: Users, color: 'blue', trend: '+2 هذا الشهر' },
          { label: 'تقييمات مكتملة', value: stats.evaluationsCount, icon: ClipboardCheck, color: 'emerald', trend: '85% نسبة الإنجاز' },
          { label: 'متوسط الأداء العام', value: `${stats.averageScore}%`, icon: Target, color: 'purple', trend: 'في تحسن مستمر' },
          { label: 'التقدير المؤسسي', value: getGradeLabel(stats.averageScore), icon: Sparkles, color: 'amber', trend: 'مستوى متميز' }
        ].map((v, i) => (
          <motion.div 
            key={v.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <GlassCard className={cn("p-4 md:p-6 bg-gradient-to-br border-white/5 relative overflow-hidden", 
              v.color === 'blue' ? "from-blue-600/10 to-transparent" :
              v.color === 'emerald' ? "from-emerald-600/10 to-transparent" :
              v.color === 'purple' ? "from-purple-600/10 to-transparent" :
              "from-amber-600/10 to-transparent"
            )} hover={true}>
              <div className={cn("h-10 w-10 md:h-12 md:w-12 rounded-2xl flex items-center justify-center mb-3 md:mb-4",
                v.color === 'blue' ? "bg-blue-500/20 text-blue-400" :
                v.color === 'emerald' ? "bg-emerald-500/20 text-emerald-400" :
                v.color === 'purple' ? "bg-purple-500/20 text-purple-400" :
                "bg-amber-500/20 text-amber-400"
              )}>
                <v.icon size={20} />
              </div>
              <p className="text-[10px] md:text-xs text-slate-400 mb-1">{v.label}</p>
              <h3 className={cn("text-xl md:text-3xl font-black", v.color === 'amber' ? 'text-lg md:text-2xl truncate' : '')}>{v.value}</h3>
              <div className="mt-2 flex items-center gap-1 text-[8px] md:text-[10px] text-white/20 whitespace-nowrap">
                <TrendingUp size={10} className="text-emerald-500" />
                {v.trend}
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'مسودات', value: stats.draftCount, icon: FileText, color: 'amber', status: 'draft' },
          { label: 'بانتظار الاعتماد', value: stats.submittedCount, icon: Clock, color: 'emerald', status: 'submitted' },
          { label: 'تقييمات مكتملة', value: stats.approvedCount, icon: CheckCircle2, color: 'blue', status: 'approved' }
        ].map((v, i) => (
          <motion.div 
            key={v.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
          >
            <GlassCard 
              className="p-4 bg-white/5 border-white/5 flex items-center justify-between group cursor-pointer hover:border-blue-500/30 transition-all"
              onClick={() => onNavigate?.('evaluations', { status: v.status })}
              hover={true}
            >
              <div className="flex items-center gap-3">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                  v.color === 'blue' ? "bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white" :
                  v.color === 'emerald' ? "bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white" :
                  "bg-amber-500/10 text-amber-400 group-hover:bg-amber-500 group-hover:text-white"
                )}>
                  <v.icon size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">{v.label}</p>
                  <h4 className="text-lg font-bold">{v.value}</h4>
                </div>
              </div>
              <ArrowUpRight size={16} className="text-white/10 group-hover:text-blue-400 group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] transition-all" />
            </GlassCard>
          </motion.div>
        ))}
      </section>
      
      {isSupervisor && (
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Users size={20} className="text-blue-400" />
              المعلمون تحت إشرافك المباشر
            </h3>
            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20 font-bold">
              وضع الإشراف التربوي
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stageStats.some(s => s.count > 0) ? STAGES.map(stage => {
              const stageTeachers = stageStats.find(s => s.name === stage.label);
              if (!stageTeachers || stageTeachers.count === 0) return null;
              
              return (
                <GlassCard key={stage.value} className="p-4 border-white/5 bg-white/5" hover={true}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Users size={16} />
                      </div>
                      <h4 className="font-bold text-sm">{stage.label}</h4>
                    </div>
                    <div className={cn("text-lg font-black", getGradeColor(stageTeachers.score))}>
                      {stageTeachers.score}%
                    </div>
                  </div>
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all duration-1000", 
                        stageTeachers.score >= 90 ? "bg-emerald-500" :
                        stageTeachers.score >= 80 ? "bg-blue-500" :
                        stageTeachers.score >= 70 ? "bg-amber-500" : "bg-red-500"
                      )}
                      style={{ width: `${stageTeachers.score}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-white/20 mt-3 flex items-center justify-between">
                    <span>عدد المعلمين المقيّمين: {stageTeachers.count}</span>
                    <span className="font-bold">{getGradeLabel(stageTeachers.score)}</span>
                  </p>
                </GlassCard>
              );
            }) : (
              <div className="col-span-full py-10 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                <p className="text-sm text-white/20">لا توجد بيانات متاحة حالياً لمرحلتك التعليمية</p>
              </div>
            )}
          </div>
        </motion.section>
      )}

      <section className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <GlassCard className="flex flex-col p-6 min-h-[300px] md:min-h-[350px]" hover={false}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="font-bold text-sm md:text-base flex items-center gap-2">
                  <BarChart3 size={18} className="text-blue-400" />
                  تحليل الأداء حسب المراحل التعليمية
                </h4>
                <p className="text-[10px] text-white/40 mt-1">مقارنة متوسط الدرجات لكل مرحلة دراسية</p>
              </div>
              <div className="bg-white/5 rounded-lg px-3 py-1 text-[10px] text-blue-300 border border-blue-500/20">
                مباشر
              </div>
            </div>
            <div className="flex-1">
              <ScoreChart data={stageStats} />
            </div>
          </GlassCard>

          <GlassCard className="flex-1 overflow-hidden flex flex-col p-6 border-white/5" hover={false}>
            <div className="flex items-center justify-between mb-6">
              <h4 className="font-bold text-sm md:text-base flex items-center gap-2 text-blue-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                سجل النشاط الحديث
              </h4>
              <button 
                onClick={() => onNavigate?.('evaluations')}
                className="text-blue-400 text-[10px] md:text-xs hover:underline flex items-center gap-1 group"
              >
                عرض السجل بالكامل
                <ArrowUpRight size={14} className="group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] transition-transform" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto pr-1">
              {recentEvaluations.length > 0 ? recentEvaluations.map((ev) => (
                <div 
                  key={ev.id} 
                  onClick={() => onNavigate?.('evaluations', { teacherId: ev.teacherId, teacherName: ev.teacherName })}
                  className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 shrink-0 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center font-bold text-sm border border-blue-500/10 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    {ev.teacherName?.substring(0, 1) || 'ع'}
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center gap-2">
                      <h5 className="text-sm font-bold truncate group-hover:text-blue-200 transition-colors">{ev.teacherName || 'معلم مجهول'}</h5>
                      {ev.aiAnalysis && (
                        <div className="flex items-center gap-1 px-1 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400" title="تم التحليل بالذكاء الاصطناعي">
                          <BrainCircuit size={8} />
                          <span className="text-[6px] font-bold uppercase tracking-widest">AI</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-white/40 truncate">بواسطة: {ev.evaluatorName.split(' ')[0]}</p>
                      <span className="w-1 h-1 rounded-full bg-white/10" />
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1",
                        ev.status === 'approved' ? "bg-blue-500/10 text-blue-400" : 
                        ev.status === 'submitted' ? "bg-emerald-500/10 text-emerald-400" :
                        "bg-amber-500/10 text-amber-400"
                      )}>
                        {(() => {
                          const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
                          const createdAt = ev.createdAt?.toMillis ? ev.createdAt.toMillis() : new Date(ev.createdAt).getTime();
                          const isStale = (ev.status === 'draft' || ev.status === 'submitted') && createdAt < fourteenDaysAgo;
                          return (
                            <>
                              {isStale && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                              {ev.status === 'approved' ? 'مكتمل' : ev.status === 'submitted' ? 'بانتظار الاعتماد' : 'مسودة'}
                              {isStale && <span className="text-[7px] text-red-400 mr-1">(متأخر)</span>}
                            </>
                          );
                        })()}
                      </span>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className={cn("text-sm md:text-lg font-black leading-tight", getGradeColor((ev.totalScore / maxPossibleScore) * 100))}>
                      {ev.totalScore}
                    </div>
                    <div className="text-[9px] md:text-[10px] text-white/20 font-bold">
                      / {maxPossibleScore}
                    </div>
                  </div>
                </div>
              )) : (
                <div className="flex h-32 items-center justify-center text-white/10 text-xs border-2 border-dashed border-white/5 rounded-2xl">
                  لا توجد تقييمات مسجلة حالياً
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="flex flex-col gap-6">
          <GlassCard className="flex flex-col h-full bg-gradient-to-br from-purple-600/20 to-indigo-600/10 border-purple-500/20 p-6 min-h-[400px] md:min-h-[500px]" hover={false}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500/20 rounded-xl border border-purple-500/20">
                  <BrainCircuit size={20} className="text-purple-400" />
                </div>
                <h4 className="font-bold text-sm md:text-base text-purple-100">تحليل الذكاء الاصطناعي</h4>
              </div>
              <div className="flex items-center gap-2">
                {aiInsight && !isAiLoading && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(aiInsight);
                        toast.success('تم نسخ التحليل بنجاح');
                      }}
                      className="p-1.5 hover:bg-white/5 rounded-lg text-purple-400/50 hover:text-purple-400 transition-colors"
                      title="نسخ التحليل"
                    >
                      <FileText size={14} />
                    </button>
                    <button 
                      onClick={handleGenerateAI}
                      className="p-1.5 hover:bg-white/5 rounded-lg text-purple-400/50 hover:text-purple-400 transition-colors"
                      title="تحديث التحليل"
                    >
                      <Sparkles size={14} />
                    </button>
                  </div>
                )}
                {isAiLoading && <div className="h-4 w-4 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin" />}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide text-right font-sans">
              {isAiLoading ? (
                <div className="space-y-4">
                  <div className="h-4 bg-white/5 rounded-full w-full animate-pulse" />
                  <div className="h-4 bg-white/5 rounded-full w-4/5 animate-pulse" />
                  <div className="h-8 md:h-12 bg-white/5 rounded-2xl w-full animate-pulse" />
                  <div className="h-4 bg-white/5 rounded-full w-3/4 animate-pulse" />
                  <div className="h-4 bg-white/5 rounded-full w-full animate-pulse" />
                </div>
              ) : aiInsight ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="prose prose-invert prose-xs md:prose-sm max-w-none text-right leading-relaxed"
                >
                  <ReactMarkdown>{aiInsight}</ReactMarkdown>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <div className="mb-4 p-4 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <BrainCircuit size={32} />
                  </div>
                  <h5 className="text-sm font-bold mb-2">الرؤى الاستراتيجية الذكية</h5>
                  <p className="text-xs text-white/40 mb-6 max-w-[200px] mx-auto">احصل على تحليل شامل لنقاط القوة والفرص التعليمية بناءً على البيانات المتوفرة.</p>
                  <GlassButton 
                    onClick={handleGenerateAI}
                    className="bg-purple-600/50 hover:bg-purple-600 text-[10px] md:text-sm py-2 px-6 rounded-xl"
                  >
                    توليد التحليل الآن
                  </GlassButton>
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-6 border-t border-white/5">
              <GlassButton 
                onClick={() => onNavigate?.('reports')}
                className="w-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs py-3 font-bold hover:bg-purple-500/30 flex items-center justify-center gap-2"
              >
                استعراض التقارير الإحصائية
                <ArrowUpRight size={14} />
              </GlassButton>
            </div>
          </GlassCard>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-all duration-700" />
            <p className="text-[10px] text-white/40 mb-1 font-bold uppercase tracking-widest relative z-10">تطوير وإشراف</p>
            <h5 className="text-xs md:text-sm font-black text-white relative z-10">أ. أحمد صلاح (أبو عمر)</h5>
            <p className="text-[10px] text-white/20 mt-1 relative z-10">مدير الإشراف والتميز المؤسسي</p>
            <div className="h-1 w-12 bg-gradient-to-r from-blue-500 to-transparent mt-4 rounded-full" />
          </div>
        </div>
      </section>
      
      <footer className="text-[9px] md:text-[10px] text-white/20 text-center py-6 border-t border-white/5 mt-auto">
        نظام الأوائل الرقمي لتقييم الأداء © {new Date().getFullYear()} • جميع الحقوق محفوظة
      </footer>
    </div>
  );
};
