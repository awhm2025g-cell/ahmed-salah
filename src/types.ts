/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = 'admin',
  SUPERVISION_DIRECTOR = 'supervision_director',
  SCHOOL_DIRECTOR = 'school_director',
  SCHOOL_VICE_PRINCIPAL = 'school_vice_principal',
  SUPERVISOR = 'supervisor',
}

export enum EducationStage {
  PRIMARY = 'primary',
  MIDDLE = 'middle',
  SECONDARY = 'secondary',
  ALL = 'all',
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  stage: EducationStage;
  active: boolean;
  createdAt: any;
}

export interface Teacher {
  id: string;
  name: string;
  employeeId?: string;
  stage: EducationStage;
  subject: string;
  active: boolean;
  createdAt: any;
  defaultEvaluatorId?: string;
  supervisorId?: string;
}

export interface Evaluation {
  id: string;
  teacherId: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluatorRole: string;
  academicYear: string;
  semester: string;
  scores: Record<string, number>;
  totalScore: number;
  notes: Record<string, string>;
  evidence: string[];
  status: 'draft' | 'submitted' | 'approved';
  digitallySigned: boolean;
  createdAt: any;
  updatedAt: any;
  aiAnalysis?: string;
  generalNotes?: string;
}

export interface Criterion {
  id: string;
  label: string;
  maxScore: number;
}

export interface AcademicYear {
  id: string;
  label: string;
  active: boolean;
  archived: boolean;
}

export interface AppConfig {
  schoolName: string;
  logoUrl?: string;
  academicYear: string;
  semester: string;
  academicYears?: AcademicYear[];
  criteria?: Criterion[];
  colors?: {
    primary: string;
    secondary: string;
  };
  defaultEvaluatorId?: string;
  // Print Settings
  headerLeft?: string;
  headerCenter?: string;
  headerRight?: string;
  footerText?: string;
  reportTitle?: string;
  tablePadding?: number;
  reportFontSize?: number;
  reportLineHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  showAiInPrint?: boolean;
  orientation?: 'portrait' | 'landscape';
  footerFontSize?: number;
  footerAlignment?: string;
  headerLeftAlign?: string;
  headerCenterAlign?: string;
  headerRightAlign?: string;
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  borderColor?: string;
  aiReportPrompt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  targetId: string;
  targetType: 'evaluation' | 'user' | 'teacher' | 'config';
  details: string;
  timestamp: any;
}
