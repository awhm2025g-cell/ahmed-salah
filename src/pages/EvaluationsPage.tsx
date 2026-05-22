/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, getDoc, orderBy, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { EVALUATION_CRITERIA, getGradeLabel, getGradeColor, STAGES } from '../constants';
import { Teacher, Evaluation, UserRole, EducationStage, UserProfile } from '../types';
import { Plus, Search, ClipboardCheck, ArrowRight, BrainCircuit, Save, CheckCircle2, ChevronLeft, ChevronRight, MessageSquare, Download, UserSquare2, Printer, ShieldCheck, BookOpen, School, Star, Filter, Undo2, Trash2, Loader2, X, Calendar, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeTeacherPerformance } from '../lib/gemini';
import { logAction } from '../lib/audit';
import { Toaster, toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { PrintEvaluation } from '../components/reports/PrintEvaluation';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis, XAxis, AreaChart, Area } from 'recharts';

interface EvaluationsPageProps {
  initialParams?: {
    teacherId?: string;
    teacherName?: string;
    status?: 'draft' | 'submitted' | 'approved';
    staleOnly?: boolean;
  };
  onNavigate?: (section: string, params?: any) => void;
}

export const EvaluationsPage: React.FC<EvaluationsPageProps> = ({ initialParams, onNavigate }) => {
  const { profile } = useAuth();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const canCreateEvaluation = profile?.role === UserRole.SCHOOL_DIRECTOR || 
                             profile?.role === UserRole.SCHOOL_VICE_PRINCIPAL || 
                             profile?.role === UserRole.SUPERVISOR ||
                             profile?.role === UserRole.ADMIN;

  const [activeStep, setActiveStep] = useState<'list' | 'create' | 'view' | 'history'>(() => {
    if (canCreateEvaluation && profile?.role !== UserRole.ADMIN && !initialParams?.teacherId && !initialParams?.status) {
      return 'create';
    }
    return 'list';
  });
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Form State
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [generalNotes, setGeneralNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState(initialParams?.teacherName || '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'submitted' | 'approved'>(initialParams?.status || 'all');
  const [staleOnlyFilter, setStaleOnlyFilter] = useState<boolean>(initialParams?.staleOnly || false);

  // Effect to handle initialParams changes
  useEffect(() => {
    if (initialParams?.teacherId && teachers.length > 0) {
      const teacher = teachers.find(t => t.id === initialParams.teacherId);
      if (teacher) {
        setSelectedTeacher(teacher);
        setActiveStep('history');
      }
    }
    if (initialParams?.status) {
      setStatusFilter(initialParams.status);
    }
    if (initialParams?.staleOnly) {
      setStaleOnlyFilter(true);
    }
  }, [initialParams?.teacherId, initialParams?.status, initialParams?.staleOnly, teachers]);

  // Sync searchQuery with initialParams if provided
  useEffect(() => {
    if (initialParams?.teacherName) {
      setSearchQuery(initialParams.teacherName);
    }
  }, [initialParams?.teacherName]);
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>(() => {
    if (profile?.stage && profile.stage !== EducationStage.ALL) {
      return profile.stage;
    }
    return 'all';
  });

  const [config, setConfig] = useState<any>(null);
  const currentCriteria = config?.criteria || EVALUATION_CRITERIA;
  const maxPossibleScore = currentCriteria.reduce((sum: number, c: any) => sum + (c.maxScore || 10), 0);

  useEffect(() => {
    fetchData();
    fetchConfig();
  }, [profile]);

  const fetchConfig = async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'app'));
      if (snap.exists()) {
        setConfig(snap.data());
      }
    } catch (e) {
      console.error('Error fetching config:', e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teachersSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'users'))
      ]);
      
      let allTeachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as Teacher));
      const allUsers = usersSnap.docs.map(doc => ({ uid: doc.id, ...(doc.data() as object) } as UserProfile));
      setUsers(allUsers);
      
      // Filter teachers by stage if user is restricted
      if (profile?.role === UserRole.SUPERVISOR) {
        allTeachers = allTeachers.filter(t => t.supervisorId === profile.uid || t.defaultEvaluatorId === profile.uid);
      } else if (profile?.role !== UserRole.ADMIN && profile?.role !== UserRole.SUPERVISION_DIRECTOR && profile?.stage !== EducationStage.ALL) {
        allTeachers = allTeachers.filter(t => t.stage === profile?.stage);
      }
      setTeachers(allTeachers);

      let evalsQueryBase = collection(db, 'evaluations');
      let q;
      
      if (profile?.role === UserRole.ADMIN || profile?.role === UserRole.SUPERVISION_DIRECTOR) {
        q = query(evalsQueryBase, orderBy('createdAt', 'desc'));
      } else if (profile?.role === UserRole.SUPERVISOR) {
        // Supervisors see everything initially, then we filter in memory
        // This is simpler than complex OR queries in Firestore
        q = query(evalsQueryBase, orderBy('createdAt', 'desc'));
      } else {
        // Other restricted users only see their own evaluations
        q = query(evalsQueryBase, where('evaluatorId', '==', profile?.uid), orderBy('createdAt', 'desc'));
      }

      const evalsSnap = await getDocs(q);
      let allEvals = evalsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as Evaluation));

      if (profile?.role === UserRole.SUPERVISOR) {
        const myTeacherIds = new Set(allTeachers.map(t => t.id));
        allEvals = allEvals.filter(e => myTeacherIds.has(e.teacherId) || e.evaluatorId === profile.uid);
      }

      setEvaluations(allEvals);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalScore = () => {
    return (Object.values(scores) as number[]).reduce((a, b) => a + b, 0);
  };

  const handleSaveEvaluation = async (status: 'draft' | 'submitted') => {
    if (!selectedTeacher || !profile) return;

    try {
      const total = calculateTotalScore();
      
      // Determine evaluator
      let evalId = profile.uid;
      let evalName = profile.name;
      let evalRole = profile.role as string;
      
      if (!isEditing && selectedTeacher.defaultEvaluatorId) {
        const foundEvaluator = users.find(u => u.uid === selectedTeacher.defaultEvaluatorId);
        if (foundEvaluator) {
          evalId = foundEvaluator.uid;
          evalName = foundEvaluator.name;
          evalRole = foundEvaluator.role;
        }
      }

      const evalData: any = {
        teacherId: selectedTeacher.id,
        evaluatorId: evalId,
        evaluatorName: evalName,
        evaluatorRole: evalRole,
        academicYear: config?.academicYear || "1445-1446",
        semester: config?.semester || "الفصل الثاني",
        scores,
        totalScore: total,
        notes,
        generalNotes,
        status,
        digitallySigned: status === 'submitted',
        updatedAt: serverTimestamp()
      };

      if (isEditing && selectedEvaluation) {
        await updateDoc(doc(db, 'evaluations', selectedEvaluation.id), evalData);
        logAction('EVALUATION_UPDATED', selectedEvaluation.id, 'evaluation', `تم تعديل التقييم بنجاح وحالته الحالية: ${status}`);
        toast.success(status === 'submitted' ? 'تم تحديث التقييم واعتماده' : 'تم تحديث المسودة');
      } else {
        evalData.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'evaluations'), evalData);
        logAction('EVALUATION_CREATED', docRef.id, 'evaluation', `تم إنشاء تقييم جديد بنجاح وحالته: ${status}`);
        toast.success(status === 'submitted' ? 'تم إرسال التقييم بنجاح' : 'تم حفظ المسودة');
      }
      
      setIsEditing(false);
      setActiveStep('list');
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء حفظ التقييم');
    }
  };

  const handleAiAnalysis = async (evalItem: Evaluation) => {
    const teacher = teachers.find(t => t.id === evalItem.teacherId);
    if (!teacher) return;

    setIsAnalyzing(true);
    try {
      // Get history of other evaluations for this teacher
      const history = evaluations.filter(e => e.teacherId === teacher.id && e.id !== evalItem.id && e.status === 'submitted');
      
      const analysis = await analyzeTeacherPerformance(teacher, evalItem, history, currentCriteria);
      await updateDoc(doc(db, 'evaluations', evalItem.id), { aiAnalysis: analysis });
      logAction('EVALUATION_AI_ANALYSIS', evalItem.id, 'evaluation', 'تم توليد تحليل الذكاء الاصطناعي للتقييم');
      toast.success('تم إنجاز التحليل الذكي بنجاح');
      setSelectedEvaluation({ ...evalItem, aiAnalysis: analysis });
      
      // Update local evaluations list
      setEvaluations(prev => prev.map(e => e.id === evalItem.id ? { ...e, aiAnalysis: analysis } : e));
    } catch (e: any) {
      console.error(e);
      toast.error(`فشل في إجراء التحليل الذكي: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveEvaluation = async (evalId: string) => {
    try {
      await updateDoc(doc(db, 'evaluations', evalId), { 
        status: 'approved',
        updatedAt: serverTimestamp()
      });
      logAction('EVALUATION_APPROVED', evalId, 'evaluation', 'تم اعتماد التقييم نهائياً');
      toast.success('تم الاعتماد النهائي للتقييم');
      
      if (selectedEvaluation?.id === evalId) {
        setSelectedEvaluation({ ...selectedEvaluation, status: 'approved' });
      }
      setEvaluations(prev => prev.map(e => e.id === evalId ? { ...e, status: 'approved' } : e));
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء الاعتماد');
    }
  };

  const handleRecallEvaluation = async (evalId: string) => {
    try {
      await updateDoc(doc(db, 'evaluations', evalId), { 
        status: 'draft',
        updatedAt: serverTimestamp()
      });
      logAction('EVALUATION_RECALLED', evalId, 'evaluation', 'تم سحب التقييم وإعادته للمسودة');
      toast.success('تم سحب التقييم وإعادته للمسودة');
      
      if (selectedEvaluation?.id === evalId) {
        setSelectedEvaluation({ ...selectedEvaluation, status: 'draft' });
      }
      setEvaluations(prev => prev.map(e => e.id === evalId ? { ...e, status: 'draft' } : e));
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء سحب التقييم');
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteEvaluation = async (evalId: string, teacherName: string) => {
    // Try to avoid window.confirm in iframe if it causes issues, 
    // but for now let's keep it and wrap in a try-catch for the confirm itself 
    // or just use toast to confirm if we had a confirmation toast.
    // Instead, let's use a standard confirmation for now but ensure it's not the blocker.
    
    let confirmed = false;
    try {
      confirmed = window.confirm(`⚠️ تحذير هام: هل أنت متأكد من رغبتك في حذف تقييم المعلم "${teacherName}"؟
      
تنبيه: سيتم حذف كافة البيانات والتحليلات الخاصة بهذا التقييم نهائياً ولا يمكن استعادتها بعد الحذف.`);
    } catch (e) {
      // If window.confirm fails/is blocked, we might want a fallback, 
      // but for now let's just proceed with confirm for simplicity if it works.
      confirmed = true; 
    }

    if (!confirmed) return;

    setDeletingId(evalId);
    try {
      await deleteDoc(doc(db, 'evaluations', evalId));
      logAction('EVALUATION_DELETED', evalId, 'evaluation', `تم حذف تقييم المعلم: ${teacherName}`);
      toast.success('تم حذف التقييم بنجاح');
      
      if (selectedEvaluation?.id === evalId) {
        setSelectedEvaluation(null);
        setActiveStep('list');
      }
      setEvaluations(prev => prev.filter(e => e.id !== evalId));
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء حذف التقييم');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div dir="rtl">
      <AnimatePresence mode="wait">
        {activeStep === 'list' && (
          <motion.div 
            key="list"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="print:hidden"
          >
            <div className="space-y-6 pb-20 md:pb-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">سجل التقييمات</h1>
                <p className="text-xs md:text-sm text-white/40">إدارة ومتابعة تقييمات الكادر التعليمي</p>
              </div>
              {canCreateEvaluation && (
                <GlassButton 
                  onClick={() => {
                    setScores({});
                    setNotes({});
                    setGeneralNotes('');
                    setActiveStep('create');
                  }}
                  className="flex items-center justify-center gap-2 bg-blue-600 py-3 px-6 text-sm font-bold shadow-blue-500/20"
                >
                  <Plus size={20} />
                  تقييم جديد
                </GlassButton>
              )}
            </div>
            
            {evaluations.filter(e => e.status === 'draft').length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-amber-400">
                  <ClipboardCheck size={20} />
                  <span className="text-sm font-bold">لديك تقييمات مسودة بانتظار الاعتماد</span>
                </div>
              </div>
            )}

            {/* Teacher Summary Info if filtering by teacher */}
            {(() => {
              const matchedTeacher = teachers.find(t => t.id === initialParams?.teacherId || (searchQuery.trim() !== '' && t.name === searchQuery));
              if (matchedTeacher) {
                const teacherEvals = evaluations.filter(e => e.teacherId === matchedTeacher.id);
                if (teacherEvals.length > 0) {
                  const avgRaw = teacherEvals.reduce((acc, curr) => acc + (curr.totalScore || 0), 0) / teacherEvals.length;
                  const normalizedAvg = (avgRaw / maxPossibleScore) * 100;
                  return (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                      <GlassCard className="p-6 border-blue-500/20 bg-blue-500/5" hover={false}>
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                          <div className="flex items-center gap-4 text-right w-full sm:w-auto">
                            <div className="h-16 w-16 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                              <UserSquare2 size={32} />
                            </div>
                            <div>
                              <h2 className="text-xl font-bold">{matchedTeacher.name}</h2>
                              <p className="text-sm text-white/40">{matchedTeacher.subject} • {STAGES.find(s => s.value === matchedTeacher.stage)?.label}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-8 md:gap-12 w-full sm:w-auto mt-4 sm:mt-0">
                            <div className="text-center sm:text-right">
                              <p className="text-[10px] text-white/30 uppercase font-bold mb-1">عدد التقييمات</p>
                              <p className="text-2xl font-black">{teacherEvals.length}</p>
                            </div>
                            <div className="text-center sm:text-right">
                              <p className="text-[10px] text-white/30 uppercase font-bold mb-1">متوسط الأداء</p>
                              <div className="flex items-baseline justify-center sm:justify-start gap-1">
                                <span className={cn("text-2xl font-black", getGradeColor(normalizedAvg))}>{normalizedAvg.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-center sm:justify-end">
                              <GlassButton 
                                onClick={() => {
                                  setSelectedTeacher(matchedTeacher);
                                  setActiveStep('history');
                                }}
                                className="text-[10px] bg-blue-500/10 border-blue-500/20 text-blue-400 py-2 px-4 shadow-none"
                              >
                                سجل التقييم الكامل
                              </GlassButton>
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                }
              }
              return null;
            })()}

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="relative flex-1 group">
                    <Search className={cn(
                      "absolute right-4 top-1/2 -translate-y-1/2 transition-colors",
                      searchQuery ? "text-blue-400" : "text-white/30"
                    )} size={18} />
                    <input 
                      type="text"
                      placeholder="بحث باسم المعلم أو المقيم..."
                      className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pr-12 pl-12 text-sm outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-all font-sans placeholder:text-white/20"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {(profile?.role === UserRole.ADMIN || profile?.role === UserRole.SUPERVISION_DIRECTOR) && (
                    <GlassButton 
                      onClick={() => onNavigate?.('reports')}
                      className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-purple-300 border border-purple-500/20 py-3.5 px-6 text-sm font-bold shadow-none"
                    >
                      <Download size={18} />
                      تصدير التقارير (PDF)
                    </GlassButton>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'الكل', value: 'all' },
                    { label: 'مسودة', value: 'draft' },
                    { label: 'بانتظار الاعتماد', value: 'submitted' },
                    { label: 'مكتمل', value: 'approved' }
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => {
                        setStatusFilter(filter.value as any);
                        setStaleOnlyFilter(false);
                      }}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                        statusFilter === filter.value && !staleOnlyFilter
                          ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40" 
                          : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                  
                  <button
                    onClick={() => {
                      setStaleOnlyFilter(!staleOnlyFilter);
                      if (!staleOnlyFilter) setStatusFilter('all');
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                      staleOnlyFilter 
                        ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/40 animate-pulse" 
                        : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white"
                    )}
                  >
                    المتأخرات (14+ يوم)
                  </button>
                </div>
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              {loading ? (
                Array(6).fill(0).map((_, i) => <GlassCard key={i} className="h-24 animate-pulse bg-white/5 shadow-none border-white/5"><div /></GlassCard>)
              ) : (() => {
                const filteredEvals = evaluations.filter(ev => {
                  const teacher = teachers.find(t => t.id === ev.teacherId);
                  const matchesSearch = teacher?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         ev.evaluatorName?.toLowerCase().includes(searchQuery.toLowerCase());
                  const matchesStatus = statusFilter === 'all' || ev.status === statusFilter;
                  
                  let matchesStale = true;
                  if (staleOnlyFilter) {
                    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
                    const createdAt = ev.createdAt?.toMillis ? ev.createdAt.toMillis() : new Date(ev.createdAt).getTime();
                    matchesStale = (ev.status === 'draft' || ev.status === 'submitted') && createdAt < fourteenDaysAgo;
                  }

                  return matchesSearch && matchesStatus && matchesStale;
                });

                if (filteredEvals.length === 0) {
                  return (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center bg-white/5 rounded-3xl border-2 border-dashed border-white/5">
                      <div className="mb-6 rounded-full bg-white/5 p-8 text-white/10">
                        <ClipboardCheck size={64} />
                      </div>
                      <h3 className="text-xl font-bold text-white/60 mb-2">لا توجد تقييمات حالياً</h3>
                      <p className="text-sm text-white/20 max-w-[280px]">ابدأ بإضافة أول تقييم عبر النقر على زر "تقييم جديد" في الأعلى</p>
                    </div>
                  );
                }

                return filteredEvals.map((ev, i) => {
                  const teacher = teachers.find(t => t.id === ev.teacherId);
                  const normalizedScore = (ev.totalScore / maxPossibleScore) * 100;
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div 
                        onClick={() => { setSelectedEvaluation(ev); setActiveStep('view'); }}
                        className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white/5 p-5 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer group hover:bg-white/[0.07]"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className={cn(
                            "w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center font-bold text-lg border transition-all shadow-lg",
                            ev.status === 'approved' ? "bg-blue-500/10 text-blue-400 border-blue-500/10 shadow-blue-500/5" : 
                            ev.status === 'submitted' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/10 shadow-emerald-500/5" :
                            "bg-amber-500/10 text-amber-400 border-amber-500/10 shadow-amber-500/5",
                            "group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-400"
                          )}>
                            {teacher?.name?.substring(0, 1) || 'ع'}
                          </div>
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex items-center flex-wrap gap-2 mb-1">
                              <h5 className="text-base font-black truncate group-hover:text-blue-200 transition-colors uppercase">
                                {teacher?.name || 'معلم مجهول'}
                              </h5>
                              {ev.aiAnalysis && (
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400" title="تم التحليل بالذكاء الاصطناعي">
                                  <BrainCircuit size={12} />
                                  <span className="text-[9px] font-black uppercase tracking-wider">AI ANALYZED</span>
                                </div>
                              )}
                              <span className={cn(
                                "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase",
                                ev.status === 'approved' ? "bg-blue-500/10 text-blue-400" : 
                                ev.status === 'submitted' ? "bg-emerald-500/10 text-emerald-400" :
                                "bg-amber-500/10 text-amber-400"
                              )}>
                                {ev.status === 'approved' ? 'مكتمل' : ev.status === 'submitted' ? 'بانتظار الاعتماد' : 'مسودة'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-y-1 gap-x-3">
                              <div className="flex items-center gap-1.5 text-white/40">
                                <BookOpen size={12} />
                                <span className="text-xs">{teacher?.subject || 'مادة غير محددة'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-white/40">
                                <School size={12} />
                                <span className="text-xs">{STAGES.find(s => s.value === teacher?.stage)?.label || 'مرحلة غير محددة'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-white/30">
                                <Calendar size={12} />
                                <span className="text-[10px] font-sans">
                                  {ev.createdAt ? (ev.createdAt.toDate ? ev.createdAt.toDate().toLocaleDateString('ar-SA') : new Date(ev.createdAt).toLocaleDateString('ar-SA')) : '---'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-0 border-white/5">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTeacher(teachers.find(t => t.id === ev.teacherId) || null);
                                setActiveStep('history');
                              }}
                              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/40 hover:text-blue-400 transition-all active:scale-90"
                              title="سجل المعلم"
                            >
                              <BookOpen size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvaluation(ev);
                                setTimeout(() => {
                                  window.print();
                                }, 100);
                              }}
                              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/40 hover:text-blue-400 transition-all active:scale-90 hidden sm:flex"
                              title="طباعة التقرير"
                            >
                              <Printer size={16} />
                            </button>
                            
                            {(profile?.role === UserRole.ADMIN || profile?.role === UserRole.SUPERVISION_DIRECTOR || profile?.uid === ev.evaluatorId) && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEvaluation(ev.id, teacher?.name || 'غير معروف');
                                }}
                                disabled={deletingId === ev.id}
                                className={cn(
                                  "p-2 rounded-xl border transition-all active:scale-90",
                                  deletingId === ev.id 
                                    ? "bg-red-500/50 border-red-500/50 text-white cursor-not-allowed" 
                                    : "bg-red-500/10 border-red-500/20 hover:bg-red-500 text-red-400 hover:text-white"
                                )}
                                title="حذف التقييم"
                              >
                                {deletingId === ev.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-xl border border-white/5 min-w-[100px]">
                            <div className="text-left">
                              <div className={cn("text-xl font-black leading-none", getGradeColor(normalizedScore))}>
                                %{normalizedScore.toFixed(0)}
                              </div>
                              <div className="text-[9px] text-white/20 font-black uppercase tracking-tighter mt-0.5 whitespace-nowrap">
                                {getGradeLabel(normalizedScore)}
                              </div>
                            </div>
                            <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />
                            <div className="hidden sm:block text-center">
                               <div className="text-xs font-bold text-white/40">{ev.totalScore}</div>
                               <div className="text-[8px] text-white/20">نقطة</div>
                            </div>
                          </div>
                          <ChevronLeft size={16} className="text-white/10 group-hover:text-blue-400 group-hover:translate-x-[-2px] transition-all" />
                        </div>
                      </div>
                    </motion.div>
                  );
                });
              })()}
            </div>
          </div>
        </motion.div>
      )}

        {activeStep === 'create' && (
          <motion.div 
            key="create"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="print:hidden"
          >
            <div className="space-y-6 pb-24 md:pb-6">
            <div className="flex items-center gap-4">
              <button onClick={() => {
                if (isEditing) {
                  setActiveStep('view');
                  setIsEditing(false);
                } else {
                  setActiveStep('list');
                }
              }} className="rounded-xl border border-white/10 bg-white/5 p-2.5 hover:bg-white/10 transition-colors">
                <ArrowRight size={22} />
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold leading-tight">
                  {isEditing ? 'تعديل التقييم الحالي' : 'إصدار تقييم جديد'}
                </h1>
                {selectedTeacher && <p className="text-[10px] md:text-xs text-white/40">تعبئة استمارة التقييم للمعلم</p>}
              </div>
            </div>

            {!selectedTeacher ? (
              <div className="space-y-4">
                <h3 className="text-base md:text-lg font-medium">اختر المعلم المراد تقييمه</h3>
                <div className="flex flex-col gap-3 md:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                    <input 
                      type="text"
                      placeholder="بحث عن معلم..."
                      className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pr-12 outline-none focus:border-blue-500/50 text-right text-sm md:text-base transition-all font-sans"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="relative w-full md:w-64">
                    <select 
                      className="w-full h-full rounded-2xl border border-white/10 bg-white/10 py-4 px-6 outline-none focus:border-blue-500/50 appearance-none text-right text-sm md:text-base cursor-pointer"
                      value={selectedStageFilter}
                      onChange={e => setSelectedStageFilter(e.target.value)}
                    >
                      <option value="all" className="bg-[#0f172a]">جميع المراحل</option>
                      {STAGES.map(s => (
                        <option key={s.value} value={s.value} className="bg-[#0f172a]">{s.label}</option>
                      ))}
                    </select>
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={16} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {teachers
                    .filter(t => {
                      const matchesSearch = t.name.includes(searchQuery);
                      const matchesStage = selectedStageFilter === 'all' || t.stage === selectedStageFilter;
                      return matchesSearch && matchesStage;
                    })
                    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
                    .map((t, i) => (
                      <motion.div
                        key={t.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <GlassCard 
                          className="group cursor-pointer border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition-all p-4 md:p-5"
                          onClick={() => setSelectedTeacher(t)}
                        >
                        <div className="flex items-center justify-between w-full gap-3">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/10 group-hover:bg-blue-500 group-hover:text-white transition-all">
                              <UserSquare2 size={24} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm md:text-base truncate group-hover:text-blue-300 transition-colors">{t.name}</h4>
                              <p className="text-[10px] md:text-xs text-white/40 truncate">{t.subject} • {STAGES.find(s => s.value === t.stage)?.label}</p>
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <GlassCard className="flex items-center justify-between border-blue-500/20 bg-blue-500/10 p-5 md:p-6" hover={false}>
                  <div className="min-w-0">
                    <p className="text-[10px] md:text-xs text-blue-300 font-bold mb-1">المعلم المختار:</p>
                    <h3 className="text-base md:text-xl font-bold truncate">{selectedTeacher.name}</h3>
                    <p className="text-xs text-white/40 truncate">{selectedTeacher.subject} | {STAGES.find(s => s.value === selectedTeacher.stage)?.label}</p>
                    {selectedTeacher.defaultEvaluatorId && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                        <ShieldCheck size={12} />
                        <span>سيتم إسناد التقييم لـ: {users.find(u => u.uid === selectedTeacher.defaultEvaluatorId)?.name || 'مقيم افتراضي'}</span>
                      </div>
                    )}
                  </div>
                  <GlassButton onClick={() => setSelectedTeacher(null)} className="text-xs md:text-sm bg-white/5 border border-white/10 px-4 py-2 hover:bg-white/10 shrink-0 mr-4 shadow-none from-transparent to-transparent">تغيير</GlassButton>
                </GlassCard>

                <div className="space-y-4">
                  {currentCriteria.map((criterion: any, idx: number) => (
                    <GlassCard key={criterion.id} className="p-0 overflow-hidden border-white/10" hover={false}>
                      <div className="p-5 md:p-6">
                        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <h4 className="font-bold text-sm md:text-base leading-snug">{idx + 1}. {criterion.label}</h4>
                          <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10 self-start sm:self-auto group transition-all focus-within:border-blue-500/50">
                             <span className="text-[10px] text-white/40">الدرجة:</span>
                             <input 
                               type="number"
                               min={0}
                               max={criterion.maxScore}
                               value={scores[criterion.id] ?? 0}
                               onChange={(e) => {
                                 const val = parseInt(e.target.value);
                                 if (isNaN(val)) {
                                   setScores({ ...scores, [criterion.id]: 0 });
                                   return;
                                 }
                                 // Real-time validation: clamp value
                                 const clampedVal = Math.max(0, Math.min(val, criterion.maxScore));
                                 setScores({ ...scores, [criterion.id]: clampedVal });
                               }}
                               className="w-10 bg-transparent text-lg md:text-xl font-black text-blue-400 text-center outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                             />
                             <span className="text-[10px] text-white/20">/ {criterion.maxScore}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: (criterion.maxScore || 5) + 1 }, (_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setScores({ ...scores, [criterion.id]: i })}
                              className={cn(
                                "flex-1 min-w-[40px] h-11 rounded-xl text-[13px] font-black transition-all border",
                                (scores[criterion.id] || 0) === i 
                                  ? "bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-900/40 scale-105" 
                                  : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white/70"
                              )}
                            >
                              {i}
                            </button>
                          ))}
                        </div>
                        <div className="mt-6">
                          <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 border border-white/5 focus-within:border-blue-500/30 transition-colors">
                            <MessageSquare size={16} className="text-white/20 shrink-0" />
                            <input 
                              type="text" 
                              placeholder="إضافة ملاحظات اختيارية للمعيار..."
                              className="w-full bg-transparent text-xs md:text-sm outline-none placeholder:text-white/10 font-sans"
                              value={notes[criterion.id] || ''}
                              onChange={e => setNotes({ ...notes, [criterion.id]: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>

                <GlassCard className="p-6 border-white/10" hover={false}>
                  <div className="flex items-center gap-2 mb-4 text-blue-400">
                    <MessageSquare size={18} />
                    <h4 className="font-bold text-sm md:text-base">ملاحظات ختامية وتوصيات عامة</h4>
                  </div>
                  <textarea 
                    rows={4}
                    placeholder="اكتب أي ملاحظات إضافية أو توصيات عامة للمعلم هنا..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-sm outline-none focus:border-blue-500/50 transition-all resize-none placeholder:text-white/10 font-sans"
                    value={generalNotes}
                    onChange={e => setGeneralNotes(e.target.value)}
                  />
                </GlassCard>

                <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto z-50 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-t-3xl md:rounded-3xl border-t border-white/20 bg-[#0f172a]/90 md:bg-white/10 p-5 md:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] md:shadow-2xl backdrop-blur-2xl">
                   <div className="text-center sm:text-right w-full sm:w-auto">
                     <p className="text-[10px] md:text-xs text-white/40 mb-1">النتيجة الإجمالية حالياً</p>
                     <h2 className={cn("text-3xl md:text-4xl font-black leading-none", getGradeColor((calculateTotalScore() / maxPossibleScore) * 100))}>
                       {calculateTotalScore()} <span className="text-sm md:text-lg font-bold text-white/20 mr-1">/ {maxPossibleScore}</span>
                     </h2>
                   </div>
                   <div className="flex gap-3 w-full sm:w-auto">
                     <GlassButton onClick={() => handleSaveEvaluation('draft')} className="flex-1 sm:flex-none text-xs md:text-sm bg-white/5 border border-white/10 hover:bg-white/10 py-3.5 px-6 shadow-none from-transparent to-transparent">
                       حفظ مسودة
                     </GlassButton>
                     <GlassButton onClick={() => handleSaveEvaluation('submitted')} className="flex-1 sm:flex-none text-xs md:text-sm bg-blue-600 hover:bg-blue-500 py-3.5 px-8 font-black">
                       اعتماد نهائي
                     </GlassButton>
                    </div>
                  </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

        {activeStep === 'history' && selectedTeacher && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <div className="space-y-6 pb-20">
              <div className="flex items-center gap-4">
                <button onClick={() => setActiveStep('list')} className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10">
                  <ArrowRight size={20} />
                </button>
                <h1 className="text-xl md:text-2xl font-bold">سجل تقييمات المعلم</h1>
              </div>

              {(() => {
                const teacherEvals = evaluations
                  .filter(e => e.teacherId === selectedTeacher.id)
                  .sort((a, b) => {
                    const timeA = a.createdAt?.toMillis() || 0;
                    const timeB = b.createdAt?.toMillis() || 0;
                    return timeB - timeA;
                  });
                
                const approvedEvals = teacherEvals.filter(e => e.status === 'approved' || e.status === 'submitted');
                const avgRaw = approvedEvals.length > 0
                  ? approvedEvals.reduce((acc, curr) => acc + (curr.totalScore || 0), 0) / approvedEvals.length
                  : 0;
                const normalizedAvg = (avgRaw / maxPossibleScore) * 100;
                
                const lastEvalDate = teacherEvals.length > 0 && teacherEvals[0].createdAt
                  ? teacherEvals[0].createdAt.toDate().toLocaleDateString('ar-SA')
                  : 'لا يوجد';

                return (
                  <div className="space-y-6">
                    <GlassCard className="p-6 border-blue-500/20 bg-blue-500/5 transition-all" hover={false}>
                      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-5 text-right w-full md:w-auto">
                          <div className="h-20 w-20 rounded-3xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <UserSquare2 size={40} />
                          </div>
                          <div>
                            <h2 className="text-2xl font-bold">{selectedTeacher.name}</h2>
                            <p className="text-sm text-white/40">{selectedTeacher.subject} • {config?.schoolName || 'المدرسة الحالية'}</p>
                            <p className="text-xs text-white/20 mt-1">{STAGES.find(s => s.value === selectedTeacher.stage)?.label}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full md:w-auto">
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <p className="text-[10px] text-white/30 uppercase font-bold mb-1">إجمالي التقييمات</p>
                            <p className="text-xl font-black">{teacherEvals.length}</p>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <p className="text-[10px] text-white/30 uppercase font-bold mb-1">متوسط الأداء</p>
                            <div className="flex items-baseline gap-1">
                              <span className={cn("text-xl font-black", getGradeColor(normalizedAvg))}>{normalizedAvg.toFixed(1)}%</span>
                              <span className={cn("text-[8px] font-bold", getGradeColor(normalizedAvg))}>({getGradeLabel(normalizedAvg)})</span>
                            </div>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 col-span-2 sm:col-span-1">
                            <p className="text-[10px] text-white/30 uppercase font-bold mb-1">تاريخ آخر تقييم</p>
                            <p className="text-sm font-bold text-white/60">{lastEvalDate}</p>
                          </div>
                        </div>
                      </div>
                    </GlassCard>

                    <div className="space-y-4">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <ClipboardCheck size={20} className="text-blue-400" />
                        التسلسل الزمني للتقييمات
                      </h3>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {teacherEvals.map((ev, i) => {
                          const normalizedIdxScore = (ev.totalScore / maxPossibleScore) * 100;
                          return (
                            <motion.div
                              key={ev.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                              onClick={() => { setSelectedEvaluation(ev); setActiveStep('view'); }}
                              className="bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-12 h-12 rounded-xl flex items-center justify-center font-bold border transition-colors",
                                  ev.status === 'approved' ? "bg-blue-500/10 text-blue-400 border-blue-500/10" : 
                                  ev.status === 'submitted' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/10" :
                                  "bg-amber-500/10 text-amber-400 border-amber-500/10"
                                )}>
                                  {ev.totalScore}
                                </div>
                                <div className="text-right">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-sm">{ev.academicYear} - {ev.semester}</h4>
                                    <span className={cn(
                                      "text-[8px] px-2 py-0.5 rounded-full font-bold",
                                      ev.status === 'approved' ? "bg-blue-500/10 text-blue-400" : 
                                      ev.status === 'submitted' ? "bg-emerald-500/10 text-emerald-400" :
                                      "bg-amber-500/10 text-amber-400"
                                    )}>
                                      {ev.status === 'approved' ? 'مكتمل' : ev.status === 'submitted' ? 'بانتظار الاعتماد' : 'مسودة'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-white/40 mt-1">
                                    المقيم: {ev.evaluatorName} • {ev.createdAt?.toDate().toLocaleDateString('ar-SA')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-left hidden sm:block">
                                  <p className={cn("text-sm font-bold", getGradeColor(normalizedIdxScore))}>
                                    {getGradeLabel(normalizedIdxScore)}
                                  </p>
                                  <p className="text-[9px] text-white/20 uppercase font-black tracking-tighter">PERFORMANCE</p>
                                </div>
                                <ChevronLeft size={18} className="text-white/10 group-hover:text-blue-400 transition-colors" />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}

        {activeStep === 'view' && selectedEvaluation && (
          <motion.div 
            key="view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="print:hidden"
          >
            <div className="space-y-6 pb-12 md:pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button onClick={() => setActiveStep('list')} className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10">
                  <ArrowRight size={20} />
                </button>
                <h1 className="text-xl md:text-2xl font-bold">تفاصيل التقييم</h1>
              </div>
              <div className="flex flex-wrap gap-2 md:gap-3">
                 {(profile?.role === UserRole.SUPERVISION_DIRECTOR || profile?.role === UserRole.ADMIN) && (
                   <GlassButton
                    onClick={() => {
                      const teacher = teachers.find(t => t.id === selectedEvaluation.teacherId);
                      if (teacher) {
                        setSelectedTeacher(teacher);
                        setScores(selectedEvaluation.scores);
                        setNotes(selectedEvaluation.notes);
                        setGeneralNotes(selectedEvaluation.generalNotes || '');
                        setIsEditing(true);
                        setActiveStep('create');
                      }
                    }}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600/50 hover:bg-blue-600 text-xs md:text-sm py-2 px-4 shadow-lg shadow-blue-900/20"
                   >
                     <Save size={16} />
                     تعديل الدرجات
                   </GlassButton>
                 )}
                 {(profile?.role === UserRole.SUPERVISION_DIRECTOR || profile?.role === UserRole.ADMIN) && selectedEvaluation.status === 'submitted' && (
                    <GlassButton 
                      onClick={() => handleApproveEvaluation(selectedEvaluation.id)} 
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-xs md:text-sm py-2 px-4 shadow-lg shadow-emerald-900/20"
                    >
                      <ShieldCheck size={16} />
                      اعتماد نهائي
                    </GlassButton>
                 )}
                 {selectedEvaluation.status === 'submitted' && profile?.uid === selectedEvaluation.evaluatorId && (
                    <GlassButton 
                      onClick={() => handleRecallEvaluation(selectedEvaluation.id)} 
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-xs md:text-sm py-2 px-4 shadow-lg shadow-amber-900/20"
                    >
                      <Undo2 size={16} />
                      سحب التقييم (مسودة)
                    </GlassButton>
                 )}
                  {(profile?.role === UserRole.ADMIN || profile?.role === UserRole.SUPERVISION_DIRECTOR || profile?.uid === selectedEvaluation.evaluatorId) && (
                   <GlassButton 
                     onClick={() => handleDeleteEvaluation(selectedEvaluation.id, teachers.find(t => t.id === selectedEvaluation.teacherId)?.name || 'غير معروف')} 
                     disabled={deletingId === selectedEvaluation.id}
                     className={cn(
                       "flex-1 md:flex-none flex items-center justify-center gap-2 text-xs md:text-sm py-2 px-4 shadow-lg shadow-red-900/20 transition-all font-bold",
                       deletingId === selectedEvaluation.id
                         ? "bg-red-900/50 border border-red-500/50 text-white/50 cursor-not-allowed"
                         : "bg-red-600/20 border border-red-500/30 hover:bg-red-600 text-red-400 hover:text-white"
                     )}
                   >
                     {deletingId === selectedEvaluation.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                     {deletingId === selectedEvaluation.id ? 'جاري الحذف...' : 'حذف التقييم'}
                   </GlassButton>
                 )}
                 {(profile?.role === UserRole.ADMIN || 
                    profile?.role === UserRole.SUPERVISION_DIRECTOR || 
                    profile?.role === UserRole.SCHOOL_DIRECTOR || 
                    profile?.role === UserRole.SCHOOL_VICE_PRINCIPAL || 
                    profile?.role === UserRole.SUPERVISOR) && (
                   <>
                     <GlassButton 
                      onClick={() => handleAiAnalysis(selectedEvaluation)} 
                      disabled={isAnalyzing} 
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-purple-600/80 border border-purple-500/30 hover:bg-purple-500 text-xs md:text-sm py-2 px-4 shadow-lg shadow-purple-900/20"
                     >
                       <BrainCircuit size={16} className={cn(isAnalyzing && "animate-spin")} />
                       {selectedEvaluation.aiAnalysis ? 'تحديث التحليل الذكي' : 'بدء التحليل الذكي'}
                     </GlassButton>
                     <GlassButton 
                       onClick={() => {
                         window.focus();
                         setTimeout(() => {
                           window.print();
                         }, 100);
                       }} 
                       className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs md:text-sm py-2 px-6 shadow-lg shadow-rose-900/20 active:scale-95 cursor-pointer pointer-events-auto"
                     >
                       <Printer size={16} />
                       طباعة التقرير (PDF)
                     </GlassButton>
                   </>
                 )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
               <div className="lg:col-span-2 space-y-6">
                 <GlassCard hover={false} className="p-4 md:p-6">
                   <h3 className="mb-4 md:mb-6 font-bold flex items-center gap-2 text-blue-400">
                     <ClipboardCheck size={20} />
                     تفاصيل درجات المعايير
                   </h3>
                   <div className="space-y-3 md:space-y-4">
                     {currentCriteria.map((c: any) => (
                       <div key={c.id} className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 md:p-4 transition-colors hover:bg-white/10 border border-white/5">
                         <div className="flex items-center justify-between gap-2">
                           <div className="flex flex-col gap-1">
                             <span className="font-bold text-xs md:text-sm">{c.label}</span>
                           </div>
                           <div className="flex items-center gap-2 shrink-0">
                             <div className="flex flex-col items-end">
                               <div className="flex items-center gap-1">
                                 <span className="text-lg md:text-xl font-black text-blue-400">{selectedEvaluation.scores[c.id] || 0}</span>
                                 <span className="text-[10px] md:text-xs text-white/20">/ {c.maxScore}</span>
                               </div>
                               <span className={cn(
                                 "text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                                 getGradeColor(((selectedEvaluation.scores[c.id] || 0) / (c.maxScore || 10)) * 100).replace('text-', 'bg-').split(' ')[0],
                                 "text-white/90"
                               )}>
                                 {getGradeLabel(((selectedEvaluation.scores[c.id] || 0) / (c.maxScore || 10)) * 100)}
                               </span>
                             </div>
                           </div>
                         </div>
                         <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${((selectedEvaluation.scores[c.id] || 0) / (c.maxScore || 10)) * 100}%` }}
                             className={cn(
                               "h-full rounded-full transition-all",
                               ((selectedEvaluation.scores[c.id] || 0) / (c.maxScore || 10)) > 0.8 ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                               ((selectedEvaluation.scores[c.id] || 0) / (c.maxScore || 10)) > 0.5 ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" :
                               "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                             )}
                           />
                         </div>
                         {selectedEvaluation.notes[c.id] && (
                           <div className="mt-1 flex items-start gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
                             <MessageSquare size={12} className="text-white/20 mt-0.5" />
                             <p className="text-[10px] md:text-xs text-white/50 italic leading-relaxed font-sans">{selectedEvaluation.notes[c.id]}</p>
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 </GlassCard>

                 {selectedEvaluation.generalNotes && (
                   <GlassCard hover={false} className="p-4 md:p-6">
                     <h3 className="mb-4 font-bold flex items-center gap-2 text-blue-400">
                       <MessageSquare size={20} />
                       التوصيات العامة والملاحظات الختامية
                     </h3>
                     <div className="rounded-xl bg-white/5 p-4 border border-white/10 relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-1 h-full bg-blue-500/50" />
                       <p className="text-xs md:text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans">{selectedEvaluation.generalNotes}</p>
                     </div>
                   </GlassCard>
                  )}
                </div>

                <div className="space-y-6">
                 <GlassCard className="text-center p-6 md:p-8 border-white/10" hover={false}>
                   <div className="mb-4 flex flex-col items-center">
                     <div className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-3xl bg-blue-500/10 text-blue-400 mb-4 border border-blue-500/20 shadow-inner">
                       <UserSquare2 size={36} />
                     </div>
                     <h2 className="text-lg md:text-xl font-black truncate w-full text-white">{teachers.find(t => t.id === selectedEvaluation.teacherId)?.name}</h2>
                     
                     {/* Performance Sparkline */}
                     {(() => {
                       const history = evaluations
                         .filter(e => e.teacherId === selectedEvaluation.teacherId && (e.status === 'approved' || e.status === 'submitted'))
                         .sort((a, b) => {
                           const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
                           const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
                           return timeA - timeB;
                         });

                       if (history.length >= 2) {
                         const chartData = history.map(e => ({
                           score: Math.round((e.totalScore / maxPossibleScore) * 100)
                         }));

                         return (
                           <div className="mt-4 w-full bg-white/5 rounded-2xl p-3 border border-white/5">
                             <div className="flex items-center justify-between mb-2">
                               <p className="text-[8px] text-white/30 uppercase font-black tracking-widest">تطور الأداء</p>
                               <TrendingUp size={12} className="text-emerald-400" />
                             </div>
                             <div className="h-10 w-full">
                               <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={chartData}>
                                   <defs>
                                     <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                       <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                     </linearGradient>
                                   </defs>
                                   <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fill="url(#sparklineGradient)" isAnimationActive={false} />
                                 </AreaChart>
                               </ResponsiveContainer>
                             </div>
                           </div>
                         );
                       }
                       return null;
                     })()}
                     <p className="text-xs md:text-sm text-white/40 truncate w-full mt-1 mb-4">{teachers.find(t => t.id === selectedEvaluation.teacherId)?.subject}</p>
                     
                     <div className="flex flex-wrap justify-center gap-2 mb-2 w-full">
                        <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/60 font-bold whitespace-nowrap">
                          {STAGES.find(s => s.value === teachers.find(t => t.id === selectedEvaluation.teacherId)?.stage)?.label}
                        </span>
                        <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/60 font-bold whitespace-nowrap">
                          {selectedEvaluation.academicYear}
                        </span>
                     </div>
                   </div>

                   <div className="border-t border-white/10 pt-6 mt-6">
                     <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="text-right">
                          <p className="text-[9px] md:text-[10px] text-white/30 uppercase font-extrabold tracking-widest mb-1">درجة التقييم</p>
                          <h4 className={cn("text-3xl font-black", getGradeColor((selectedEvaluation.totalScore / maxPossibleScore) * 100))}>
                            {selectedEvaluation.totalScore}
                          </h4>
                          <span className={cn("inline-block mt-1 px-2 py-0.5 rounded text-[8px] font-black uppercase text-white/90", 
                            getGradeColor((selectedEvaluation.totalScore / maxPossibleScore) * 100).replace('text-', 'bg-').split(' ')[0]
                          )}>
                            {getGradeLabel((selectedEvaluation.totalScore / maxPossibleScore) * 100)}
                          </span>
                        </div>
                        <div className="text-right border-r border-white/10 pr-4">
                          <p className="text-[9px] md:text-[10px] text-white/30 uppercase font-extrabold tracking-widest mb-1">النسبة المئوية</p>
                          <h4 className="text-3xl font-black text-white">
                            {((selectedEvaluation.totalScore / maxPossibleScore) * 100).toFixed(0)}%
                          </h4>
                        </div>
                      </div>
                      
                     <div className={cn(
                       "flex items-center justify-center gap-2 rounded-2xl py-3 border shadow-inner transition-all",
                       selectedEvaluation.status === 'approved' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : 
                       selectedEvaluation.status === 'submitted' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                       "bg-amber-500/10 text-amber-400 border-amber-500/20"
                     )}>
                       {selectedEvaluation.status === 'approved' ? <ShieldCheck size={18} /> : <CheckCircle2 size={18} />}
                       <span className="text-xs md:text-sm font-black">{selectedEvaluation.status === 'approved' ? 'مـعـتـمـد نهائياً' : selectedEvaluation.status === 'submitted' ? 'مـعـتـمـد رقمياً' : 'مـسـودة حـالـيـة'}</span>
                     </div>
                   </div>
                   
                   <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                     <p className="text-[9px] text-white/20 font-bold mb-2">معلومات المقيم:</p>
                     <div className="flex items-center gap-2 text-right">
                       <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/40">
                         <UserSquare2 size={16} />
                       </div>
                       <div className="min-w-0">
                         <p className="text-[11px] font-bold truncate">{selectedEvaluation.evaluatorName}</p>
                         <p className="text-[9px] text-white/30 truncate">{selectedEvaluation.evaluatorRole}</p>
                       </div>
                     </div>
                   </div>
                 </GlassCard>

                 <AnimatePresence mode="wait">
                    {selectedEvaluation.aiAnalysis && (
                      <motion.div
                        key="analysis-content"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <GlassCard className="border-purple-500/30 bg-purple-500/10 p-4 md:p-6" hover={false}>
                          <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-bold flex items-center gap-2 text-purple-400 text-sm md:text-base">
                              <BrainCircuit size={18} />
                              التحليل الذكي (AI)
                            </h3>
                          </div>
                          <div className="max-h-[350px] overflow-y-auto text-xs md:text-sm leading-relaxed text-white/80 font-sans custom-scrollbar">
                            <div className="prose prose-invert prose-xs md:prose-sm max-w-none">
                              <ReactMarkdown>{selectedEvaluation.aiAnalysis}</ReactMarkdown>
                            </div>
                          </div>
                        </GlassCard>
                      </motion.div>
                     )}
                   </AnimatePresence>
                </div>
              </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

      <div className="hidden print:block">
        {selectedEvaluation && (
          <PrintEvaluation 
            evaluation={selectedEvaluation} 
            teacher={teachers.find(t => t.id === selectedEvaluation.teacherId)}
            config={config}
          />
        )}
      </div>
    </div>
  );
};

export default EvaluationsPage;
