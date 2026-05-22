/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDoc, writeBatch, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { Plus, Search, UserSquare2, Edit2, Trash2, X, Check, ClipboardList, BarChart3, AlertTriangle, FileUp, CheckCircle2, Calendar, Star, ChevronLeft, ArrowUpRight } from 'lucide-react';
import { STAGES, EVALUATION_CRITERIA, getGradeColor, getGradeLabel } from '../constants';
import { Teacher, EducationStage, Evaluation, UserProfile, UserRole } from '../types';
import { cn } from '../lib/utils';
import { logAction } from '../lib/audit';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';

interface TeachersPageProps {
  onNavigate?: (section: string, params?: any) => void;
}

export const TeachersPage: React.FC<TeachersPageProps> = ({ onNavigate }) => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [supervisors, setSupervisors] = useState<UserProfile[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12; // Grid of 3 columns, 4 rows is better for pagination

  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    stage: 'primary' as EducationStage,
    subject: '',
    active: true,
    supervisorId: '',
    defaultEvaluatorId: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [teachersSnap, evalsSnap, configSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'evaluations')),
        getDoc(doc(db, 'config', 'app')),
        getDocs(collection(db, 'users'))
      ]);

      const allUsers = usersSnap.docs.map(doc => ({ uid: doc.id, ...(doc.data() as object) } as UserProfile));
      const evaluators = allUsers.filter(u => [UserRole.ADMIN, UserRole.SUPERVISION_DIRECTOR, UserRole.SCHOOL_DIRECTOR, UserRole.SCHOOL_VICE_PRINCIPAL, UserRole.SUPERVISOR].includes(u.role));
      setSupervisors(evaluators);
      setTeachers(teachersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as Teacher)));
      setEvaluations(evalsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as Evaluation)));
      if (configSnap.exists()) {
        const configData = configSnap.data();
        setConfig(configData);
        setFormData(prev => ({
          ...prev,
          defaultEvaluatorId: configData.defaultEvaluatorId || ''
        }));
      }
    } catch (e) {
      console.error(e);
      handleFirestoreError(e, OperationType.GET, 'data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = fetchData;

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [bulkStage, setBulkStage] = useState<EducationStage>(EducationStage.PRIMARY);
  const [bulkSubject, setBulkSubject] = useState('ابتدائي');

  const handleBulkImport = async () => {
    const names = bulkData.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) return;

    setLoading(true);
    try {
      for (const name of names) {
        await addDoc(collection(db, 'teachers'), {
          name,
          employeeId: '',
          stage: bulkStage,
          subject: bulkSubject,
          active: true,
          createdAt: serverTimestamp(),
          defaultEvaluatorId: config?.defaultEvaluatorId || ''
        });
      }
      logAction('TEACHER_BULK_IMPORTED', 'bulk', 'teacher', `تم استيراد جماعي لـ ${names.length} معلمين لمرحلة ${bulkStage}`);
      setIsBulkModalOpen(false);
      setBulkData('');
      fetchTeachers();
      toast.success(`تم إضافة ${names.length} معلماً بنجاح`);
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء استيراد البيانات');
      handleFirestoreError(e, OperationType.WRITE, 'teachers/bulk');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTeacher) {
        await updateDoc(doc(db, 'teachers', editingTeacher.id), formData);
        logAction('TEACHER_UPDATED', editingTeacher.id, 'teacher', `تم تحديث بيانات المعلم: ${formData.name}`);
        toast.success('تم تحديث بيانات المعلم بنجاح');
      } else {
        const docRef = await addDoc(collection(db, 'teachers'), {
          ...formData,
          createdAt: serverTimestamp(),
          defaultEvaluatorId: config?.defaultEvaluatorId || ''
        });
        logAction('TEACHER_CREATED', docRef.id, 'teacher', `تم إضافة معلم جديد: ${formData.name}`);
        toast.success('تم إضافة المعلم بنجاح');
      }
      setIsModalOpen(false);
      setEditingTeacher(null);
      setFormData({ 
        name: '', 
        employeeId: '', 
        stage: EducationStage.PRIMARY, 
        subject: '', 
        active: true, 
        supervisorId: '',
        defaultEvaluatorId: config?.defaultEvaluatorId || ''
      });
      fetchTeachers();
    } catch (e) {
      console.error(e);
      handleFirestoreError(e, OperationType.WRITE, editingTeacher ? `teachers/${editingTeacher.id}` : 'teachers');
    }
  };

  const handleDelete = async () => {
    if (!teacherToDelete) return;
    
    setLoading(true);
    try {
      const teacherName = teacherToDelete.name;
      const batch = writeBatch(db);
      
      // 1. Delete teacher doc
      batch.delete(doc(db, 'teachers', teacherToDelete.id));
      
      // 2. Delete all related evaluations
      const evalsQuery = query(collection(db, 'evaluations'), where('teacherId', '==', teacherToDelete.id));
      const evalsSnap = await getDocs(evalsQuery);
      evalsSnap.forEach((d) => {
        batch.delete(d.ref);
      });
      
      await batch.commit();

      logAction('TEACHER_DELETED', teacherToDelete.id, 'teacher', `تم حذف المعلم: ${teacherName} وكافة تقييماته (${evalsSnap.size} تقييم)`);
      toast.success('تم حذف المعلم وكافة سجلات تقييمه نهائياً');
      
      await fetchTeachers();
      setTeacherToDelete(null);
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء محاولة الحذف');
      handleFirestoreError(e, OperationType.DELETE, `teachers/${teacherToDelete.id}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredTeachers = teachers
    .filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  // Pagination Logic
  const totalPages = Math.ceil(filteredTeachers.length / itemsPerPage);
  const paginatedTeachers = filteredTeachers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 text-right pb-10" dir="rtl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-2xl md:text-3xl font-bold">إدارة المعلمين</h1>
          <p className="text-xs md:text-sm text-white/40">قائمة الكادر التعليمي بنظام الأوائل</p>
        </motion.div>
        <div className="grid grid-cols-1 sm:flex sm:flex-row gap-2">
          <GlassButton 
            onClick={() => {
              setBulkData('');
              setBulkSubject('');
              setBulkStage(EducationStage.PRIMARY);
              setIsBulkModalOpen(true);
            }}
            className="bg-indigo-600/30 text-xs py-3 px-6 flex items-center justify-center gap-2"
          >
            <FileUp size={20} />
            استيراد جماعي
          </GlassButton>
          <GlassButton 
            onClick={() => {
              setEditingTeacher(null);
              setFormData({ 
                name: '', 
                employeeId: '', 
                stage: EducationStage.PRIMARY, 
                subject: '', 
                active: true, 
                supervisorId: '',
                defaultEvaluatorId: config?.defaultEvaluatorId || ''
              });
              setIsModalOpen(true);
            }}
            className="bg-blue-600 text-xs md:text-sm py-3 px-6 flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            إضافة معلم
          </GlassButton>
        </div>
      </div>

      <GlassCard className="p-4" hover={false}>
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 focus-within:border-blue-500/50 transition-colors">
          <Search size={20} className="text-white/40" />
          <input 
            type="text" 
            placeholder="بحث عن معلم أو مادة..." 
            className="w-full bg-transparent outline-none placeholder:text-white/20 text-sm md:text-base"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // Reset to first page on search
            }}
          />
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 md:grid-cols-3">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <GlassCard key={i} className="h-48 animate-pulse bg-white/5"><div /></GlassCard>
          ))
        ) : paginatedTeachers.map((teacher, i) => (
          <motion.div
            key={teacher.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <GlassCard 
              className="group relative overflow-hidden" 
              onClick={() => onNavigate?.('evaluations', { teacherId: teacher.id, teacherName: teacher.name })}
            >
              {/* Status Badge */}
              <div className="absolute top-4 left-4 z-10">
                <div className={cn(
                  "px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-md border",
                  teacher.active 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                )}>
                  <div className={cn("w-1.5 h-1.5 rounded-full", teacher.active ? "bg-emerald-400" : "bg-red-400")} />
                  {teacher.active ? "نشط" : "غير نشط"}
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 flex items-center justify-center text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform duration-500">
                      <UserSquare2 size={32} />
                    </div>
                  </div>
                  <div 
                    onClick={() => onNavigate?.('evaluations', { teacherId: teacher.id, teacherName: teacher.name })}
                    className="flex-1 min-w-0 cursor-pointer group/name"
                  >
                    <h3 className="font-bold text-lg text-white group-hover/name:text-blue-300 group-hover:text-blue-400 transition-colors mb-1">
                      {teacher.name}
                    </h3>
                    <div className="flex items-center gap-2 text-white/40 text-xs">
                      <span>{teacher.subject}</span>
                      <span className="w-1 h-1 rounded-full bg-white/10" />
                      <span>{STAGES.find(s => s.value === teacher.stage)?.label}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {(() => {
                    const teacherEvals = evaluations
                      .filter(e => e.teacherId === teacher.id && e.status === 'approved')
                      .sort((a, b) => {
                        const timeA = (a.createdAt as any)?.seconds || 0;
                        const timeB = (b.createdAt as any)?.seconds || 0;
                        return timeB - timeA;
                      });
                    
                    const latest = teacherEvals[0];
                    const numEvals = evaluations.filter(e => e.teacherId === teacher.id).length;
                    
                    const currentCriteria = config?.criteria || EVALUATION_CRITERIA;
                    const maxScore = currentCriteria.reduce((sum: number, c: any) => sum + (c.maxScore || 10), 0);
                    const lastPercentage = latest ? (latest.totalScore / maxScore) * 100 : 0;
                    
                    const avgRaw = teacherEvals.length > 0 
                      ? teacherEvals.reduce((acc, curr) => acc + (curr.totalScore || 0), 0) / teacherEvals.length
                      : 0;
                    const avgPercentage = (avgRaw / maxScore) * 100;

                    return (
                      <>
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                          <p className="text-[10px] text-white/30 font-bold mb-1">متوسط الأداء</p>
                          <div className="flex items-baseline gap-1">
                            <span className={cn("text-xl font-black", teacherEvals.length > 0 ? getGradeColor(avgPercentage) : "text-white/20")}>
                              {teacherEvals.length > 0 ? `${avgPercentage.toFixed(0)}%` : '--'}
                            </span>
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                          <p className="text-[10px] text-white/30 font-bold mb-1">عدد التقييمات</p>
                          <p className="text-xl font-black text-white">{numEvals}</p>
                        </div>
                        
                        <div className="col-span-full bg-white/5 rounded-2xl p-3 border border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center font-black text-sm border shadow-inner",
                              latest ? getGradeColor(lastPercentage) : "text-white/20 border-white/5 bg-white/5",
                              latest && getGradeColor(lastPercentage).replace('text-', 'bg-').replace('-500', '-500/10'),
                              latest && getGradeColor(lastPercentage).replace('text-', 'border-').replace('-500', '-500/20')
                            )}>
                              {latest ? latest.totalScore : '--'}
                            </div>
                            <div>
                              <p className="text-[10px] text-white/30 font-bold">آخر تقييم</p>
                              <p className="text-xs font-bold text-white/60">
                                {latest?.createdAt?.toDate ? latest.createdAt.toDate().toLocaleDateString('ar-SA') : 'لا يوجد'}
                              </p>
                            </div>
                          </div>
                          {latest && (
                            <div className={cn("text-[10px] font-black px-2 py-1 rounded-lg border uppercase tracking-tighter", 
                              getGradeColor(lastPercentage),
                              getGradeColor(lastPercentage).replace('text-', 'bg-').replace('-500', '-500/10'),
                              getGradeColor(lastPercentage).replace('text-', 'border-').replace('-500', '-500/20')
                            )}>
                              {getGradeLabel(lastPercentage)}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate?.('evaluations', { teacherId: teacher.id, teacherName: teacher.name });
                      }}
                      className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-all active:scale-95"
                      title="سجل التقييمات"
                    >
                      <ClipboardList size={16} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTeacher(teacher);
                        setFormData({
                          name: teacher.name,
                          employeeId: teacher.employeeId || '',
                          stage: teacher.stage,
                          subject: teacher.subject,
                          active: teacher.active,
                          supervisorId: teacher.supervisorId || '',
                          defaultEvaluatorId: teacher.defaultEvaluatorId || config?.defaultEvaluatorId || ''
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/20 transition-all active:scale-95"
                      title="تعديل البيانات"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setTeacherToDelete(teacher);
                      }}
                      className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all active:scale-95"
                      title="حذف المعلم"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate?.('evaluations', { teacherId: teacher.id, teacherName: teacher.name });
                    }}
                    className="flex items-center gap-2 text-blue-400 font-bold text-xs group-hover:translate-x-[-4px] transition-transform cursor-pointer"
                  >
                    <span>عرض التفاصيل</span>
                    <ArrowUpRight size={14} />
                  </div>
                </div>
              </div>

              {/* Decorative overlay for hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/0 to-blue-600/0 group-hover:from-blue-600/5 group-hover:to-transparent pointer-events-none transition-all duration-500" />
            </GlassCard>
          </motion.div>
      ))}
      </div>

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-xl bg-white/5 border border-white/5 disabled:opacity-20 hover:bg-white/10 transition-colors"
          >
            السابق
          </button>
          
          <div className="flex gap-1 overflow-x-auto pb-1 max-w-[200px] sm:max-w-none">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={cn(
                  "w-8 h-8 md:w-10 md:h-10 rounded-xl border flex items-center justify-center text-xs md:text-sm font-bold transition-all",
                  currentPage === i + 1 
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40" 
                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl bg-white/5 border border-white/5 disabled:opacity-20 hover:bg-white/10 transition-colors"
          >
            التالي
          </button>
        </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <GlassCard className="w-full max-w-lg shadow-2xl p-6" hover={false}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">استيراد قائمة معلمين</h2>
              <button onClick={() => setIsBulkModalOpen(false)} className="rounded-xl p-2 hover:bg-white/5 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60">المرحلة التعليمية</label>
                  <select 
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 appearance-none text-sm"
                    value={bulkStage}
                    onChange={e => setBulkStage(e.target.value as EducationStage)}
                  >
                    {STAGES.map(s => <option key={s.value} value={s.value} className="bg-[#0f172a]">{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60">المادة الدراسية</label>
                  <input 
                    type="text" 
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 text-sm"
                    value={bulkSubject}
                    onChange={e => setBulkSubject(e.target.value)}
                  />
                </div>
              </div>
              <textarea 
                className="w-full h-48 md:h-64 rounded-2xl border border-white/10 bg-white/5 p-4 outline-none focus:border-blue-500/50 text-right text-sm"
                dir="rtl"
                placeholder="أدخل الأسماء (اسم في كل سطر)..."
                value={bulkData}
                onChange={e => setBulkData(e.target.value)}
              />
              <div className="flex gap-4 pt-4">
                <GlassButton 
                  onClick={handleBulkImport} 
                  disabled={loading}
                  className="flex-1 bg-blue-600 py-3 text-sm font-bold"
                >
                  {loading ? 'جاري الاستيراد...' : 'تأكيد الاستيراد'}
                </GlassButton>
                <GlassButton onClick={() => setIsBulkModalOpen(false)} className="flex-1 border-white/10 bg-white/5 py-3 text-sm">إلغاء</GlassButton>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Manual Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <GlassCard className="w-full max-w-lg shadow-2xl p-6" hover={false}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">{editingTeacher ? 'تعديل المعلم' : 'إضافة معلم جديد'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-xl p-2 hover:bg-white/5 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-2 block text-xs md:text-sm text-white/60">اسم المعلم الكامل</label>
                <input 
                  type="text" 
                  required
                  placeholder="أدخل الاسم الثلاثي"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 text-sm"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs md:text-sm text-white/60">المادة الدراسية</label>
                <input 
                  type="text" 
                  required
                  placeholder="مثال: لغة عربية، رياضيات..."
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 text-sm"
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60">المرحلة</label>
                  <select 
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 appearance-none text-sm"
                    value={formData.stage}
                    onChange={e => setFormData({ ...formData, stage: e.target.value as EducationStage })}
                  >
                    {STAGES.map(s => <option key={s.value} value={s.value} className="bg-[#0f172a]">{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60">الرقم الوظيفي (اختياري)</label>
                  <input 
                    type="text" 
                    placeholder="12345..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 text-sm"
                    value={formData.employeeId}
                    onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60">المشرف المباشر</label>
                  <select 
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 appearance-none text-sm"
                    value={formData.supervisorId}
                    onChange={e => setFormData({ ...formData, supervisorId: e.target.value })}
                  >
                    <option value="" className="bg-[#0f172a]">بدون مشرف محدد</option>
                    {supervisors.map(s => (
                      <option key={s.uid} value={s.uid} className="bg-[#0f172a]">{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60">المقيم الافتراضي</label>
                  <select 
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500/50 appearance-none text-sm"
                    value={formData.defaultEvaluatorId}
                    onChange={e => setFormData({ ...formData, defaultEvaluatorId: e.target.value })}
                  >
                    <option value="" className="bg-[#0f172a]">استخدام إعدادات النظام</option>
                    {supervisors.map(s => (
                      <option key={s.uid} value={s.uid} className="bg-[#0f172a]">{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 py-2 cursor-pointer" onClick={() => setFormData({ ...formData, active: !formData.active })}>
                <div className={cn(
                  "h-5 w-5 rounded-lg border flex items-center justify-center transition-colors",
                  formData.active ? "bg-blue-600 border-blue-500" : "bg-white/5 border-white/10"
                )}>
                  {formData.active && <Check size={14} />}
                </div>
                <label className="text-sm text-white/60 cursor-pointer">المعلم على رأس العمل (نشط)</label>
              </div>
              
              <div className="flex gap-4 pt-4">
                <GlassButton type="submit" className="flex-1 bg-blue-600 py-3 font-bold text-sm">حفظ البيانات</GlassButton>
                <GlassButton type="button" onClick={() => setIsModalOpen(false)} className="flex-1 border-white/10 bg-white/5 py-3 text-sm">إلغاء</GlassButton>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {teacherToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
              <GlassCard className="w-full max-w-md shadow-2xl p-8 border-red-500/20" hover={false}>
                <div className="flex flex-col items-center text-center">
                  <div className="mb-6 rounded-full bg-red-500/10 p-4 text-red-500 border border-red-500/20">
                    <AlertTriangle size={48} />
                  </div>
                  <h2 className="text-xl font-bold mb-2">تأكيد الحذف</h2>
                  <p className="text-sm text-white/40 mb-8 leading-relaxed">
                    هل أنت متأكد من حذف المعلم <span className="text-white font-bold">"{teacherToDelete.name}"</span>؟
                    <br />
                    <span className="text-red-400 font-medium">تحذير:</span> لا يمكن التراجع عن هذا الإجراء وسيتم مسح كافة سجلات التقييم المرتبطة بهذا المعلم نهائياً.
                  </p>
                  
                  <div className="flex gap-4 w-full">
                    <GlassButton 
                      onClick={handleDelete}
                      disabled={loading}
                      className="flex-1 bg-red-600 hover:bg-red-500 py-3 text-sm font-bold shadow-lg shadow-red-900/20"
                    >
                      {loading ? 'جاري الحذف...' : 'نعم، حذف المعلم'}
                    </GlassButton>
                    <GlassButton 
                      onClick={() => setTeacherToDelete(null)}
                      className="flex-1 bg-white/5 border border-white/10 py-3 text-sm"
                    >
                      إلغاء
                    </GlassButton>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
