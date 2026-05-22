import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';
import { GlassCard, GlassButton } from '../components/ui/Glass';
import { Printer, Save, Image as ImageIcon, Layout, Type, Loader2, Eye, BrainCircuit } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { EVALUATION_CRITERIA } from '../constants';
import { Criterion } from '../types';
import { logAction } from '../lib/audit';

export const PrintSettingsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    schoolName: 'مدارس الأوائل الأهلية',
    logoUrl: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    headerLeft: 'المملكة العربية السعودية\nوزارة التعليم\nإدارة التعليم بمحافظة ...',
    headerCenter: 'تقرير أداء معلم',
    headerRight: 'مدارس الأوائل الأهلية\nقسم الإشراف التربوي',
    footerText: 'تم استخراج هذا التقرير آلياً من نظام الأوائل لتقييم الأداء',
    reportTitle: 'استمارة تقييم المعلم',
    tablePadding: 4,
    reportFontSize: 10,
    reportLineHeight: 1.5,
    marginTop: 15,
    marginBottom: 15,
    marginLeft: 10,
    marginRight: 10,
    showAiInPrint: true,
    orientation: 'portrait',
    footerFontSize: 8,
    footerAlignment: 'center',
    headerLeftAlign: 'left',
    headerCenterAlign: 'center',
    headerRightAlign: 'right',
    primaryColor: '#1e293b',
    secondaryColor: '#3b82f6',
    textColor: '#1e293b',
    borderColor: '#e2e8f0',
    criteria: [] as Criterion[]
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'app');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setConfig(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (error) {
        console.error('Error fetching config:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'app'), {
        ...config,
        updatedAt: serverTimestamp()
      }, { merge: true });
      logAction('CONFIG_UPDATED', 'app', 'config', 'تم تحديث إعدادات الطباعة والهوية');
      toast.success('تم حفظ إعدادات الطباعة بنجاح');
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
        <p className="text-white/40">جاري تحميل الإعدادات...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20" dir="rtl">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Printer className="text-blue-400" />
          إعدادات طباعة التقارير
        </h1>
        <p className="text-white/40">تخصيص مظهر وشعار وبيانات رأس وتذييل تقارير التقييم الورقية.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <GlassCard className="p-6 space-y-6">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <ImageIcon size={20} />
              <h2 className="font-bold">الشعار والهوية</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-2">شعار المدرسة</label>
                <div className="flex flex-col gap-3">
                  <div className="relative group">
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 1024 * 1024) {
                            toast.error('حجم الصورة كبير جداً (الأقصى 1 ميجابايت)');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setConfig({ ...config, logoUrl: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                      id="logo-upload"
                    />
                    <label 
                      htmlFor="logo-upload"
                      className="flex items-center justify-center gap-3 w-full bg-white/5 border border-white/10 border-dashed rounded-xl px-4 py-8 text-sm hover:border-blue-500/50 hover:bg-white/10 transition-all cursor-pointer group"
                    >
                      <ImageIcon className="text-white/20 group-hover:text-blue-400 font-bold" size={24} />
                      <span className="font-bold">انقر لتحميل الشعار من جهازك</span>
                    </label>
                  </div>
                  <p className="text-[10px] text-white/20 text-center">يفضل استخدام صور شفافة (PNG) وبحجم لا يتجاوز 1 ميجابايت</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className="shrink-0 h-16 w-16 bg-white rounded-xl overflow-hidden flex items-center justify-center p-1">
                  {config.logoUrl ? (
                    <img src={config.logoUrl} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="text-gray-200" size={24} />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold">معاينة الشعار</h4>
                  <p className="text-[10px] text-white/40">سيظهر هذا الشعار في أعلى التقرير المطبوع.</p>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-6">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Layout size={20} />
              <h2 className="font-bold">رأس التقرير (Header)</h2>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-white/40">النص الأيمن (رأس الصفحة)</label>
                  <select 
                    value={config.headerRightAlign}
                    onChange={e => setConfig({ ...config, headerRightAlign: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none"
                  >
                    <option value="right">يمين</option>
                    <option value="center">وسط</option>
                    <option value="left">يسار</option>
                  </select>
                </div>
                <textarea 
                  rows={3}
                  value={config.headerRight}
                  onChange={e => setConfig({ ...config, headerRight: e.target.value })}
                  style={{ textAlign: config.headerRightAlign as any }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all resize-none"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-white/40">النص الأوسط (رأس الصفحة)</label>
                  <select 
                    value={config.headerCenterAlign}
                    onChange={e => setConfig({ ...config, headerCenterAlign: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none"
                  >
                    <option value="right">يمين</option>
                    <option value="center">وسط</option>
                    <option value="left">يسار</option>
                  </select>
                </div>
                <textarea 
                  rows={2}
                  value={config.headerCenter}
                  onChange={e => setConfig({ ...config, headerCenter: e.target.value })}
                  style={{ textAlign: config.headerCenterAlign as any }}
                  placeholder="مثال: تقرير تقييم أداء معلم"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500/50 outline-none transition-all resize-none"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs text-white/40">النص الأيسر (رأس الصفحة)</label>
                  <select 
                    value={config.headerLeftAlign}
                    onChange={e => setConfig({ ...config, headerLeftAlign: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] outline-none"
                  >
                    <option value="right">يمين</option>
                    <option value="center">وسط</option>
                    <option value="left">يسار</option>
                  </select>
                </div>
                <textarea 
                  rows={3}
                  value={config.headerLeft}
                  onChange={e => setConfig({ ...config, headerLeft: e.target.value })}
                  style={{ textAlign: config.headerLeftAlign as any }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all resize-none"
                />
              </div>

              <div className="pt-2">
                <label className="block text-xs text-white/40 mb-2">العنوان الفرعي للتقرير</label>
                <input 
                  type="text"
                  value={config.reportTitle}
                  onChange={e => setConfig({ ...config, reportTitle: e.target.value })}
                  placeholder="مثال: استمارة الزيارة الصفية والتقييم الفني"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                />
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <div className="sticky top-6 space-y-6 z-10">
            <GlassCard className="p-4 md:p-6 border-emerald-500/20 bg-emerald-500/10 shadow-emerald-500/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2 text-emerald-400">
                  <Eye size={20} />
                  معاينة حية وتفاعلية للتقرير
                </h3>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase font-black">
                  Live Preview
                </div>
              </div>
              
              <div className="bg-black/20 rounded-xl p-4 md:p-8 flex justify-center overflow-hidden">
                <div 
                  className={cn(
                    "bg-white shadow-2xl relative overflow-hidden text-black transition-all duration-300 origin-center scale-90",
                    config.orientation === 'landscape' ? "w-full aspect-[1.414/1]" : "w-full max-w-[280px] aspect-[1/1.414]"
                  )}
                  style={{
                    paddingTop: `${config.marginTop / 1.5}px`,
                    paddingBottom: `${config.marginBottom / 1.5}px`,
                    paddingLeft: `${config.marginLeft / 1.5}px`,
                    paddingRight: `${config.marginRight / 1.5}px`,
                    color: config.textColor,
                    fontSize: `${config.reportFontSize / 2}px`,
                    lineHeight: config.reportLineHeight
                  }}
                >
                  {/* Margin Guides */}
                  <div className="absolute inset-0 border border-dashed border-emerald-500/10 pointer-events-none" />

                  {/* Header */}
                  <div 
                    className="flex justify-between items-start border-b mb-3 pb-1.5"
                    style={{ borderColor: config.borderColor || config.primaryColor }}
                  >
                    <div className="text-[4px] whitespace-pre-line flex-1" style={{ textAlign: config.headerRightAlign as any, color: config.textColor }}>{config.headerRight}</div>
                    <div className="flex flex-col items-center flex-1 px-1" style={{ textAlign: config.headerCenterAlign as any }}>
                      {config.logoUrl ? (
                        <img src={config.logoUrl} alt="Logo" className="h-5 w-10 object-contain mb-0.5" />
                      ) : (
                        <div className="h-4 w-4 rounded bg-gray-100 mb-0.5" />
                      )}
                      <div className="text-[6px] font-bold whitespace-pre-line leading-tight" style={{ color: config.primaryColor }}>{config.headerCenter}</div>
                      <div className="text-[4px] font-medium opacity-60 truncate max-w-full" style={{ color: config.textColor }}>{config.reportTitle}</div>
                    </div>
                    <div className="text-[4px] whitespace-pre-line flex-1" style={{ textAlign: config.headerLeftAlign as any, color: config.textColor }}>{config.headerLeft}</div>
                  </div>

                  {/* Body Content Preview */}
                  <div className="space-y-2">
                    <div 
                      className="p-1.5 border rounded-md text-[4px] flex justify-between"
                      style={{ borderColor: config.borderColor || config.primaryColor, backgroundColor: `${config.primaryColor}08` }}
                    >
                      <div className="space-y-0.5">
                        <p className="flex gap-1"><span className="font-bold">المعلم:</span> <span>محمد العبدالله</span></p>
                        <p className="flex gap-1"><span className="font-bold">المادة:</span> <span>الرياضيات</span></p>
                      </div>
                      <div className="text-left space-y-0.5">
                        <p className="flex gap-1 justify-end"><span className="font-bold">التاريخ:</span> <span>2024/05/15</span></p>
                        <p className="flex gap-1 justify-end"><span className="font-bold">المقيم:</span> <span>مشرف تربوي</span></p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <table className="w-full text-[3.5px] border-collapse">
                        <thead>
                          <tr style={{ backgroundColor: config.primaryColor, color: '#fff' }}>
                            <th className="p-0.5 text-right w-[60%]">المعيار</th>
                            <th className="p-0.5 text-center">الدرجة</th>
                            <th className="p-0.5 text-right">الملاحظات</th>
                          </tr>
                        </thead>
                        <tbody className="border" style={{ borderColor: config.borderColor || config.primaryColor }}>
                          {(config.criteria && config.criteria.length > 0 ? config.criteria.slice(0, 3) : EVALUATION_CRITERIA.slice(0, 3)).map((c, i) => (
                            <tr key={i} className="border-b" style={{ borderColor: config.borderColor || `${config.primaryColor}20` }}>
                              <td className="p-0.5 text-right truncate max-w-[50px]">{c.label}</td>
                              <td className="p-0.5 text-center">{c.maxScore}/{c.maxScore}</td>
                              <td className="p-0.5 text-right italic opacity-40">تم الإنجاز...</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* AI / Secondary Color Preview */}
                    {config.showAiInPrint && (
                      <div 
                        className="p-1.5 border rounded-md border-dashed"
                        style={{ borderColor: `${config.secondaryColor}40`, backgroundColor: `${config.secondaryColor}08` }}
                      >
                        <p className="text-[5px] font-bold mb-0.5" style={{ color: config.secondaryColor }}>التحليل الذكي (AI Analysis)</p>
                        <div className="h-0.5 w-full bg-gray-100 mb-0.5"></div>
                        <div className="h-0.5 w-3/4 bg-gray-100"></div>
                      </div>
                    )}

                    {/* Signatures */}
                    <div className="grid grid-cols-3 gap-1 pt-2">
                      <div className="border-t pt-0.5 text-[3px] text-center" style={{ borderColor: config.borderColor || config.primaryColor, color: config.textColor }}>توقيع المعلم</div>
                      <div className="border-t pt-0.5 text-[3px] text-center" style={{ borderColor: config.borderColor || config.primaryColor, color: config.textColor }}>توقيع المقيم</div>
                      <div className="border-t pt-0.5 text-[3px] text-center" style={{ borderColor: config.borderColor || config.primaryColor, color: config.textColor }}>قائد المدرسة</div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div 
                    className="absolute bottom-3 left-6 right-6 border-t pt-0.5" 
                    style={{ 
                      fontSize: `${(config.footerFontSize || 8) / 2}px`, 
                      textAlign: (config.footerAlignment || 'center') as any,
                      borderColor: config.borderColor || `${config.primaryColor}30`,
                      color: config.textColor,
                      opacity: 0.6
                    }}
                  >
                    {config.footerText}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-6 space-y-6">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Type size={20} />
              <h2 className="font-bold">تنسيق التقرير العام</h2>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs text-white/40 mb-2">حجم الخط الرئيسي (بكسل)</label>
                   <input 
                    type="number"
                    min="6"
                    max="16"
                    value={config.reportFontSize}
                    onChange={e => setConfig({ ...config, reportFontSize: parseInt(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                   />
                </div>
                <div>
                   <label className="block text-xs text-white/40 mb-2">تباعد الأسطر (Line Height)</label>
                   <input 
                    type="number"
                    step="0.1"
                    min="1"
                    max="3"
                    value={config.reportLineHeight}
                    onChange={e => setConfig({ ...config, reportLineHeight: parseFloat(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                   />
                </div>
                <div>
                   <label className="block text-xs text-white/40 mb-2">حشو الجداول (بكسل)</label>
                   <input 
                    type="number"
                    min="0"
                    max="20"
                    value={config.tablePadding}
                    onChange={e => setConfig({ ...config, tablePadding: parseInt(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                   />
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <Layout size={18} />
                  <h3 className="text-sm font-bold">ألوان الهوية والتقارير</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">اللون الأساسي (للعناوين والجداول)</label>
                    <div className="flex gap-2">
                       <input 
                        type="color"
                        value={config.primaryColor}
                        onChange={e => setConfig({ ...config, primaryColor: e.target.value })}
                        className="h-10 w-10 bg-white/5 border border-white/10 rounded-lg cursor-pointer"
                       />
                       <input 
                        type="text"
                        value={config.primaryColor}
                        onChange={e => setConfig({ ...config, primaryColor: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono focus:border-blue-500/50 outline-none transition-all uppercase"
                       />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">اللون الثانوي (للمؤشرات واللمسات)</label>
                    <div className="flex gap-2">
                       <input 
                        type="color"
                        value={config.secondaryColor}
                        onChange={e => setConfig({ ...config, secondaryColor: e.target.value })}
                        className="h-10 w-10 bg-white/5 border border-white/10 rounded-lg cursor-pointer"
                       />
                       <input 
                        type="text"
                        value={config.secondaryColor}
                        onChange={e => setConfig({ ...config, secondaryColor: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono focus:border-blue-500/50 outline-none transition-all uppercase"
                       />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">لون النص الأساسي</label>
                    <div className="flex gap-2">
                       <input 
                        type="color"
                        value={config.textColor}
                        onChange={e => setConfig({ ...config, textColor: e.target.value })}
                        className="h-10 w-10 bg-white/5 border border-white/10 rounded-lg cursor-pointer"
                       />
                       <input 
                        type="text"
                        value={config.textColor}
                        onChange={e => setConfig({ ...config, textColor: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono focus:border-blue-500/50 outline-none transition-all uppercase"
                       />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">لون الحدود والفواصل</label>
                    <div className="flex gap-2">
                       <input 
                        type="color"
                        value={config.borderColor}
                        onChange={e => setConfig({ ...config, borderColor: e.target.value })}
                        className="h-10 w-10 bg-white/5 border border-white/10 rounded-lg cursor-pointer"
                       />
                       <input 
                        type="text"
                        value={config.borderColor}
                        onChange={e => setConfig({ ...config, borderColor: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-mono focus:border-blue-500/50 outline-none transition-all uppercase"
                       />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center gap-2 text-blue-400 mb-4">
                  <Layout size={18} />
                  <h3 className="text-sm font-bold">هوامش الصفحة والقياسات (مم)</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">الهامش العلوي (Top)</label>
                    <div className="relative group">
                      <input 
                        type="number"
                        value={config.marginTop}
                        min="0"
                        max="100"
                        onChange={e => setConfig({ ...config, marginTop: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-blue-500/50 outline-none transition-all pr-10"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-white/20">مم</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">الهامش السفلي (Bottom)</label>
                    <div className="relative group">
                      <input 
                        type="number"
                        value={config.marginBottom}
                        min="0"
                        max="100"
                        onChange={e => setConfig({ ...config, marginBottom: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-blue-500/50 outline-none transition-all pr-10"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-white/20">مم</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">الهامش الأيمن (Right)</label>
                    <div className="relative group">
                      <input 
                        type="number"
                        value={config.marginRight}
                        min="0"
                        max="100"
                        onChange={e => setConfig({ ...config, marginRight: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-blue-500/50 outline-none transition-all pr-10"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-white/20">مم</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">الهامش الأيسر (Left)</label>
                    <div className="relative group">
                      <input 
                        type="number"
                        value={config.marginLeft}
                        min="0"
                        max="100"
                        onChange={e => setConfig({ ...config, marginLeft: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-blue-500/50 outline-none transition-all pr-10"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-white/20">مم</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-[10px] text-white/40 mb-1">اتجاه الصفحة</label>
                  <select 
                    value={config.orientation || 'portrait'}
                    onChange={e => setConfig({ ...config, orientation: e.target.value as any })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-blue-500/50 outline-none transition-all appearance-none"
                  >
                    <option value="portrait">طولي (Portrait)</option>
                    <option value="landscape">عرضي (Landscape)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
                      <BrainCircuit size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold group-hover:text-blue-400 transition-colors">إظهار التحليل الذكي (AI)</h4>
                      <p className="text-[10px] text-white/40">تضمين التحليل الاستراتيجي من الذكاء الاصطناعي في النسخة المطبوعة.</p>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox"
                      className="sr-only"
                      checked={config.showAiInPrint}
                      onChange={e => setConfig({ ...config, showAiInPrint: e.target.checked })}
                    />
                    <div className={cn(
                      "block w-10 h-6 rounded-full transition-colors",
                      config.showAiInPrint ? "bg-blue-600" : "bg-white/10"
                    )}></div>
                    <div className={cn(
                      "dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform",
                      config.showAiInPrint ? "translate-x-4" : ""
                    )}></div>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <Type size={18} />
                  <h3 className="text-sm font-bold">إدارة تذييل التقرير (Footer)</h3>
                </div>
                
                <div>
                  <label className="block text-xs text-white/40 mb-2">نص التذييل الموحد</label>
                  <textarea 
                    rows={2}
                    value={config.footerText}
                    onChange={e => setConfig({ ...config, footerText: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all resize-none font-sans"
                    placeholder="مثال: تم استخراج هذا التقرير آلياً..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">حجم خط التذييل</label>
                    <input 
                      type="number"
                      min="6"
                      max="14"
                      value={config.footerFontSize}
                      onChange={e => setConfig({ ...config, footerFontSize: parseInt(e.target.value) })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-blue-500/50 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1">محاذاة النص</label>
                    <select 
                      value={config.footerAlignment}
                      onChange={e => setConfig({ ...config, footerAlignment: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-blue-500/50 outline-none transition-all appearance-none"
                    >
                      <option value="right">يمين (للغة العربية)</option>
                      <option value="center">توسيط (Center)</option>
                      <option value="left">يسار (Left)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]">
        <GlassButton 
          onClick={handleSave} 
          disabled={saving}
          className="bg-blue-600 px-12 py-4 flex items-center gap-3 text-lg font-black"
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          حفظ جميع الإعدادات
        </GlassButton>
      </div>
    </div>
  );
};
