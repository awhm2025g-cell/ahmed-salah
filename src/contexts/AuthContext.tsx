/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole, EducationStage } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSupervisor: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          
          // Retry logic for transient offline errors
          let docSnap = null;
          let retries = 5;
          let backoff = 1000;

          while (retries > 0) {
            try {
              docSnap = await getDoc(docRef);
              break;
            } catch (err: any) {
              const isOffline = err.message?.toLowerCase().includes('offline');
              if (isOffline && retries > 1) {
                console.warn(`Firestore connectivity issue, retrying in ${backoff}ms... (${retries - 1} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                retries--;
                backoff *= 2; // Exponential backoff
              } else {
                throw err;
              }
            }
          }
          
          if (docSnap && docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            console.log("No user profile found in Firestore for user:", user.uid);
          }
        } catch (error: any) {
          console.error("Error fetching user profile:", error.message);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const isAdmin = profile?.role === UserRole.ADMIN;
  const isSupervisor = profile?.role === UserRole.SUPERVISOR || profile?.role === UserRole.SUPERVISION_DIRECTOR;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isSupervisor }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
