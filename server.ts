import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Gemini AI Setup
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API Routes
app.post("/api/ai/analyze-teacher", async (req, res) => {
  try {
    const { teacher, evaluation, history, criteria } = req.body;

    const scoresDetails = criteria.map((c: any) => {
      const score = evaluation.scores[c.id] || 0;
      return `${c.label}: ${score}/${c.maxScore}`;
    }).join('\n');

    const prompt = `
أنت خبير في الإشراف التربوي وتطوير أداء المعلمين.
قم بتحليل أداء المعلم التالي بناءً على معايير التقييم المذكورة باللغة العربية الأكاديمية الرسمية.

بيانات المعلم:
الاسم: ${teacher.name}
المرحلة: ${teacher.stage}
المادة: ${teacher.subject}

نتائج التقييم الحالي (الدرجة الكلية: ${evaluation.totalScore}/100):
${scoresDetails}

ملاحظات المقيّم:
${Object.values(evaluation.notes).filter(n => n).join('\n')}

${history.length > 0 ? `تاريخ التقييمات السابقة:
${history.map((h: any) => `تاريخ: ${new Date(h.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}, الدرجة: ${h.totalScore}`).join('\n')}` : ''}

المطلوب تقديم تحليل شامل يتضمن:
1. استخراج نقاط القوة البارزة.
2. استخراج نقاط الضعف والمجالات التي تحتاج إلى تحسين.
3. اقتراح خطة تطوير مهني عملية.
4. اقتراح دورات تدريبية محددة.
5. ملخص احترافي لأداء المعلم وتوصيات للمشرف التربوي.

الرد يجب أن يكون بتنسيق Markdown منظم.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
    });

    res.json({ result: response.text });
  } catch (error: any) {
    console.error("AI Error:", error);
    if (error.message?.includes("429") || error.status === "RESOURCE_EXHAUSTED") {
      return res.status(429).json({ 
        error: "لقد تجاوزت الحصة المجانية المتاحة للذكاء الاصطناعي اليوم. يرجى المحاولة مرة أخرى غداً أو لاحقاً." 
      });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ai/analyze-overall", async (req, res) => {
  try {
    const { teachers, evaluations, prompt: customPrompt } = req.body;

    const totalEvals = evaluations.length;
    if (totalEvals === 0) return res.json({ result: "لا توجد بيانات كافية لإجراء التحليل حالياً." });

    const avgScore = (evaluations.reduce((a: any, b: any) => a + b.totalScore, 0) / totalEvals).toFixed(1);
    
    const grades = {
      excellent: evaluations.filter((e: any) => e.totalScore >= 90).length,
      veryGood: evaluations.filter((e: any) => e.totalScore >= 80 && e.totalScore < 90).length,
      good: evaluations.filter((e: any) => e.totalScore >= 70 && e.totalScore < 80).length,
      satisfactory: evaluations.filter((e: any) => e.totalScore >= 60 && e.totalScore < 70).length,
      weak: evaluations.filter((e: any) => e.totalScore < 60).length,
    };

    const statsByStage = evaluations.reduce((acc: any, ev: any) => {
      const teacher = teachers.find((t: any) => t.id === ev.teacherId);
      const stage = teacher?.stage || 'unknown';
      if (!acc[stage]) acc[stage] = { total: 0, count: 0 };
      acc[stage].total += ev.totalScore;
      acc[stage].count += 1;
      return acc;
    }, {});

    const stageSummary = Object.entries(statsByStage).map(([stage, data]: [string, any]) => {
      return `- المرحلة ${stage}: متوسط ${ (data.total / data.count).toFixed(1) }% (${data.count} تقييم)`;
    }).join('\n');

    const sampleNotes = evaluations
      .slice(-20)
      .map((e: any) => Object.values(e.notes).filter(n => n).join(', '))
      .join(' | ')
      .substring(0, 1500);

    const defaultInstructions = `
أنت مستشار تطوير تعليمي كخبير في ضمان الجودة المدرسية. باللغة العربية:
المطلوب تقرير استراتيجي (Markdown):
1. ملخص تنفيذي.
2. تحليل القوة والفرص.
3. التوصيات الاستراتيجية.
4. مبادرات مقترحة.
`;

    const instructions = customPrompt && customPrompt.trim() !== '' ? customPrompt : defaultInstructions;

    const finalPrompt = `
${instructions}

بيانات المدرسة للتحليل:
- معلمين: ${teachers.length}, تقييمات: ${totalEvals}, متوسط: ${avgScore}%
- هرم التقديرات: ممتاز(${grades.excellent}), جيد جداً(${grades.veryGood}), جيد(${grades.good}), مقبول(${grades.satisfactory}), ضعيف(${grades.weak})
- تفاصيل المراحل:
${stageSummary}
- ملاحظات عينة من التقييمات: ${sampleNotes}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: finalPrompt }] }],
    });

    res.json({ result: response.text });
  } catch (error: any) {
    console.error("AI Overall Error:", error);
    if (error.message?.includes("429") || error.status === "RESOURCE_EXHAUSTED") {
      return res.status(429).json({ 
        error: "لقد تجاوزت الحصة المجانية المتاحة للذكاء الاصطناعي اليوم. يرجى المحاولة مرة أخرى غداً أو لاحقاً." 
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Vite Middleware for Dev / Static Files for Prod
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
