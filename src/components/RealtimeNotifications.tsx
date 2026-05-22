import React, { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, Timestamp, getDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, Evaluation, Teacher } from '../types';
import toast from 'react-hot-toast';

export const RealtimeNotifications: React.FC = () => {
  const { profile } = useAuth();
  const sessionStartTime = useRef(Timestamp.now());
  const seenEvaluations = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;

    const rolesToNotify = [
      UserRole.ADMIN,
      UserRole.SUPERVISION_DIRECTOR,
      UserRole.SCHOOL_DIRECTOR,
      UserRole.SUPERVISOR
    ];

    if (!rolesToNotify.includes(profile.role)) return;

    const evaluationsRef = collection(db, 'evaluations');
    
    // 1. Existing logic: Listen for REALTIME updates (submitted/approved)
    const qRealtime = query(
      evaluationsRef,
      where('status', 'in', ['submitted', 'approved'])
    );

    const unsubscribeRealtime = onSnapshot(qRealtime, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const evalData = { id: change.doc.id, ...change.doc.data() } as Evaluation;
        
        if (change.type === 'added' || change.type === 'modified') {
          if (evalData.evaluatorId === profile.uid) continue;
          const eventTime = evalData.updatedAt || evalData.createdAt;
          if (eventTime && eventTime.toMillis() > sessionStartTime.current.toMillis()) {
            if (seenEvaluations.current.has(evalData.id)) continue;
            seenEvaluations.current.add(evalData.id);
            try {
              const teacherDoc = await getDoc(doc(db, 'teachers', evalData.teacherId));
              const teacherData = teacherDoc.data() as Teacher;
              const teacherName = teacherData?.name || 'غير معروف';
              const statusText = evalData.status === 'submitted' ? 'بانتظار الاعتماد' : 'تم اعتماده';
              toast.success(
                <div className="text-right" dir="rtl">
                  <p className="font-bold text-sm">تقييم جديد: {statusText}</p>
                  <p className="text-xs text-white/60">
                    المعلم: {teacherName} <br />
                    بواسطة: {evalData.evaluatorName}
                  </p>
                </div>,
                { duration: 6000, icon: '📝' }
              );
            } catch (e) { console.error(e); }
          }
        }
      }
    });

    // 2. New logic: Check for STALE evaluations (older than 14 days)
    const checkStaleEvaluations = async () => {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const qStale = query(
        evaluationsRef,
        where('status', 'in', ['draft', 'submitted'])
      );

      try {
        const snapshot = await getDocs(qStale);
        const staleItems = snapshot.docs.filter(doc => {
          const data = doc.data();
          const createdAt = data.createdAt as Timestamp;
          return createdAt && createdAt.toMillis() < fourteenDaysAgo.getTime();
        });

        if (staleItems.length > 0) {
          toast.error(
            <div className="text-right" dir="rtl">
              <p className="font-bold text-sm">تنبيه: تقييمات متأخرة</p>
              <p className="text-xs text-white/60">
                هناك {staleItems.length} تقييم (مسودة أو بانتظار اعتماد) مضى عليها أكثر من أسبوعين.
              </p>
            </div>,
            { duration: 8000, icon: '⚠️' }
          );
        }
      } catch (e) {
        console.error('Error checking stale evaluations:', e);
      }
    };

    // Run once on load after a short delay
    const timer = setTimeout(checkStaleEvaluations, 3000);

    return () => {
      unsubscribeRealtime();
      clearTimeout(timer);
    };
  }, [profile]);

  return null;
};
