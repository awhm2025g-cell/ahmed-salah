/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Evaluation, Teacher } from "../types";

export async function analyzeTeacherPerformance(
  teacher: Teacher,
  evaluation: Evaluation,
  history: Evaluation[] = [],
  criteria?: any[]
) {
  try {
    const response = await fetch('/api/ai/analyze-teacher', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teacher, evaluation, history, criteria }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to analyze performance');
    }

    const data = await response.json();
    return data.result;
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    throw error;
  }
}

export async function analyzeOverallPerformance(
  teachers: Teacher[],
  evaluations: Evaluation[],
  prompt?: string
) {
  try {
    const response = await fetch('/api/ai/analyze-overall', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teachers, evaluations, prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to analyze overall performance');
    }

    const data = await response.json();
    return data.result;
  } catch (error: any) {
    console.error("Overall AI Analysis Error:", error);
    throw error;
  }
}
