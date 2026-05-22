/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const EVALUATION_CRITERIA = [
  { id: 'planning', label: 'التخطيط والمتابعة', maxScore: 10 },
  { id: 'strategies', label: 'التنويع في استراتيجيات التدريس', maxScore: 10 },
  { id: 'management', label: 'الإدارة الصفية', maxScore: 5 },
  { id: 'technology', label: 'توظيف التقنية ووسائل التعلم المناسبة', maxScore: 5 },
  { id: 'assessment', label: 'تنويع أساليب التقويم', maxScore: 10 },
  { id: 'results', label: 'تحسين نتائج المتعلمين', maxScore: 10 },
  { id: 'student_care', label: 'رعاية الطلاب ( التأخر الدراسي - التفوق الدراسي)', maxScore: 5 },
  { id: 'activities', label: 'تفعيل النشاط المدرسي', maxScore: 10 },
  { id: 'professional_community', label: 'التفاعل مع المجتمع المهني', maxScore: 10 },
  { id: 'duties', label: 'أداء الواجبات الوظيفية', maxScore: 5 },
  { id: 'discipline', label: 'الانضباط', maxScore: 5 },
  { id: 'relationships_students', label: 'العلاقات مع الطلاب وأولياء الأمور', maxScore: 5 },
  { id: 'relationships_staff', label: 'العلاقات مع الهيئة الإدارية والزملاء', maxScore: 5 },
  { id: 'innovation', label: 'تطوير العمل والمبادرات الإبداعية', maxScore: 5 },
];

export const STAGES = [
  { value: 'primary', label: 'المرحلة الابتدائية' },
  { value: 'middle', label: 'المرحلة المتوسطة' },
  { value: 'secondary', label: 'المرحلة الثانوية' },
];

export const ROLES = [
  { value: 'admin', label: 'مدير النظام' },
  { value: 'supervision_director', label: 'مدير الإشراف التربوي' },
  { value: 'school_director', label: 'مدير المدرسة' },
  { value: 'school_vice_principal', label: 'وكيل المدرسة' },
  { value: 'supervisor', label: 'المشرف التربوي' },
];

export const SEMESTERS = ['الفصل الأول', 'الفصل الثاني', 'الفصل الثالث'];

export function getGradeLabel(score: number): string {
  if (score >= 90) return 'ممتاز';
  if (score >= 80) return 'جيد جداً';
  if (score >= 70) return 'جيد';
  if (score >= 60) return 'مقبول';
  return 'ضعيف';
}

export function getGradeColor(score: number): string {
  if (score >= 90) return 'text-emerald-500';
  if (score >= 80) return 'text-blue-500';
  if (score >= 70) return 'text-amber-500';
  if (score >= 60) return 'text-orange-500';
  return 'text-red-500';
}
