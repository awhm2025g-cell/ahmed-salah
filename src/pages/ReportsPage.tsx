/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { FileDown, FileSpreadsheet, Printer, Filter, ChevronDown, BarChart3, Users, ClipboardList, School, Sliders, Calendar, Eye, EyeOff, PieChart as PieChartIcon } from 'lucide-react';
import { Teacher, Evaluation } from '../types';
import { getGradeLabel, STAGES, getGradeColor, EVALUATION_CRITERIA, ROLES } from '../constants';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { analyzeOverallPerformance } from '../lib/gemini';
import { BrainCircuit, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';

export const ReportsPage: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [evaluatorNameFilter, setEvaluatorNameFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const [activeTab, setActiveTab] = useState<'stages' | 'grades' | 'timeline' | 'teachers' | 'stage-trends' | 'criteria' | 'comparison'>('stages');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const currentCriteria = config?.criteria || EVALUATION_CRITERIA;
  const maxPossibleScore = currentCriteria.reduce((sum: number, c: any) => sum + (c.maxScore || 10), 0);

  // Cache key based on data signature
  const getCacheKey = (teachers: any[], evals: any[]) => {
    const lastEval = evals.length > 0 ? Math.max(...evals.map(e => e.createdAt?.seconds || 0)) : 0;
    return `ai_report_${teachers.length}_${evals.length}_${lastEval}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tSnap = await getDocs(collection(db, 'teachers'));
        const eSnap = await getDocs(collection(db, 'evaluations'));
        const cSnap = await getDoc(doc(db, 'config', 'app'));
        
        const fetchedTeachers = tSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as Teacher));
        const fetchedEvals = eSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as Evaluation));

        setTeachers(fetchedTeachers);
        setEvaluations(fetchedEvals);
        if (cSnap.exists()) setConfig(cSnap.data());

        // Check for cached AI report
        const cacheKey = getCacheKey(fetchedTeachers, fetchedEvals);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setAiReport(cached);
        }
      } catch (e) {
        console.error('Error fetching data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const report = await analyzeOverallPerformance(teachers, evaluations, config?.aiReportPrompt);
      setAiReport(report);
      const cacheKey = getCacheKey(teachers, evaluations);
      localStorage.setItem(cacheKey, report);
    } catch (e: any) {
      console.error(e);
      setAiReport(`عذراً، حدث خطأ أثناء التحليل: ${e.message || 'يرجى المحاولة لاحقاً'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportToExcel = () => {
    const data = filteredEvaluations.map(ev => {
      const teacher = teachers.find(t => t.id === ev.teacherId);
      const normalizedScore = (ev.totalScore / maxPossibleScore) * 100;
      return {
        'اسم المعلم': teacher?.name,
        'المادة': teacher?.subject,
        'المرحلة': STAGES.find(s => s.value === teacher?.stage)?.label,
        'الدرجة الكلية': ev.totalScore,
        'النسبة المئوية': `${normalizedScore.toFixed(1)}%`,
        'التقدير': getGradeLabel(normalizedScore),
        'تاريخ التقييم': new Date(ev.createdAt?.seconds * 1000).toLocaleDateString('ar-SA'),
        'المقيم': ev.evaluatorName,
        'دور المقيم': ROLES.find(r => r.value === ev.evaluatorRole)?.label || ev.evaluatorRole,
        'الحالة': ev.status === 'approved' ? 'معتمد' : ev.status === 'submitted' ? 'بانتظار الاعتماد' : 'مسودة'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "التقييمات");
    XLSX.writeFile(workbook, "تقرير_الأداء.xlsx");
  };

  const filteredEvaluations = evaluations.filter(ev => {
    const evDate = ev.createdAt?.seconds ? new Date(ev.createdAt.seconds * 1000) : null;
    const matchesStage = selectedStage === 'all' || teachers.find(t => t.id === ev.teacherId)?.stage === selectedStage;
    const matchesRole = selectedRole === 'all' || ev.evaluatorRole === selectedRole;
    const matchesStatus = selectedStatus === 'all' || ev.status === selectedStatus;
    const matchesEvaluator = !evaluatorNameFilter || (ev.evaluatorName && ev.evaluatorName.toLowerCase().includes(evaluatorNameFilter.toLowerCase()));
    const matchesStart = !startDate || (evDate && evDate >= new Date(startDate));
    const matchesEnd = !endDate || (evDate && evDate <= new Date(endDate));
    return matchesStage && matchesRole && matchesStatus && matchesEvaluator && matchesStart && matchesEnd;
  });

  const filteredTeachers = teachers.filter(t => {
    const matchesStage = selectedStage === 'all' || t.stage === selectedStage;
    if (!matchesStage) return false;
    
    // If no specific filters (other than stage) are active, show all teachers of that stage
    if (selectedRole === 'all' && selectedStatus === 'all' && !startDate && !endDate) return true;
    
    // Otherwise, only show teachers who have evaluations matching the current filters
    return filteredEvaluations.some(e => e.teacherId === t.id);
  });

  // Data for Charts
  const gradeDistributionData = [
    { name: 'ممتاز', value: filteredEvaluations.filter(e => (e.totalScore / maxPossibleScore) * 100 >= 90).length, color: '#10b981' },
    { name: 'جيد جداً', value: filteredEvaluations.filter(e => {
        const score = (e.totalScore / maxPossibleScore) * 100;
        return score >= 80 && score < 90;
      }).length, color: '#3b82f6' },
    { name: 'جيد', value: filteredEvaluations.filter(e => {
        const score = (e.totalScore / maxPossibleScore) * 100;
        return score >= 70 && score < 80;
      }).length, color: '#f59e0b' },
    { name: 'مقبول', value: filteredEvaluations.filter(e => {
        const score = (e.totalScore / maxPossibleScore) * 100;
        return score >= 60 && score < 70;
      }).length, color: '#f97316' },
    { name: 'ضعيف', value: filteredEvaluations.filter(e => (e.totalScore / maxPossibleScore) * 100 < 60).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const stagePerformanceData = STAGES.map(stage => {
    const stageEvals = filteredEvaluations.filter(e => teachers.find(t => t.id === e.teacherId)?.stage === stage.value);
    const avg = stageEvals.length > 0 
      ? (stageEvals.reduce((acc, curr) => acc + curr.totalScore, 0) / stageEvals.length / maxPossibleScore) * 100
      : 0;
    return {
      name: stage.label,
      score: Math.round(avg)
    };
  });

  const timelineData = [...filteredEvaluations]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .reduce((acc: any[], curr) => {
      const date = new Date(curr.createdAt.seconds * 1000).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' });
      const existing = acc.find(d => d.date === date);
      if (existing) {
        existing.total += curr.totalScore;
        existing.count += 1;
        existing.avg = Math.round((existing.total / existing.count / maxPossibleScore) * 100);
      } else {
        acc.push({ 
          date, 
          total: curr.totalScore, 
          count: 1, 
          avg: Math.round((curr.totalScore / maxPossibleScore) * 100) 
        });
      }
      return acc;
    }, []);

  const stageTrendsData = [...filteredEvaluations]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .reduce((acc: any[], curr) => {
      const date = new Date(curr.createdAt.seconds * 1000).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' });
      const teacher = teachers.find(t => t.id === curr.teacherId);
      const stage = teacher?.stage;
      
      let existing = acc.find(d => d.date === date);
      if (!existing) {
        existing = { date };
        STAGES.forEach(s => {
          existing[`${s.value}_total`] = 0;
          existing[`${s.value}_count`] = 0;
          existing[s.value] = null; // Use null if no data for that period
        });
        acc.push(existing);
      }
      
      if (stage) {
        existing[`${stage}_total`] += curr.totalScore;
        existing[`${stage}_count`] += 1;
        existing[stage] = Math.round((existing[`${stage}_total`] / existing[`${stage}_count`] / maxPossibleScore) * 100);
      }
      
      return acc;
    }, []);

  const subjects = Array.from(new Set(teachers.map(t => t.subject))).filter(Boolean).sort();
  
  const comparisonData = filteredTeachers
    .filter(t => selectedSubject === 'all' || t.subject === selectedSubject)
    .map(t => {
      const teacherEvals = evaluations.filter(e => e.teacherId === t.id && e.status === 'approved');
      const avg = teacherEvals.length > 0
        ? (teacherEvals.reduce((a, b) => a + b.totalScore, 0) / teacherEvals.length / maxPossibleScore) * 100
        : 0;
      return {
        id: t.id,
        name: t.name,
        subject: t.subject,
        score: Math.round(avg),
        evalCount: teacherEvals.length
      };
    })
    .filter(d => d.evalCount > 0 || d.score > 0) // Only show teachers with data
    .sort((a, b) => sortOrder === 'desc' ? b.score - a.score : a.score - b.score)
    .slice(0, 15); // Show top/bottom 15 for readability
  const criteriaAnalysisData = currentCriteria.map((criterion: any) => {
    const scores = filteredEvaluations
      .map(e => e.scores[criterion.id] || 0);
    
    const count = scores.length;
    const avg = count > 0 ? scores.reduce((a, b) => a + b, 0) / count : 0;
    const max = criterion.maxScore || 10;
    const percentage = (avg / max) * 100;

    // Distribution
    const distribution = {
      high: scores.filter(s => (s / max) * 100 >= 90).length,
      mid: scores.filter(s => {
        const p = (s / max) * 100;
        return p >= 70 && p < 90;
      }).length,
      low: scores.filter(s => (s / max) * 100 < 70).length
    };

    return {
      id: criterion.id,
      name: criterion.label,
      avg: parseFloat(avg.toFixed(1)),
      percentage: Math.round(percentage),
      max,
      count,
      distribution
    };
  });

  return (
    <>
      <div className={cn("space-y-6 text-right pb-10 print:hidden", showPrintPreview && "hidden")} dir="rtl">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-2xl md:text-3xl font-bold">التقارير الذكية</h1>
          <p className="text-xs md:text-sm text-white/40">نماذج وتقارير مجمعة لأداء الهيئة التعليمية</p>
        </motion.div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <GlassCard className="flex items-center gap-3 py-2 md:py-3 px-4 shrink-0" hover={false}>
            <Filter size={18} className="text-blue-400" />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] md:text-sm font-medium">المرحلة:</span>
                <select 
                  className="bg-transparent text-xs md:text-sm outline-none cursor-pointer"
                  value={selectedStage}
                  onChange={e => setSelectedStage(e.target.value)}
                >
                  <option value="all" className="bg-[#1e293b]">جميع المراحل</option>
                  {STAGES.map(s => <option key={s.value} value={s.value} className="bg-[#1e293b]">{s.label}</option>)}
                </select>
              </div>
              <div className="w-px h-4 bg-white/10 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] md:text-sm font-medium">دور المقيم:</span>
                <select 
                  className="bg-transparent text-xs md:text-sm outline-none cursor-pointer"
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                >
                  <option value="all" className="bg-[#1e293b]">جميع الأدوار</option>
                  {ROLES.map(r => <option key={r.value} value={r.value} className="bg-[#1e293b]">{r.label}</option>)}
                </select>
              </div>
              <div className="w-px h-4 bg-white/10 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] md:text-sm font-medium">الحالة:</span>
                <select 
                  className="bg-transparent text-xs md:text-sm outline-none cursor-pointer"
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                >
                  <option value="all" className="bg-[#1e293b]">جميع الحالات</option>
                  <option value="approved" className="bg-[#1e293b]">مكتمل (معتمد)</option>
                  <option value="submitted" className="bg-[#1e293b]">بانتظار الاعتماد</option>
                  <option value="draft" className="bg-[#1e293b]">مسودة</option>
                </select>
              </div>
              <div className="w-px h-4 bg-white/10 hidden md:block" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] md:text-sm font-medium">اسم المقيم:</span>
                <input
                  type="text"
                  placeholder="بحث باسم المقيم..."
                  className="bg-transparent text-xs md:text-sm outline-none border-none placeholder:text-white/20 w-32"
                  value={evaluatorNameFilter}
                  onChange={e => setEvaluatorNameFilter(e.target.value)}
                />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="flex items-center gap-3 py-2 md:py-3 px-4 shrink-0" hover={false}>
            <Calendar size={18} className="text-blue-400" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] md:text-xs text-white/40">من:</span>
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent text-[10px] md:text-xs outline-none font-sans"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] md:text-xs text-white/40">إلى:</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent text-[10px] md:text-xs outline-none font-sans"
              />
            </div>
          </GlassCard>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <GlassButton 
              onClick={runAiAnalysis} 
              disabled={isAnalyzing}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-purple-600/50 hover:bg-purple-600 disabled:opacity-50 text-[10px] md:text-sm py-2 px-3"
            >
               {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
               {isAnalyzing ? "جاري التحليل..." : "تحليل AI"}
            </GlassButton>

            <div className="relative group/print-config flex-1 md:flex-none">
              <GlassButton 
                onClick={() => setShowPrintPreview(!showPrintPreview)} 
                className={cn(
                  "w-full flex items-center justify-center gap-2 text-[10px] md:text-sm py-2 px-3",
                  showPrintPreview ? "bg-amber-600 hover:bg-amber-500" : "bg-blue-600/50 hover:bg-blue-600"
                )}
              >
                 {showPrintPreview ? <EyeOff size={18} /> : <Eye size={18} />}
                 {showPrintPreview ? "إغلاق المعاينة" : "تنسيق ومعاينة"}
              </GlassButton>
              
              {!showPrintPreview && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-[#1e293b]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 z-[50] opacity-0 translate-y-2 invisible group-hover/print-config:opacity-100 group-hover/print-config:translate-y-0 group-hover/print-config:visible transition-all pointer-events-auto">
                  <h4 className="text-xs font-bold mb-3 flex items-center gap-2 border-b border-white/5 pb-2">
                    <Sliders size={14} className="text-blue-400" />
                    خلفية تصدير PDF
                  </h4>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-white/40">الهوامش (مم)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          type="number" 
                          value={config?.marginTop || 15} 
                          onChange={e => setConfig({...config, marginTop: Number(e.target.value)})}
                          className="bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-xs outline-none"
                          placeholder="أعلى"
                        />
                        <input 
                          type="number" 
                          value={config?.marginBottom || 15} 
                          onChange={e => setConfig({...config, marginBottom: Number(e.target.value)})}
                          className="bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-xs outline-none"
                          placeholder="أسفل"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-white/40">حجم الخط</label>
                      <input 
                        type="number" 
                        value={config?.reportFontSize || 10} 
                        onChange={e => setConfig({...config, reportFontSize: Number(e.target.value)})}
                        className="w-16 bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-xs text-center outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-white/40">عنوان التقرير</label>
                      <input 
                        type="text" 
                        value={config?.reportTitle || ''} 
                        onChange={e => setConfig({...config, reportTitle: e.target.value})}
                        className="w-full bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-xs outline-none"
                        placeholder="أدخل العنوان..."
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-white/40">نص الترويسة (يمين)</label>
                      <textarea 
                        value={config?.headerRight || ''} 
                        onChange={e => setConfig({...config, headerRight: e.target.value})}
                        className="w-full h-12 bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-xs outline-none resize-none"
                        placeholder="المملكة العربية السعودية..."
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-white/40">نص التذييل</label>
                      <input 
                        type="text" 
                        value={config?.footerText || ''} 
                        onChange={e => setConfig({...config, footerText: e.target.value})}
                        className="w-full bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-xs outline-none"
                        placeholder="تم استخراج هذا التقرير..."
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-white/40">اتجاه الصفحة</label>
                      <select 
                        value={config?.orientation || 'portrait'} 
                        onChange={e => setConfig({...config, orientation: e.target.value})}
                        className="bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-xs outline-none"
                      >
                        <option value="portrait" className="bg-slate-800">طولي</option>
                        <option value="landscape" className="bg-slate-800">عرضي</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-white/40">تضمين تحليل AI</label>
                      <button 
                        onClick={() => setConfig({...config, showAiInPrint: !config?.showAiInPrint})}
                        className={cn(
                          "px-2 py-1 rounded-lg text-[8px] font-bold transition-colors",
                          config?.showAiInPrint ? "bg-blue-500/20 text-blue-400" : "bg-white/5 text-white/40"
                        )}
                      >
                        {config?.showAiInPrint ? 'مفعل' : 'معطل'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <GlassButton onClick={exportToExcel} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-[10px] md:text-sm py-2 px-3 shadow-lg shadow-emerald-900/10">
               <FileSpreadsheet size={18} />
               تصدير Excel
            </GlassButton>
            <GlassButton 
              onClick={() => {
                const oldTitle = document.title;
                document.title = `تقرير_الأداء_${new Date().toLocaleDateString('ar-SA').replace(/\//g, '-')}`;
                window.focus();
                window.print();
                setTimeout(() => {
                  document.title = oldTitle;
                }, 1000);
              }} 
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-[10px] md:text-sm py-2 px-3 h-full shadow-lg shadow-rose-900/10 active:scale-95 cursor-pointer pointer-events-auto"
            >
               <Printer size={18} />
               تنزيل تقرير PDF
            </GlassButton>
          </div>
        </div>

        <AnimatePresence>
          {aiReport && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <GlassCard className="border-purple-500/30 bg-purple-500/5 backdrop-blur-2xl" hover={false}>
                <div className="mb-6 flex items-center justify-between border-b border-purple-500/20 pb-4">
                  <div className="flex items-center gap-3 text-purple-300">
                    <BrainCircuit size={24} />
                    <h2 className="text-xl font-bold">تحليل الذكاء الاصطناعي الاستراتيجي</h2>
                  </div>
                  <button 
                    onClick={() => setAiReport(null)}
                    className="rounded-lg p-2 hover:bg-white/5 text-white/40"
                  >
                    إغلاق
                  </button>
                </div>
                <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar font-sans">
                  <div className="prose prose-invert prose-blue max-w-none prose-p:text-blue-50/80 prose-headings:text-blue-100 prose-strong:text-blue-400 prose-ul:list-disc prose-li:text-blue-50/70 text-right" dir="rtl">
                    <ReactMarkdown>{aiReport}</ReactMarkdown>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabbed Interface */}
        <div className="mt-8 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="text-blue-400" size={20} />
              استكشاف البيانات
            </h2>
            <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
              {[
                { id: 'comparison', label: 'المقارنة', icon: BarChart3 },
                { id: 'stages', label: 'المراحل', icon: BarChart3 },
                { id: 'grades', label: 'التقديرات', icon: PieChartIcon },
                { id: 'timeline', label: 'الخط الزمني', icon: Calendar },
                { id: 'teachers', label: 'المعلمون', icon: Users },
                { id: 'criteria', label: 'المعايير', icon: Sliders },
                { id: 'stage-trends', label: 'الاتجاهات', icon: Sliders },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "relative flex items-center gap-2 px-3 md:px-5 py-2 rounded-xl text-[10px] md:text-sm font-bold transition-all",
                    activeTab === tab.id 
                      ? "text-white" 
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTabBackground"
                      className="absolute inset-0 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <tab.icon size={14} className={cn(activeTab === tab.id ? "text-white" : "text-white/40")} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-[450px]">
            <AnimatePresence mode="wait">
              {activeTab === 'comparison' && (
                <motion.div
                  key="comparison"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                      <span className="text-xs text-white/40">تصفية حسب المادة:</span>
                      <select 
                        value={selectedSubject} 
                        onChange={e => setSelectedSubject(e.target.value)}
                        className="bg-transparent text-xs outline-none cursor-pointer text-blue-400 font-bold"
                      >
                        <option value="all" className="bg-[#1e293b]">جميع المواد</option>
                        {subjects.map(s => <option key={s} value={s} className="bg-[#1e293b]">{s}</option>)}
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                      <span className="text-xs text-white/40">ترتيب حسب:</span>
                      <button 
                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                        className="text-xs flex items-center gap-2 text-blue-400 font-bold"
                      >
                        {sortOrder === 'desc' ? 'الأعلى أداءً' : 'الأقل أداءً'}
                        <ChevronDown size={14} className={cn("transition-transform", sortOrder === 'asc' && "rotate-180")} />
                      </button>
                    </div>
                  </div>

                  <GlassCard className="h-[500px] p-6" hover={false}>
                    <h3 className="mb-6 font-bold flex items-center gap-2 text-sm md:text-base">
                      <BarChart3 className="text-blue-400" size={20} />
                      مقارنة أداء المعلمين (متوسط النسبة المئوية)
                    </h3>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonData} layout="vertical" margin={{ right: 30, left: 100 }}>
                          <XAxis type="number" domain={[0, 100]} stroke="rgba(255,255,255,0.2)" fontSize={10} />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            stroke="rgba(255,255,255,0.6)" 
                            fontSize={11} 
                            width={120}
                            tickLine={false}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', textAlign: 'right' }}
                            formatter={(value: any, name: any, props: any) => [
                              <div className="flex flex-col gap-1 items-end" dir="rtl">
                                <span className="font-bold text-lg text-white">{value}%</span>
                                <span className="text-[10px] text-white/40">{props.payload.subject}</span>
                                <span className="text-[10px] text-blue-400">عدد التقييمات: {props.payload.evalCount}</span>
                              </div>,
                              ''
                            ]}
                            labelStyle={{ display: 'none' }}
                          />
                          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                            {comparisonData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={entry.score >= 90 ? '#10b981' : entry.score >= 80 ? '#3b82f6' : entry.score >= 70 ? '#f59e0b' : '#ef4444'} 
                                fillOpacity={0.8}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </GlassCard>
                </motion.div>
              )}
              {activeTab === 'stages' && (
                <motion.div
                  key="stages"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                <GlassCard className="lg:col-span-2 h-[350px] p-6" hover={false}>
                  <h3 className="mb-4 font-bold flex items-center gap-2 text-sm md:text-base">
                    <BarChart3 className="text-blue-400" size={20} />
                    متوسط الأداء حسب المرحلة (%)
                  </h3>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stagePerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} />
                        <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                          itemStyle={{ color: '#60a5fa' }}
                        />
                        <Bar dataKey="score" fill={config?.secondaryColor || "#3b82f6"} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                <div className="space-y-6">
                  <GlassCard className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 h-full flex flex-col justify-center" hover={false}>
                    <BarChart3 className="mb-4 text-white/50" size={32} />
                    <h3 className="mb-3 font-bold text-lg">تقرير القوى العاملة</h3>
                    <p className="text-sm text-white/60 leading-relaxed font-sans">
                      يظهر التحليل أن متوسط الأداء في مدارس الأوائل هو <span className="font-bold text-white text-xl">
                        {(filteredEvaluations.reduce((acc, curr) => acc + (curr.totalScore / maxPossibleScore) * 100, 0) / (filteredEvaluations.length || 1)).toFixed(0)}%
                      </span>. 
                      البيانات الموضحة أعلاه تعكس أداء الهيئة التعليمية خلال الفترة المختارة والمرحلة المحددة.
                    </p>
                  </GlassCard>
                </div>
              </motion.div>
            )}

            {activeTab === 'grades' && (
              <motion.div
                key="grades"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                <GlassCard hover={false} className="h-[400px] flex flex-col p-6 text-right">
                  <h3 className="mb-4 font-bold flex items-center gap-2 text-sm md:text-base">
                    <PieChartIcon className="text-purple-400" size={18} />
                    توزيع التقديرات المستحق
                  </h3>
                  
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={gradeDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {gradeDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '12px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Legend 
                          verticalAlign="bottom" 
                          height={40} 
                          iconType="circle" 
                          wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                <div className="grid grid-cols-2 gap-4">
                  {gradeDistributionData.map((item, idx) => (
                    <GlassCard key={idx} className="flex flex-col items-center justify-center p-4 border-white/5" hover={false}>
                      <span className="text-xs text-white/40 mb-1">{item.name}</span>
                      <span className="text-2xl font-black" style={{ color: item.color }}>{item.value}</span>
                      <span className="text-[10px] text-white/20">{(item.value / filteredEvaluations.length * 100).toFixed(1)}%</span>
                    </GlassCard>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'timeline' && (
              <motion.div
                key="timeline"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard className="h-[400px] p-6" hover={false}>
                  <h3 className="mb-6 font-bold flex items-center gap-2 text-sm md:text-base">
                    <Calendar className="text-purple-400" size={20} />
                    تطور الأداء عبر الزمن
                  </h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} />
                        <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                          itemStyle={{ color: config?.secondaryColor || '#a78bfa' }}
                        />
                        <Line type="monotone" dataKey="avg" stroke={config?.secondaryColor || "#a78bfa"} strokeWidth={3} dot={{ fill: config?.secondaryColor || '#a78bfa' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {activeTab === 'criteria' && (
              <motion.div
                key="criteria"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <GlassCard className="h-[400px] p-6" hover={false}>
                  <h3 className="mb-6 font-bold flex items-center gap-2 text-sm md:text-base">
                    <BarChart3 className="text-blue-400" size={20} />
                    مستوى الإنجاز حسب معيار التقييم (%)
                  </h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={criteriaAnalysisData} layout="vertical" margin={{ right: 30, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} stroke="rgba(255,255,255,0.4)" fontSize={10} hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          stroke="rgba(255,255,255,0.6)" 
                          fontSize={10} 
                          width={120}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                          formatter={(value: any) => [`${value}%`, 'نسبة الإنجاز']}
                        />
                        <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                          {criteriaAnalysisData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.percentage >= 85 ? '#10b981' : entry.percentage >= 70 ? '#3b82f6' : '#ef4444'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {criteriaAnalysisData.map((item) => (
                    <GlassCard key={item.id} className="p-4 border-white/5" hover={false}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="max-w-[70%]">
                          <h4 className="font-bold text-sm text-white/80 leading-tight">{item.name}</h4>
                          <span className="text-[10px] text-white/30">بناءً على {item.count} تقييم</span>
                        </div>
                        <div className="text-left">
                          <span className={cn(
                            "text-xl font-black",
                            item.percentage >= 85 ? "text-emerald-400" : item.percentage >= 70 ? "text-blue-400" : "text-rose-400"
                          )}>
                            {item.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-white/40">المتوسط:</span>
                          <span className="font-sans font-bold">{item.avg} / {item.max}</span>
                        </div>
                        
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex">
                          <div 
                            className="h-full bg-emerald-500/60" 
                            style={{ width: `${(item.distribution.high / (item.count || 1)) * 100}%` }}
                            title={`مرتفع: ${item.distribution.high}`}
                          />
                          <div 
                            className="h-full bg-blue-500/60" 
                            style={{ width: `${(item.distribution.mid / (item.count || 1)) * 100}%` }}
                            title={`متوسط: ${item.distribution.mid}`}
                          />
                          <div 
                            className="h-full bg-rose-500/60" 
                            style={{ width: `${(item.distribution.low / (item.count || 1)) * 100}%` }}
                            title={`منخفض: ${item.distribution.low}`}
                          />
                        </div>
                        
                        <div className="flex justify-between text-[8px] text-white/20 px-0.5">
                          <span>إتقان عالي</span>
                          <span>إتقان منخفض</span>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'stage-trends' && (
              <motion.div
                key="stage-trends"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard className="h-[450px] p-6" hover={false}>
                  <h3 className="mb-6 font-bold flex items-center gap-2 text-sm md:text-base">
                    <Sliders className="text-emerald-400" size={20} />
                    تحليل اتجاهات الأداء حسب المرحلة (%)
                  </h3>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stageTrendsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} />
                        <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        {STAGES.map((s, idx) => {
                          const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a78bfa'];
                          return (
                            <Line 
                              key={s.value} 
                              type="monotone" 
                              dataKey={s.value} 
                              name={s.label}
                              stroke={colors[idx % colors.length]} 
                              strokeWidth={3} 
                              dot={{ fill: colors[idx % colors.length] }} 
                              connectNulls
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {activeTab === 'teachers' && (
              <motion.div
                key="teachers"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard className="p-4 md:p-6" hover={false}>
                  <h3 className="mb-4 md:mb-6 font-bold flex items-center gap-2 text-sm md:text-base">
                    <Users className="text-blue-400" size={20} />
                    إحصائيات الأداء حسب المعلم
                  </h3>
                  <div className="overflow-x-auto -mx-4 md:mx-0">
                    <table className="w-full text-right text-xs md:text-sm min-w-[500px] md:min-w-0 px-4 md:px-0 font-sans">
                      <thead className="border-b border-white/10 text-white/40">
                        <tr>
                          <th className="pb-4 font-medium pr-4 md:pr-0 text-right">المعلم</th>
                          <th className="pb-4 font-medium text-right">عدد التقييمات</th>
                          <th className="pb-4 font-medium text-right">المتوسط</th>
                          <th className="pb-4 font-medium text-right">أعلى درجة</th>
                          <th className="pb-4 font-medium text-right">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredTeachers.map(t => {
                          const teacherEvals = filteredEvaluations.filter(e => e.teacherId === t.id);
                          const rawAvg = teacherEvals.length > 0
                            ? (teacherEvals.reduce((a, b) => a + b.totalScore, 0) / teacherEvals.length)
                            : 0;
                          const normalizedAvg = (rawAvg / maxPossibleScore) * 100;
                          const max = teacherEvals.length > 0 ? Math.max(...teacherEvals.map(e => e.totalScore)) : 0;
                          
                          return (
                            <tr key={t.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-4 font-medium pr-4 md:pr-0">{t.name}</td>
                              <td className="py-4">{teacherEvals.length}</td>
                              <td className="py-4 font-bold">{normalizedAvg.toFixed(1)}%</td>
                              <td className="py-4 font-sans">{max} / {maxPossibleScore}</td>
                              <td className="py-4">
                                {teacherEvals.length > 0 ? (
                                  <span className={cn(
                                    "rounded-full px-2 py-0.5 text-[9px] md:text-[10px]",
                                    normalizedAvg >= 90 ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
                                  )}>{getGradeLabel(normalizedAvg)}</span>
                                ) : (
                                  <span className="text-white/20 text-[9px] md:text-[10px]">لا يوجد</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
    
    {/* Print Summary View */}
      <div className={cn(
        "print:block fixed top-0 left-0 w-full min-h-screen bg-white text-[#1e293b] p-12 z-[9999] overflow-auto custom-scrollbar",
        showPrintPreview ? "block" : "hidden print:block"
      )} dir="rtl" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        
        {/* Floating Print Exit Button (Only visible on screen during preview) */}
        {showPrintPreview && (
          <div className="fixed top-6 right-6 flex gap-3 print:hidden z-[10000]">
            <GlassButton 
              onClick={() => setShowPrintPreview(false)}
              className="bg-slate-900/90 text-white border-white/20 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2"
            >
              <EyeOff size={20} />
              إنهاء المعاينة
            </GlassButton>
            <GlassButton 
              onClick={() => window.print()}
              className="bg-blue-600 text-white border-none px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2"
            >
              <Printer size={20} />
              تأكيد الطباعة
            </GlassButton>
          </div>
        )}

        {/* Dynamic Header section using config settings */}
        <div 
          className="flex justify-between items-start mb-10 border-b-4 pb-8"
          style={{ borderBottomColor: config?.primaryColor || '#0f172a' }}
        >
          {/* Right Section */}
          <div 
            className="flex-1 whitespace-pre-line leading-relaxed font-sans font-bold text-slate-700" 
            style={{ 
              fontSize: `${(config?.reportFontSize || 10) + 2}px`,
              textAlign: (config?.headerRightAlign || 'right') as any,
            }}
          >
            {config?.headerRight || 'المملكة العربية السعودية\nوزارة التعليم\nإدارة التعليم بمحافظة ...'}
          </div>
          
          {/* Center Section with Logo */}
          <div 
            className="flex-1 flex flex-col items-center px-4"
            style={{ textAlign: (config?.headerCenterAlign || 'center') as any }}
          >
            {config?.logoUrl ? (
              <img src={config.logoUrl} alt="Logo" className="h-20 w-20 object-contain mb-3" />
            ) : (
              <div className="h-20 w-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center mb-3">
                <School className="text-slate-300" size={32} />
              </div>
            )}
            <h1 className="text-2xl font-black text-slate-900 mb-1 underline underline-offset-8 decoration-slate-200">
              {config?.headerCenter || 'تقرير أداء معلم'}
            </h1>
            <p className="text-sm font-bold text-slate-500">{config?.reportTitle || 'ملخص إحصائي للأداء الوظيفي'}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[9px] text-slate-400 font-bold">
              {selectedStage !== 'all' && <span>المرحلة: {STAGES.find(s => s.value === selectedStage)?.label}</span>}
              {selectedRole !== 'all' && <span>المقيم: {ROLES.find(r => r.value === selectedRole)?.label}</span>}
              {selectedStatus !== 'all' && <span>الحالة: {selectedStatus === 'approved' ? 'معتمد' : selectedStatus === 'submitted' ? 'بانتظار الاعتماد' : 'مسودة'}</span>}
              {(startDate || endDate) && <span>الفترة: {startDate || '...'} إلى {endDate || '...'}</span>}
            </div>
          </div>

          {/* Left Section */}
          <div 
            className="flex-1 whitespace-pre-line leading-relaxed font-sans font-bold text-slate-700" 
            style={{ 
              fontSize: `${(config?.reportFontSize || 10) + 2}px`,
              textAlign: (config?.headerLeftAlign || 'left') as any,
            }}
          >
            {config?.headerLeft || 'مدارس الأوائل الأهلية\nقسم الإشراف التربوي'}
          </div>
        </div>

        {/* Global Statistics */}
        <div className="mb-10">
          <h3 
            className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 border-r-4 pr-4 font-sans"
            style={{ borderRightColor: config?.secondaryColor || '#3b82f6' }}
          >
            أولاً: المؤشرات العامة للأداء
          </h3>
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl text-center">
               <p className="text-xs text-slate-500 font-bold mb-1">إجمالي التقييمات المنفذة</p>
               <h4 className="text-4xl font-black text-slate-900">{filteredEvaluations.length}</h4>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl text-center">
               <p className="text-xs text-slate-500 font-bold mb-1">متوسط الأداء العام</p>
               <h4 className="text-4xl font-black" style={{ color: config?.secondaryColor || '#3b82f6' }}>
                 {(filteredEvaluations.length > 0 ? (filteredEvaluations.reduce((acc, curr) => acc + (curr.totalScore / maxPossibleScore) * 100, 0) / filteredEvaluations.length) : 0).toFixed(1)}%
               </h4>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl text-center">
               <p className="text-xs text-slate-500 font-bold mb-1">عدد المعلمين المشمولين</p>
               <h4 className="text-4xl font-black text-slate-900">{filteredTeachers.length}</h4>
            </div>
          </div>
        </div>

        {/* AI Strategic Analysis if toggled and available */}
        {config?.showAiInPrint !== false && aiReport && (
          <div className="mb-10 page-break-inside-avoid shadow-inner">
            <h3 
              className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 border-r-4 pr-4 font-sans"
              style={{ borderRightColor: '#a855f7' }}
            >
              تحليل الذكاء الاصطناعي الاستراتيجي للمؤسسة
            </h3>
            <div className="bg-purple-50/30 border border-purple-100 p-8 rounded-[2rem] text-sm leading-relaxed text-slate-700 font-sans">
               <div className="prose prose-slate prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-slate-900 prose-strong:text-purple-700">
                 <ReactMarkdown>{aiReport}</ReactMarkdown>
               </div>
            </div>
          </div>
        )}

        {/* Level Distribution */}
        <div className="mb-10">
          <h3 
            className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 border-r-4 pr-4 font-sans"
            style={{ borderRightColor: config?.primaryColor || '#0f172a' }}
          >
            ثانياً: توزيع المستويات والتقديرات
          </h3>
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: 'ممتاز', count: filteredEvaluations.filter(e => (e.totalScore / maxPossibleScore) * 100 >= 90).length, color: 'text-emerald-600' },
              { label: 'جيد جداً', count: filteredEvaluations.filter(e => {
                  const score = (e.totalScore / maxPossibleScore) * 100;
                  return score >= 80 && score < 90;
                }).length, color: 'text-blue-600' },
              { label: 'جيد', count: filteredEvaluations.filter(e => {
                  const score = (e.totalScore / maxPossibleScore) * 100;
                  return score >= 70 && score < 80;
                }).length, color: 'text-amber-600' },
              { label: 'مقبول', count: filteredEvaluations.filter(e => {
                  const score = (e.totalScore / maxPossibleScore) * 100;
                  return score >= 60 && score < 70;
                }).length, color: 'text-orange-600' },
              { label: 'ضعيف', count: filteredEvaluations.filter(e => (e.totalScore / maxPossibleScore) * 100 < 60).length, color: 'text-red-600' },
            ].map(item => (
              <div key={item.label} className="bg-white border-2 border-slate-50 p-5 rounded-3xl text-center shadow-sm">
                <p className="text-xs text-slate-500 mb-2 font-bold">{item.label}</p>
                <p className={cn("text-3xl font-black leading-none", item.color)}>{item.count}</p>
                <p className="text-[10px] text-slate-300 mt-2 font-medium">({((item.count / (filteredEvaluations.length || 1)) * 100).toFixed(0)}%)</p>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Records Table */}
        <div className="mb-12">
          <h3 
            className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 border-r-4 pr-4 font-sans"
            style={{ borderRightColor: config?.secondaryColor || '#3b82f6' }}
          >
            ثالثاً: تفاصيل أداء الهيئة التعليمية
          </h3>
          <div className="rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm">
            <table className="w-full border-collapse text-xs text-right font-sans">
              <thead>
                <tr className="text-white font-bold" style={{ backgroundColor: config?.primaryColor || '#0f172a' }}>
                  <th className="p-5">اسم المعلم</th>
                  <th className="p-5">المادة التعليمية</th>
                  <th className="p-5">المرحلة</th>
                  <th className="p-5 text-center">ع. التقييمات</th>
                  <th className="p-5 text-center">متوسط النسبة</th>
                  <th className="p-5 text-center">التقدير النهائي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTeachers.map(t => {
                    const teacherEvals = filteredEvaluations.filter(e => e.teacherId === t.id);
                    const rawAvg = teacherEvals.length > 0
                      ? (teacherEvals.reduce((a, b) => a + b.totalScore, 0) / teacherEvals.length)
                      : 0;
                    const normalizedAvg = (rawAvg / maxPossibleScore) * 100;
                    return (
                      <tr key={t.id} className="bg-white hover:bg-slate-50/50 transition-colors">
                        <td className="p-5 font-black text-slate-900 border-l border-slate-50">{t.name}</td>
                        <td className="p-5 text-slate-600 font-bold">{t.subject}</td>
                        <td className="p-5 text-slate-500 font-medium">{STAGES.find(s => s.value === t.stage)?.label}</td>
                        <td className="p-5 text-center text-slate-400 font-mono font-bold">{teacherEvals.length}</td>
                        <td className="p-5 text-center font-black text-slate-900 text-sm">{normalizedAvg.toFixed(1)}%</td>
                        <td className="p-5 text-center">
                          <span className={cn(
                            "px-4 py-1.5 rounded-full text-[10px] font-black border-2",
                            normalizedAvg >= 90 ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            normalizedAvg >= 80 ? "bg-blue-50 text-blue-700 border-blue-100" :
                            normalizedAvg >= 70 ? "bg-amber-50 text-amber-700 border-amber-100" : 
                            normalizedAvg >= 60 ? "bg-orange-50 text-orange-700 border-orange-100" :
                            "bg-red-50 text-red-700 border-red-100"
                          )}>
                            {getGradeLabel(normalizedAvg)}
                          </span>
                        </td>
                      </tr>
                    );
                })}
              </tbody>
        </table>
      </div>
    </div>

    {/* Authentication & Signatures */}
    <div className="mt-auto pt-10">
      <div className="grid grid-cols-3 gap-10">
          <div className="text-center space-y-4">
            <p className="text-sm font-black text-slate-900 font-sans">مشرف المادة / المنسق</p>
            <div className="h-32 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/30 flex items-center justify-center">
              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest font-sans">توقيع المنسق</span>
            </div>
          </div>
          <div className="text-center space-y-4">
            <p className="text-sm font-black text-slate-900 font-sans">مدير القسم / وكيل الشؤون</p>
            <div className="h-32 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/30 flex items-center justify-center">
              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest font-sans">اعتماد الإدارة</span>
            </div>
          </div>
          <div className="text-center space-y-4">
            <p className="text-sm font-black text-slate-900 font-sans">قائد المدرسة / الختم الرسمي</p>
            <div className="h-32 border-4 border-double border-slate-200 rounded-3xl bg-slate-50/50 flex items-center justify-center relative">
              <div className="absolute inset-4 rounded-2xl border-2 border-slate-100 opacity-20"></div>
              <span className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] font-sans">OFFICIAL SEAL</span>
            </div>
          </div>
      </div>
    </div>

    {/* Page metadata with configurable footer */}
    <div 
      className="mt-16 pt-8 border-t-2 border-slate-100 flex items-center text-slate-400 font-sans font-medium"
      style={{ 
        fontSize: `${config?.footerFontSize || 9}px`,
        textAlign: (config?.footerAlignment || 'center') as any,
        justifyContent: config?.footerAlignment === 'center' ? 'center' : config?.footerAlignment === 'left' ? 'flex-end' : 'flex-start'
      }}
    >
      <div className="flex flex-col gap-1 w-full text-center">
        <p className="opacity-60">{config?.footerText || `تم استخراج هذا التقرير آلياً من نظام الأوائل لتقييم الأداء © ${new Date().getFullYear()}`}</p>
        <p className="text-[8px] opacity-40">كود التقرير المرجعي: {Math.random().toString(36).substr(2, 12).toUpperCase()}</p>
      </div>
    </div>

    <style dangerouslySetInnerHTML={{ __html: `
      @media print {
        @page {
          size: A4 ${config?.orientation || 'portrait'};
          margin-top: ${config?.marginTop || 15}mm;
          margin-bottom: ${config?.marginBottom || 15}mm;
          margin-left: ${config?.marginLeft || 10}mm;
          margin-right: ${config?.marginRight || 10}mm;
        }
      }
    ` }} />
  </div>
</>
);
};

export default ReportsPage;
