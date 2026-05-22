/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, updateDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { Users, UserPlus, Shield, Edit2, Trash2, X, ShieldCheck, Mail, UserCheck, Key, RotateCcw, Loader2 } from 'lucide-react';
import { UserProfile, UserRole, EducationStage } from '../types';
import { ROLES, STAGES } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { logAction } from '../lib/audit';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';

export const UsersPage: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: '',
    email: '',
    role: UserRole.SUPERVISOR,
    stage: EducationStage.PRIMARY,
    active: true
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(doc => ({ uid: doc.id, ...(doc.data() as object) } as UserProfile)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.name) return;
    
    if (!isAdmin) {
      toast.error('عذراً، فقط مدير النظام يمكنه إدارة المستخدمين');
      return;
    }
    
    setLoading(true);
    try {
      if (editingUser) {
        const userRef = doc(db, 'users', editingUser.uid);
        await updateDoc(userRef, {
          ...formData,
          updatedAt: new Date()
        });
        logAction('USER_UPDATED', editingUser.uid, 'user', `تم تحديث بيانات المستخدم: ${formData.name}`);
        toast.success(`تم تحديث بيانات ${formData.name}`);
      } else {
        // Create a unique ID if we don't have one
        const newDocRef = doc(collection(db, 'users'));
        const newUid = newDocRef.id;
        await setDoc(newDocRef, {
          ...formData,
          uid: newUid,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        logAction('USER_CREATED', newUid, 'user', `تم إنشاء مستخدم جديد: ${formData.name}`);
        toast.success(`تم إضافة المستخدم ${formData.name} بنجاح`);
      }
      
      setIsModalOpen(false);
      await fetchUsers();
    } catch (e) {
      console.error('Error saving user:', e);
      alert('حدث خطأ أثناء حفظ البيانات. يرجى التأكد من صلاحياتك.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!uid) return;
    
    if (!isAdmin) {
      toast.error('عذراً، لا تملك صلاحية الحذف');
      return;
    }
    
    setLoading(true);
    setErrorMessage(null);
    try {
      const userName = users.find(u => u.uid === uid)?.name || uid;
      await deleteDoc(doc(db, 'users', uid));
      logAction('USER_DELETED', uid, 'user', `تم حذف المستخدم: ${userName}`);
      await fetchUsers();
      setSuccessMessage('تم حذف المستخدم بنجاح');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      console.error('Error deleting user:', e);
      setErrorMessage('حدث خطأ أثناء الحذف. يرجى التأكد من أنك تملك صلاحيات "مدير نظام".');
      handleFirestoreError(e, OperationType.DELETE, `users/${uid}`);
    } finally {
      setLoading(false);
      setDeleteConfirmId(null);
    }
  };

  const handleResetPassword = async (email: string, userName: string) => {
    if (!email) return;
    
    if (!isAdmin) {
      toast.error('عذراً، فقط مدير النظام يمكنه إعادة تعيين كلمة المرور');
      return;
    }
    
    setResetLoading(email);
    try {
      await sendPasswordResetEmail(auth, email);
      logAction('PASSWORD_RESET_SENT', email, 'user', `تم إرسال بريد إعادة تعيين كلمة المرور للمستخدم: ${userName}`);
      toast.success(`تم إرسال تعليمات تهيئة الحساب إلى ${email}`);
    } catch (e: any) {
      console.error('Error sending reset email:', e);
      toast.error('حدث خطأ أثناء إرسال البريد: ' + (e.message || 'فشل الاتصال'));
    } finally {
      setResetLoading(null);
    }
  };

  return (
    <div className="space-y-6 text-right pb-10" dir="rtl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-2xl md:text-3xl font-bold">إدارة المستخدمين</h1>
          <p className="text-xs md:text-sm text-white/40">التحكم في صلاحيات الوصول للنظام</p>
        </motion.div>
        <GlassButton 
          onClick={() => {
            setEditingUser(null);
            setFormData({ name: '', email: '', role: UserRole.SUPERVISOR, stage: EducationStage.PRIMARY, active: true });
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 bg-blue-600 text-sm py-3 px-6"
        >
          <UserPlus size={20} />
          إضافة مستخدم
        </GlassButton>
      </div>

      <AnimatePresence>
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-400"
          >
            {errorMessage}
          </motion.div>
        )}
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-400"
          >
            {successMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6">
        <GlassCard className="p-0 overflow-hidden" hover={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[600px] md:min-w-0">
              <thead className="bg-white/5 text-[10px] md:text-sm font-bold text-white/60">
                <tr>
                  <th className="px-4 md:px-6 py-4">المستخدم</th>
                  <th className="px-4 md:px-6 py-4">الدور الوظيفي</th>
                  <th className="px-4 md:px-6 py-4">المرحلة</th>
                  <th className="px-4 md:px-6 py-4 text-center">الحالة</th>
                  <th className="px-4 md:px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user, i) => (
                  <motion.tr 
                    key={user.uid} 
                    className="transition-colors hover:bg-white/5"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <td className="px-4 md:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 md:h-10 md:w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                          <UserCheck size={20} />
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-xs md:text-sm truncate">{user.name}</p>
                          <p className="text-[10px] text-white/40 truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Shield size={14} className="text-blue-400 shrink-0" />
                        <span className="text-xs md:text-sm">{ROLES.find(r => r.value === user.role)?.label}</span>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4 font-mono text-[10px] md:text-xs text-white/60">
                      {STAGES.find(s => s.value === user.stage)?.label || 'كل المراحل'}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-center">
                      <span className={cn(
                        "inline-block rounded-full px-2 py-0.5 md:py-1 text-[9px] md:text-[10px] font-bold",
                        user.active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                      )}>
                        {user.active ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <div className="flex justify-center gap-1 md:gap-2">
                         <button 
                          onClick={() => handleResetPassword(user.email, user.name)}
                          disabled={resetLoading === user.email}
                          className={cn(
                            "rounded-lg p-2 transition-colors",
                            resetLoading === user.email ? "text-white/20" : "hover:bg-amber-500/10 text-amber-400"
                          )}
                          title="إرسال بريد تهيئة الحساب / إعادة تعيين كلمة المرور"
                         >
                           {resetLoading === user.email ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
                         </button>
                         <button 
                          onClick={() => {
                            setEditingUser(user);
                            setFormData(user);
                            setIsModalOpen(true);
                          }}
                          className="rounded-lg p-2 hover:bg-blue-500/10 text-blue-400 transition-colors"
                          title="تعديل"
                         >
                           <Edit2 size={16} />
                         </button>
                         <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(user.uid);
                          }}
                          className="rounded-lg p-2 hover:bg-red-500/10 text-red-400 transition-colors"
                          title="حذف"
                         >
                           <Trash2 size={16} />
                         </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <GlassCard className="w-full max-w-lg shadow-2xl p-6" hover={false}>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold">{editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="rounded-lg p-2 hover:bg-white/5 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {/* ... existing form fields ... */}
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60">الاسم</label>
                  <input 
                    type="text" 
                    required
                    placeholder="أدخل الاسم الكامل"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-blue-500/50"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs md:text-sm text-white/60 text-right">البريد الإلكتروني (جوجل)</label>
                  <input 
                    type="email" 
                    required
                    placeholder="name@gmail.com"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-blue-500/50"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-right">
                  <div>
                    <label className="mb-2 block text-xs md:text-sm text-white/60">الصلاحية</label>
                    <select 
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-blue-500/50 appearance-none"
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value} className="bg-[#0f172a]">{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs md:text-sm text-white/60">المرحلة</label>
                    <select 
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-blue-500/50 appearance-none"
                      value={formData.stage}
                      onChange={e => setFormData({ ...formData, stage: e.target.value as EducationStage })}
                    >
                      <option value="all" className="bg-[#0f172a]">جميع المراحل</option>
                      {STAGES.map(s => <option key={s.value} value={s.value} className="bg-[#0f172a]">{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3 py-2">
                  <input 
                    type="checkbox" 
                    id="user-active"
                    checked={formData.active}
                    onChange={e => setFormData({ ...formData, active: e.target.checked })}
                    className="h-5 w-5 rounded-lg border-white/10 bg-white/5 text-blue-600 focus:ring-offset-0 focus:ring-0"
                  />
                  <label htmlFor="user-active" className="text-sm text-white/60 cursor-pointer">حساب نشط ومفعل</label>
                </div>
                
                <div className="flex gap-4 pt-4">
                  <GlassButton type="submit" disabled={loading} className="flex-1 bg-blue-600 py-3 text-sm font-bold">
                    {loading ? 'جاري الحفظ...' : 'حفظ البيانات'}
                  </GlassButton>
                  <GlassButton type="button" onClick={() => setIsModalOpen(false)} className="flex-1 border-white/10 bg-white/5 py-3 text-sm">إلغاء</GlassButton>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <GlassCard className="w-full max-w-md shadow-2xl p-6 border-red-500/20" hover={false}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 mx-auto">
                <Trash2 size={24} />
              </div>
              <h2 className="mb-2 text-center text-xl font-bold">تأكيد حذف المستخدم</h2>
              <p className="mb-6 text-center text-sm text-white/60">
                هل أنت متأكد من حذف هذا المستخدم؟ {users.find(u => u.uid === deleteConfirmId)?.name}
                <br />
                لا يمكن التراجع عن هذا الإجراء وسيتم إلغاء كافة صلاحيات الوصول المرتبطة بهذا الحساب.
              </p>
              <div className="flex gap-4">
                <GlassButton 
                  onClick={() => handleDelete(deleteConfirmId)} 
                  disabled={loading}
                  className="flex-1 bg-red-600 py-3 text-sm font-bold"
                >
                  {loading ? 'جاري الحذف...' : 'نعم، قم بالحذف'}
                </GlassButton>
                <GlassButton 
                  onClick={() => setDeleteConfirmId(null)} 
                  className="flex-1 border-white/10 bg-white/5 py-3 text-sm"
                >
                  إلغاء
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}
    </div>
  );
};
