/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from './firebase';

export async function logAction(
  action: string,
  targetId: string,
  targetType: 'evaluation' | 'user' | 'teacher' | 'config',
  details: string
) {
  const user = auth.currentUser;
  if (!user) return;

  const logPath = 'audit_logs';
  try {
    await addDoc(collection(db, logPath), {
      userId: user.uid,
      userName: user.displayName || user.email || 'Unknown User',
      action,
      targetId,
      targetType,
      details,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    // We don't want to break the main UI flow if logging fails, 
    // but we should still handle it for debugging.
    console.error('Failed to log audit action:', error);
  }
}
