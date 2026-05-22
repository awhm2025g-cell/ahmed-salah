/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { School, Sliders, Palette, ShieldAlert, Save, RotateCcw, Plus, Trash2, GripVertical, Calendar, Archive, CheckCircle, UserCheck, ChevronUp, ChevronDown, Loader2, GripHorizontal, BrainCircuit } from 'lucide-react';
import { SEMESTERS, EVALUATION_CRITERIA } from '../constants';
import { AppConfig, Criterion, AcademicYear, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { collection, query, getDocs, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { logAction } from '../lib/audit';
import { motion, Reorder } from 'motion/react';

export const SettingsPage: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === UserRole.ADMIN;
  const [config, setConfig] = useState<AppConfig>({
    schoolName: 'مدارس الأوائل الأهلية',
    academicYear: '1445-1446',
    semester: 'الفصل الدراسي الثاني',
    criteria: EVALUATION_CRITERIA,
    academicYears: [
      { id: 'default', label: '1445-1446', active: true, archived: false }
    ],
    defaultEvaluatorId: ''
  } as any);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [configSnap, usersSnap] = await Promise.all([
          getDoc(doc(db, 'config', 'app')),
          getDocs(collection(db, 'users'))
        ]);

        if (configSnap.exists()) {
          setConfig(configSnap.data() as AppConfig);
        }

        setUsers(usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      } catch (error) {
        console.error("Error fetching settings data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'app'), {
        ...config,
        updatedAt: serverTimestamp()
      }, { merge: true });
      logAction('CONFIG_UPDATED', 'app', 'config', 'تم تحديث إعدادات النظام والمعايير');
      toast.success('تم حفظ الإعدادات بنجاح');
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء حفظ الإعدادات: ' + (e.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  const handleSyncCriteria = async () => {
    if (!isAdmin) return;
    if (!window.confirm('سيتم تحديث كافة التقييمات السابقة لتتوافق مع قائمة المعايير الحالية. سيتم إضافة المعايير الجديدة بدرجة (0) وحذف المعايير الملغاة. هل أنت متأكد؟')) return;

    setSyncing(true);
    let updatedCount = 0;
    try {
      const evalsSnap = await getDocs(collection(db, 'evaluations'));
      const batchSize = 50;
      const batches = [];
      const currentCriteriaIds = config.criteria.map(c => c.id);

      const docs = evalsSnap.docs;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        const updatePromises = batch.map(async (docSnap) => {
          const evData = docSnap.data();
          const oldScores = evData.scores || {};
          const newScores: Record<string, number> = {};
          let newTotal = 0;

          // Only keep scores for current criteria
          config.criteria.forEach(c => {
            const score = oldScores[c.id] || 0;
            newScores[c.id] = score;
            newTotal += score;
          });

          await setDoc(docSnap.ref, {
            scores: newScores,
            totalScore: newTotal,
            updatedAt: serverTimestamp()
          }, { merge: true });
          updatedCount++;
        });
        await Promise.all(updatePromises);
      }

      logAction('CRITERIA_SYNCED', 'all', 'evaluation', `تمت مزامنة معايير التقييم لعدد ${updatedCount} تقييم`);
      toast.success(`تمت المزامنة بنجاح لـ ${updatedCount} تقييم`);
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء المزامنة: ' + (e.message || 'خطأ غير معروف'));
    } finally {
      setSyncing(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 500) { // 500KB limit for base64 storage
      alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 500 كيلوبايت');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setConfig({ ...config, logoUrl: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleAddCriterion = () => {
    const newCriterion: Criterion = {
      id: `criterion_${Date.now()}`,
      label: 'معيار جديد',
      maxScore: 10
    };
    setConfig({
      ...config,
      criteria: [...(config.criteria || []), newCriterion]
    });
  };

  const handleUpdateCriterion = (id: string, updates: Partial<Criterion>) => {
    setConfig({
      ...config,
      criteria: config.criteria?.map(c => c.id === id ? { ...c, ...updates } : c)
    });
  };

  const handleDeleteCriterion = (id: string) => {
    if (config.criteria && config.criteria.length <= 1) {
      alert('يجب أن يكون هناك معيار واحد على الأقل');
      return;
    }
    setConfig({
      ...config,
      criteria: config.criteria?.filter(c => c.id !== id)
    });
  };

  const handleMoveCriterion = (index: number, direction: 'up' | 'down') => {
    if (!config.criteria) return;
    const newCriteria = [...config.criteria];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newCriteria.length) return;
    
    [newCriteria[index], newCriteria[targetIndex]] = [newCriteria[targetIndex], newCriteria[index]];
    
    setConfig({
      ...config,
      criteria: newCriteria
    });
  };

  const handleAddAcademicYear = () => {
    const nextYear = `14${46 + (config.academicYears?.length || 0)}-14${47 + (config.academicYears?.length || 0)}`;
    const newYear: AcademicYear = {
      id: `year_${Date.now()}`,
      label: nextYear,
      active: false,
      archived: false
    };
    setConfig({
      ...config,
      academicYears: [...(config.academicYears || []), newYear]
    });
  };

  const handleUpdateAcademicYear = (id: string, label: string) => {
    const isCurrentActive = config.academicYears?.find(y => y.id === id)?.active;
    setConfig({
      ...config,
      academicYear: isCurrentActive ? label : config.academicYear,
      academicYears: config.academicYears?.map(y => y.id === id ? { ...y, label } : y)
    });
  };

  const handleToggleArchiveYear = (id: string) => {
    const year = config.academicYears?.find(y => y.id === id);
    if (year?.active && !year.archived) {
      alert('لا يمكن أرشفة العام الدراسي النشط حالياً');
      return;
    }
    setConfig({
      ...config,
      academicYears: config.academicYears?.map(y => 
        y.id === id ? { ...y, archived: !y.archived } : y
      )
    });
  };

  const handleSetActiveYear = (id: string) => {
    const year = config.academicYears?.find(y => y.id === id);
    if (!year || year.archived) return;
    
    setConfig({
      ...config,
      academicYear: year.label,
      academicYears: config.academicYears?.map(y => ({
        ...y,
        active: y.id === id
      }))
    });
  };

  const handleDeleteYear = (id: string) => {
    const year = config.academicYears?.find(y => y.id === id);
    if (year?.active) {
      alert('لا يمكن حذف العام الدراسي النشط');
      return;
    }
    setConfig({
      ...config,
      academicYears: config.academicYears?.filter(y => y.id !== id)
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-white/40">جاري التحميل...</div>;

  return (
    <div className="space-y-6 text-right pb-12 md:pb-20" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">إعدادات النظام</h1>
        <p className="text-xs md:text-sm text-white/40">تخصيص النظام وتهيئة العام الدراسي</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard hover={false} className="space-y-6 p-4 md:p-6">
          <div className="flex items-center gap-2 text-blue-400 font-bold mb-4">
             <School size={20} />
             <span className="text-sm md:text-base">بيانات الجهة والترويسة</span>
          </div>
          
          <div>
            <label className="mb-2 block text-xs md:text-sm text-white/60">اسم المدرسة / الجهة</label>
            <input 
              type="text" 
              disabled={!isAdmin}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              value={config.schoolName}
              onChange={e => setConfig({ ...config, schoolName: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs md:text-sm text-white/60">شعار المدرسة</label>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <input 
                type="file" 
                id="logo-upload"
                accept="image/*"
                disabled={!isAdmin}
                onChange={handleLogoUpload}
                className="hidden"
              />
              <label 
                htmlFor={isAdmin ? "logo-upload" : ""}
                className={cn(
                  "h-20 w-20 shrink-0 rounded-xl border-2 border-dashed border-white/20 bg-white/5 flex items-center justify-center overflow-hidden transition-all",
                  isAdmin ? "cursor-pointer hover:border-blue-500/50 hover:bg-white/10" : "cursor-not-allowed opacity-50"
                )}
              >
                {config.logoUrl ? (
                  <img src={config.logoUrl} alt="School Logo" className="h-full w-full object-contain" />
                ) : (
                  <School className="text-white/20" size={32} />
                )}
              </label>
              <div className="flex-1 w-full text-center sm:text-right">
                <label 
                  htmlFor={isAdmin ? "logo-upload" : ""}
                  className={cn(
                    "inline-block cursor-pointer rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs md:text-sm hover:bg-white/10 transition-colors",
                    !isAdmin && "opacity-50 cursor-not-allowed"
                  )}
                >
                  اختيار صورة...
                </label>
                <p className="mt-2 text-[10px] text-white/40">يفضل صورة مربعة بحجم أقل من 500KB</p>
                {config.logoUrl && isAdmin && (
                  <button 
                    onClick={() => setConfig({ ...config, logoUrl: '' })}
                    className="mt-1 text-[10px] text-rose-400 hover:underline block mx-auto sm:mx-0"
                  >
                    حذف الشعار الحالي
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-xs md:text-sm text-white/60">العام الدراسي الحالي</label>
              <div className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-blue-400 font-bold">
                {config.academicYear}
              </div>
              <p className="mt-1 text-[10px] text-white/20">يتم التغيير من قسم إدارة الأعوام الدراسية بالأسفل</p>
            </div>
            <div>
              <label className="mb-2 block text-xs md:text-sm text-white/60">الفصل الدراسي</label>
              <select 
                disabled={!isAdmin}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm appearance-none"
                value={config.semester}
                onChange={e => setConfig({ ...config, semester: e.target.value })}
              >
                {SEMESTERS.map(s => <option key={s} value={s} className="bg-[#0f172a]">{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-bold mb-3">
              <UserCheck size={18} />
              <span className="text-xs md:text-sm">المقيم الافتراضي (للمعلمين الجدد)</span>
            </div>
            <select 
              disabled={!isAdmin}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm appearance-none"
              value={config.defaultEvaluatorId || ''}
              onChange={e => setConfig({ ...config, defaultEvaluatorId: e.target.value })}
            >
              <option value="" className="bg-[#0f172a]">بدون مقيم افتراضي</option>
              {users
                .filter(u => [UserRole.ADMIN, UserRole.SUPERVISION_DIRECTOR, UserRole.SCHOOL_DIRECTOR, UserRole.SCHOOL_VICE_PRINCIPAL, UserRole.SUPERVISOR].includes(u.role))
                .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
                .map(u => {
                  let roleLabel = 'مقيم';
                  if (u.role === UserRole.ADMIN) roleLabel = 'مدير النظام';
                  else if (u.role === UserRole.SUPERVISION_DIRECTOR) roleLabel = 'مدير الإشراف';
                  else if (u.role === UserRole.SCHOOL_DIRECTOR) roleLabel = 'مدير المدرسة';
                  else if (u.role === UserRole.SCHOOL_VICE_PRINCIPAL) roleLabel = 'وكيل الشؤون';
                  else if (u.role === UserRole.SUPERVISOR) roleLabel = 'مشرف تربوي';
                  
                  return (
                    <option key={u.uid} value={u.uid} className="bg-[#0f172a]">
                      {u.name} ({roleLabel})
                    </option>
                  );
                })
              }
            </select>
            <p className="mt-2 text-[10px] text-white/30 italic">سيتم تعيين هذا المقيم تلقائياً للمعلمين الجدد عند الإضافة أو الاستيراد.</p>
          </div>
        </GlassCard>

        <GlassCard hover={false} className="space-y-6 p-4 md:p-6">
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Calendar size={20} />
                <span className="text-sm md:text-base">إدارة الأعوام الدراسية</span>
             </div>
             {isAdmin && (
               <button 
                onClick={handleAddAcademicYear}
                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                title="إضافة عام دراسي جديد"
               >
                 <Plus size={18} />
               </button>
             )}
           </div>

           <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
             {config.academicYears?.map((year) => (
               <div 
                key={year.id} 
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                  year.active ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/5",
                  year.archived && "opacity-50 grayscale"
                )}
               >
                 <div className="flex items-center gap-3">
                   {year.active ? (
                     <CheckCircle className="text-emerald-400" size={18} />
                   ) : (
                     <div className="w-[18px] h-[18px] rounded-full border border-white/20" />
                   )}
                   <input 
                    type="text" 
                    disabled={!isAdmin || year.archived}
                    value={year.label}
                    onChange={(e) => handleUpdateAcademicYear(year.id, e.target.value)}
                    className="bg-transparent border-none outline-none focus:ring-0 text-xs md:text-sm font-medium w-24"
                   />
                   {year.archived && (
                     <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white/40">مؤرشف</span>
                   )}
                 </div>

                 <div className="flex items-center gap-2">
                   {!year.archived && !year.active && isAdmin && (
                     <button 
                      onClick={() => handleSetActiveYear(year.id)}
                      className="text-[10px] text-emerald-400 hover:underline"
                     >
                       تفعيل
                     </button>
                   )}
                   {isAdmin && (
                     <button 
                      onClick={() => handleToggleArchiveYear(year.id)}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        year.archived ? "text-white/40 hover:bg-white/10" : "text-amber-400 hover:bg-amber-400/10"
                      )}
                      title={year.archived ? "إلغاء الأرشفة" : "أرشفة"}
                     >
                       <Archive size={16} />
                     </button>
                   )}
                   {!year.active && isAdmin && (
                     <button 
                      onClick={() => handleDeleteYear(year.id)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-400/10 transition-colors"
                      title="حذف"
                     >
                       <Trash2 size={16} />
                     </button>
                   )}
                 </div>
               </div>
             ))}
           </div>
        </GlassCard>

        <GlassCard hover={false} className="space-y-6 p-4 md:p-6">
           <div className="flex items-center gap-2 text-purple-400 font-bold mb-4">
             <Palette size={20} />
             <span className="text-sm md:text-base">مظهر النظام</span>
          </div>

          <div className="p-4 rounded-2xl border border-white/10 bg-white/5">
             <p className="text-xs md:text-sm font-medium mb-2">تأثير Glassmorphism</p>
             <p className="text-[10px] md:text-xs text-white/40 leading-relaxed">
                يتم تطبيق سمة "الزجاج السائل" تلقائياً في جميع الواجهات لضمان تجربة عصرية.
             </p>
          </div>

          <div className="flex flex-col gap-4">
             <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-xs md:text-sm">الوضع الليلي (تلقائي)</span>
                <div className="h-5 w-10 md:h-6 md:w-11 rounded-full bg-blue-600 flex items-center px-1">
                   <div className="h-3 w-3 md:h-4 md:w-4 rounded-full bg-white ml-auto" />
                </div>
             </div>
             <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-xs md:text-sm">التوقيع الرقمي</span>
                <div className="h-5 w-10 md:h-6 md:w-11 rounded-full bg-emerald-600 flex items-center px-1">
                   <div className="h-3 w-3 md:h-4 md:w-4 rounded-full bg-white ml-auto" />
                </div>
             </div>
          </div>
        </GlassCard>

        <GlassCard hover={false} className="lg:col-span-2 space-y-6 p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-indigo-400 font-bold">
              <Sliders size={20} />
              <span className="text-sm md:text-base">عناصر ومعايير التقييم</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {isAdmin && (
                <GlassButton 
                  onClick={handleSyncCriteria}
                  disabled={syncing}
                  className="flex-1 md:flex-none bg-blue-500/10 border-blue-500/20 text-blue-400 text-[10px] md:text-xs py-2 md:py-1.5 px-4 flex items-center justify-center gap-2"
                >
                  {syncing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  {syncing ? 'جاري المزامنة...' : 'مزامنة مع التقييمات السابقة'}
                </GlassButton>
              )}
              {isAdmin && (
                <GlassButton 
                  onClick={handleAddCriterion}
                  className="flex-1 md:flex-none bg-indigo-600/50 text-[10px] md:text-xs py-2 md:py-1.5 px-4 flex items-center justify-center gap-2"
                >
                  <Plus size={16} />
                  إضافة معيار جديد
                </GlassButton>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 text-[10px] uppercase tracking-wider text-white/30 font-bold">
              <div className="col-span-1"></div>
              <div className="col-span-8">اسم المعيار / المحور</div>
              <div className="col-span-2 text-center">الدرجة القصوى</div>
              <div className="col-span-1"></div>
            </div>
            
            <div className="max-h-[600px] overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
              <Reorder.Group 
                axis="y" 
                values={config.criteria || []} 
                onReorder={(newCriteria) => setConfig({ ...config, criteria: newCriteria })}
                className="space-y-3"
              >
                {config.criteria?.map((criterion) => (
                  <Reorder.Item 
                    key={criterion.id} 
                    value={criterion}
                    className="relative group"
                  >
                  <div className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 items-center bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-blue-500/30 hover:bg-white/[0.07] transition-all cursor-default">
                    <div className="hidden md:flex col-span-1 justify-center items-center">
                      <div className="cursor-grab active:cursor-grabbing p-2 text-white/20 hover:text-white/60 transition-colors">
                        <GripVertical size={20} />
                      </div>
                    </div>
                    
                    <div className="md:col-span-8 w-full">
                      <div className="relative group/input">
                        <input 
                          type="text" 
                          disabled={!isAdmin}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-right transition-all"
                          value={criterion.label}
                          onChange={e => handleUpdateCriterion(criterion.id, { label: e.target.value })}
                          placeholder="أدخل اسم المعيار..."
                        />
                        <div className="absolute right-0 bottom-0 h-0.5 w-0 group-focus-within/input:w-full bg-blue-500/50 transition-all duration-300 rounded-full" />
                      </div>
                    </div>

                    <div className="md:col-span-2 w-full">
                      <div className="flex items-center justify-between md:justify-center gap-3">
                        <span className="md:hidden text-[10px] text-white/40 font-bold">الدرجة القصوى:</span>
                        <div className="relative w-20 md:w-full">
                          <input 
                            type="number" 
                            disabled={!isAdmin}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-3 text-center text-sm md:text-base font-black outline-none focus:border-blue-500/50 disabled:opacity-50 transition-all"
                            value={criterion.maxScore}
                            onChange={e => handleUpdateCriterion(criterion.id, { maxScore: Number(e.target.value) })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-1 w-full flex justify-end">
                      {isAdmin && (
                        <button 
                          onClick={() => handleDeleteCriterion(criterion.id)}
                          className="p-3 text-white/20 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all flex items-center gap-2"
                          title="حذف المعيار"
                        >
                          <Trash2 size={18} />
                          <span className="md:hidden text-xs font-bold">حذف المعيار</span>
                        </button>
                      )}
                    </div>
                    
                    <div className="md:hidden absolute left-4 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
                       <GripHorizontal size={20} />
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </div>
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-3 pt-4 border-t border-white/5 text-[10px] md:text-xs text-white/40">
              <span className="font-bold text-white/60">إجمالي الدرجات: {config.criteria?.reduce((sum, c) => sum + c.maxScore, 0)}</span>
              <p className="text-center md:text-right">تأكد من مواءمة المعايير مع اللوائح الرسمية.</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard hover={false} className="lg:col-span-2 space-y-6 p-4 md:p-6">
          <div className="flex items-center gap-2 text-purple-400 font-bold mb-4">
             <BrainCircuit size={20} />
             <span className="text-sm md:text-base">إعدادات الذكاء الاصطناعي</span>
          </div>
          
          <div>
            <label className="mb-2 block text-xs md:text-sm text-white/60">نموذج التوجيه (Prompt) لتقرير الأداء العام</label>
            <p className="text-[10px] text-white/30 mb-3 leading-relaxed">
              يمكنك هنا تخصيص الأوامر التي يتم توجيهها للذكاء الاصطناعي عند طلب "تحليل AI" في صفحة التقارير. اترك الحقل فارغاً لاستخدام النموذج الافتراضي للنظام.
            </p>
            <textarea 
              disabled={!isAdmin}
              rows={8}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs md:text-sm font-sans"
              placeholder="اكتب التوجيهات هنا... مثال: المطلوب تقرير استراتيجي يتضمن ملخص تنفيذي وتحليل القوة..."
              value={config.aiReportPrompt || ''}
              onChange={e => setConfig({ ...config, aiReportPrompt: e.target.value })}
            />
            <div className="mt-2 flex justify-end">
              <button 
                onClick={() => setConfig({ ...config, aiReportPrompt: '' })}
                className="text-[10px] text-purple-400 hover:underline flex items-center gap-1"
                disabled={!isAdmin}
              >
                <RotateCcw size={12} />
                إعادة التعيين للنموذج الافتراضي
              </button>
            </div>
          </div>
        </GlassCard>

        <GlassCard hover={false} className="lg:col-span-2 space-y-4 p-4 md:p-6">
          <div className="flex items-center gap-2 text-rose-400 font-bold mb-2">
             <ShieldAlert size={20} />
             <span className="text-sm md:text-base">إدارة البيانات</span>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
             <GlassButton 
              className="flex-1 sm:flex-none border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] md:text-xs py-2 px-4 flex items-center justify-center gap-2"
              disabled={!isAdmin}
            >
               <RotateCcw size={16} />
               تصفير البيانات
             </GlassButton>
             <GlassButton className="flex-1 sm:flex-none border-white/10 bg-white/5 text-white/60 text-[10px] md:text-xs py-2 px-4 flex items-center justify-center">
               تصدير نسخة احتياطية
             </GlassButton>
          </div>
        </GlassCard>
      </div>

      <div className="flex justify-center md:justify-start pt-6">
        <GlassButton 
          onClick={handleSave} 
          disabled={!isAdmin || saving}
          className={cn(
            "w-full md:w-auto flex items-center justify-center gap-2 bg-blue-600 px-8 py-3 md:px-12 md:py-4 text-sm md:text-base rounded-2xl shadow-lg shadow-blue-600/20",
            (!isAdmin || saving) && "opacity-50 cursor-not-allowed"
          )}
        >
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          {saving ? 'جاري الحفظ...' : 'حفظ جميع التغييرات'}
        </GlassButton>
      </div>
    </div>
  );
};
