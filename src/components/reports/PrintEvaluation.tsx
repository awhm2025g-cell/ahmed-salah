/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Evaluation, Teacher } from '../../types';
import { STAGES, getGradeLabel, EVALUATION_CRITERIA } from '../../constants';

interface PrintEvaluationProps {
  evaluation: Evaluation;
  teacher: Teacher | undefined;
  config: any;
}

export const PrintEvaluation: React.FC<PrintEvaluationProps> = ({ evaluation, teacher, config }) => {
  const criteria = config?.criteria || EVALUATION_CRITERIA;
  const maxPossibleScore = criteria.reduce((sum: number, c: any) => sum + (c.maxScore || 10), 0);
  
  const formatDate = (dateValue: any) => {
    if (!dateValue) return '-';
    try {
      if (dateValue.toDate) return dateValue.toDate().toLocaleDateString('ar-SA');
      return new Date(dateValue).toLocaleDateString('ar-SA');
    } catch (e) {
      return '-';
    }
  };

  const percentage = maxPossibleScore > 0 ? (evaluation.totalScore / maxPossibleScore) * 100 : 0;

  return (
    <div 
      className="hidden print:block bg-white p-0 m-0 font-sans w-full" 
      dir="rtl"
      style={{ 
        fontSize: `${config?.reportFontSize || 10}px`,
        color: config?.textColor || '#000000',
        lineHeight: config?.reportLineHeight || 1.5
      }}
    >
      {/* Header Section */}
      <div 
        className="flex justify-between items-start border-b-2 pb-3 mb-4"
        style={{ borderBottomColor: config?.borderColor || config?.primaryColor || '#000000' }}
      >
        <div 
          className="flex-1 whitespace-pre-line leading-relaxed" 
          style={{ 
            fontSize: `${(config?.reportFontSize || 10) - 1}px`,
            textAlign: (config?.headerRightAlign || 'right') as any,
            color: config?.textColor || '#000000'
          }}
        >
          {config?.headerRight || 'وزارة التعليم\nمدارس الأوائل الأهلية\nقسم الإشراف التربوي'}
        </div>
        
        <div 
          className="flex-1 flex flex-col items-center px-1"
          style={{ textAlign: (config?.headerCenterAlign || 'center') as any }}
        >
          {config?.logoUrl ? (
            <img src={config.logoUrl} alt="School Logo" className="h-12 w-12 object-contain mb-1" />
          ) : (
            <div className="h-12 w-12 bg-gray-100 rounded flex items-center justify-center mb-1">
              <span className="text-[8px] text-gray-400">شعار المدرسة</span>
            </div>
          )}
          <h1 className="font-bold underline underline-offset-4 mb-0.5 whitespace-pre-line" style={{ fontSize: `${(config?.reportFontSize || 10) + 2}px`, color: config?.primaryColor || '#000000' }}>
            {config?.headerCenter || 'تقرير تقييم أداء معلم'}
          </h1>
          <p className="font-medium opacity-80" style={{ fontSize: `${(config?.reportFontSize || 10) - 1}px`, color: config?.textColor || '#000000' }}>{config?.reportTitle || 'استمارة الزيارة الصفية والتقييم الفني'}</p>
        </div>

        <div 
          className="flex-1 whitespace-pre-line leading-relaxed" 
          style={{ 
            fontSize: `${(config?.reportFontSize || 10) - 1}px`,
            textAlign: (config?.headerLeftAlign || 'left') as any,
            color: config?.textColor || '#000000'
          }}
        >
          {config?.headerLeft || 'المملكة العربية السعودية\nوزارة التعليم\nإدارة التعليم بمحافظة ...'}
        </div>
      </div>

      {/* Info Box */}
      <div 
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 border p-2 rounded-lg mb-4"
        style={{ 
          borderColor: config?.borderColor || config?.primaryColor || '#000000',
          backgroundColor: `${config?.primaryColor || '#000000'}05`, // 5% opacity
          color: config?.textColor || '#000000'
        }}
      >
        <div className="flex gap-2">
          <span className="font-bold">اسم المعلم:</span>
          <span className="border-b border-dotted flex-1" style={{ borderBottomColor: config?.borderColor || config?.primaryColor || '#000000' }}>{teacher?.name}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-bold">المادة:</span>
          <span className="border-b border-dotted flex-1" style={{ borderBottomColor: config?.borderColor || config?.primaryColor || '#000000' }}>{teacher?.subject}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-bold">المرحلة:</span>
          <span className="border-b border-dotted flex-1" style={{ borderBottomColor: config?.borderColor || config?.primaryColor || '#000000' }}>{STAGES.find(s => s.value === teacher?.stage)?.label}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-bold">تاريخ التقييم:</span>
          <span className="border-b border-dotted flex-1" style={{ borderBottomColor: config?.borderColor || config?.primaryColor || '#000000' }}>{formatDate(evaluation.createdAt)}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-bold">المقيم:</span>
          <span className="border-b border-dotted flex-1" style={{ borderBottomColor: config?.borderColor || config?.primaryColor || '#000000' }}>{evaluation.evaluatorName}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-bold">العام الدراسي:</span>
          <span className="border-b border-dotted flex-1" style={{ borderBottomColor: config?.borderColor || config?.primaryColor || '#000000' }}>{evaluation.academicYear} - {evaluation.semester}</span>
        </div>
      </div>

      {/* Criteria Table */}
      <table className="w-full border-collapse border mb-4" style={{ borderColor: config?.borderColor || config?.primaryColor || '#000000' }}>
        <thead>
          <tr style={{ backgroundColor: config?.primaryColor || '#1e293b', color: '#ffffff' }}>
            <th className="border text-center w-8" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>#</th>
            <th className="border text-right" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>معيار التقييم</th>
            <th className="border text-center w-16" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>الدرجة</th>
            <th className="border text-center w-16" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>القصوى</th>
            <th className="border text-right w-1/3" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>ملاحظات</th>
          </tr>
        </thead>
        <tbody style={{ color: config?.textColor || '#000000' }}>
          {criteria.map((c: any, index: number) => (
            <tr key={c.id}>
              <td className="border text-center" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>{index + 1}</td>
              <td className="border" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>{c.label}</td>
              <td className="border text-center font-black" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>{evaluation.scores[c.id] || 0}</td>
              <td className="border text-center" style={{ padding: `${config?.tablePadding || 4}px`, borderColor: config?.borderColor || '#000000' }}>{c.maxScore}</td>
              <td className="border text-right leading-tight italic" style={{ padding: `${config?.tablePadding || 4}px`, fontSize: `${(config?.reportFontSize || 10) - 1}px`, borderColor: config?.borderColor || '#000000' }}>
                {evaluation.notes[c.id] || ''}
              </td>
            </tr>
          ))}
          <tr className="font-bold border-t-2" style={{ backgroundColor: `${config?.primaryColor || '#000000'}10`, borderColor: config?.borderColor || '#000000' }}>
            <td colSpan={2} className="border text-left" style={{ padding: `${(config?.tablePadding || 4) * 1.5}px`, borderColor: config?.borderColor || '#000000' }}>النتيجة النهائية والتقدير العام</td>
            <td className="border text-center font-black" style={{ padding: `${(config?.tablePadding || 4) * 1.5}px`, borderColor: config?.borderColor || '#000000' }}>{evaluation.totalScore}</td>
            <td className="border text-center" style={{ padding: `${(config?.tablePadding || 4) * 1.5}px`, borderColor: config?.borderColor || '#000000' }}>{maxPossibleScore}</td>
            <td className="border text-right" style={{ padding: `${(config?.tablePadding || 4) * 1.5}px`, borderColor: config?.borderColor || '#000000' }}>
              التقدير: {getGradeLabel(percentage)} ({percentage.toFixed(1)}%)
            </td>
          </tr>
        </tbody>
      </table>

      {/* AI Analysis Section (Conditional) */}
      {(config?.showAiInPrint !== false && evaluation.aiAnalysis) && (
        <div 
          className="border p-3 rounded-lg mb-4 page-break-inside-avoid"
          style={{ 
            borderColor: `${config?.secondaryColor || '#3b82f6'}30`,
            backgroundColor: `${config?.secondaryColor || '#3b82f6'}05`,
            color: config?.textColor || '#000000'
          }}
        >
          <h3 
            className="font-bold mb-1 border-b pb-1" 
            style={{ 
              fontSize: `${(config?.reportFontSize || 10)}px`,
              borderColor: `${config?.secondaryColor || '#3b82f6'}50`,
              color: config?.secondaryColor || '#3b82f6'
            }}
          >
            التحليل الاستراتيجي من الذكاء الاصطناعي:
          </h3>
          <div className="prose prose-sm max-w-none prose-p:leading-relaxed" style={{ fontSize: `${(config?.reportFontSize || 10) - 1}px` }}>
            <ReactMarkdown>{evaluation.aiAnalysis}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* General Notes Section */}
      {evaluation.generalNotes && (
        <div 
          className="border p-3 rounded-lg mb-4 page-break-inside-avoid"
          style={{ borderColor: config?.borderColor || config?.primaryColor || '#000000', color: config?.textColor || '#000000' }}
        >
          <h3 
            className="font-bold mb-1 border-b pb-1" 
            style={{ 
              fontSize: `${(config?.reportFontSize || 10)}px`,
              borderColor: `${config?.borderColor || config?.primaryColor || '#000000'}20`
            }}
          >ملاحظات ختامية وتوصيات عامة:</h3>
          <p className="leading-relaxed whitespace-pre-wrap italic opacity-80" style={{ fontSize: `${(config?.reportFontSize || 10) - 1}px` }}>{evaluation.generalNotes}</p>
        </div>
      )}

      {/* Signatures Area */}
      <div className="grid grid-cols-3 gap-6 mt-6 page-break-inside-avoid" style={{ color: config?.textColor || '#000000' }}>
        <div className="text-center">
          <p className="font-bold mb-6">توقيع المعلم</p>
          <div className="border-t w-full mx-auto pt-1 opacity-40" style={{ fontSize: `${(config?.reportFontSize || 10) - 2}px`, borderColor: config?.borderColor || config?.primaryColor || '#000000' }}>التوقيع / المصادقة</div>
        </div>
        <div className="text-center">
          <p className="font-bold mb-6">توقيع المقيم</p>
          <div className="border-t w-full mx-auto pt-1 opacity-40" style={{ fontSize: `${(config?.reportFontSize || 10) - 2}px`, borderColor: config?.borderColor || config?.primaryColor || '#000000' }}>التوقيع / الختم</div>
        </div>
        <div className="text-center">
          <p className="font-bold mb-6">اعتماد مدير/ة المدرسة</p>
          <div className="border-t w-full mx-auto pt-1 opacity-40" style={{ fontSize: `${(config?.reportFontSize || 10) - 2}px`, borderColor: config?.borderColor || config?.primaryColor || '#000000' }}>التاريخ / الختم الرسمي</div>
        </div>
      </div>

      {/* Footer Text */}
      <div 
        className="fixed bottom-6 left-0 right-0 border-t pt-2 print:block hidden px-[10mm]" 
        style={{ 
          fontSize: `${config?.footerFontSize || (config?.reportFontSize || 10) - 2}px`,
          textAlign: (config?.footerAlignment || 'center') as any,
          color: config?.textColor || '#9ca3af',
          opacity: 0.6,
          borderColor: config?.borderColor || '#f3f4f6'
        }}
      >
        {config?.footerText || 'تم استخراج هذا التقرير آلياً من نظام الأوائل لتقييم الأداء'}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 ${config?.orientation || 'portrait'};
            margin-top: ${config?.marginTop || 10}mm;
            margin-bottom: ${config?.marginBottom || 10}mm;
            margin-left: ${config?.marginLeft || 10}mm;
            margin-right: ${config?.marginRight || 10}mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-scale {
            transform: scale(1);
            transform-origin: top center;
          }
        }
      `}} />
    </div>
  );
};
