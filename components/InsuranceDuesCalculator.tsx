// FIX: Import `useImperativeHandle` hook to resolve "Cannot find name" error.
import React, { useState, useCallback, useEffect, useMemo, useRef, useImperativeHandle } from 'react';
import { InsuranceDuesFormData, LawType, DuesType, ArrearsPeriod } from '../types';
import { pensionTables as defaultPensionTables } from './data';
import { InfoIcon, UndoIcon, ChevronDownIcon } from './Icons';

// --- Reusable Form Components ---
// Note: FormRow and Field components were removed in favor of a more flexible grid system
// using direct Tailwind CSS classes for better responsive control.

// --- Helper Functions (Moved outside component for purity) ---
const convertArabicNumerals = (str: string | undefined): string => {
    if (!str) return '';
    return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
};

const parseArabicDate = (dateStr: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const westernNumerals = convertArabicNumerals(dateStr);
        const parts = westernNumerals.split(/[\/-]/);
        
        // Handle D/M/Y format
        if (parts.length === 3 && parts[2].length === 4) {
             const d = Number(parts[0]);
             const m = Number(parts[1]) - 1;
             const y = Number(parts[2]);
             return new Date(Date.UTC(y, m, d));
        }
        // Handle Y/M/D format (from fixed tables)
        if (parts.length === 3 && parts[0].length === 4) {
            const y = Number(parts[0]);
            const m = Number(parts[1]) - 1;
            const d = Number(parts[2]);
            return new Date(Date.UTC(y, m, d));
        }

        return null;
    } catch (e) { return null; }
};

// --- Tab Component ---
interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`relative px-4 py-3 text-sm font-semibold rounded-t-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-bg)] focus:ring-[var(--primary)]
    ${
      isActive
        ? 'text-[var(--primary)]'
        : 'text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]'
    }`}
    aria-selected={isActive}
    role="tab"
  >
    {label}
    {isActive && <span className="absolute bottom-0 right-0 left-0 h-1 bg-[var(--primary)] rounded-full"></span>}
  </button>
);


const defaultFormData: InsuranceDuesFormData = {
  lawType: '',
  insuranceNumber: '',
  pensionerName: '',
  dateOfBirth: '',
  dateOfDeath: '',
  pensionEntitlementDate: '',
  normalBasicPension: 0,
  injuryBasicPension: 0,
  variablePension: 0,
  specialBonuses: 0,
  totalBasicBonuses: 0,
  duesType: '',
  multiplePeriods: 'no',
  arrearsStartDate: '',
  arrearsEndDate: '',
  entitlementPercentage: 100,
  periods: Array(5).fill({ startDate: '', endDate: '', percentage: 100 }),
  hasDeductions: 'no',
  deductions: {
    nasserBankInstallments: { active: false, amount: 0 },
    governmentFund: { active: false, amount: 0 },
    privateFund: { active: false, amount: 0 },
    alimony: { active: false, amount: 0 },
    other: { active: false, amount: 0 },
  },
  severanceDate: '',
  severancePercentage: 100,
  noBeneficiaries: false,
};


// --- Modal Component for Pension Progression ---
const CloseIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
    </svg>
);

interface ProgressionStep {
    date: Date;
    description: string;
    pensionBefore: number;
    bonusPercentage?: string;
    bonusAmount: number;
    minUplift: number;
    pensionAfter: number;
    references?: number[];
}

interface ProgressionData {
    summary: {
        basicPensionAtEntitlement?: number;
        variablePensionAtEntitlement?: number;
        upliftValue?: number;
        monthlyGrant?: number;
        minimumPensionUplifts?: { date: string; amount: number }[];
        exceptionalGrants?: { date: string; amount: number }[];
        initialNormalBasicPension?: number;
        initialInjuryPension?: number;
        initialVariablePension?: number;
        initialSpecialBonuses?: number;
    };
    steps: ProgressionStep[];
}

interface OtherProgression {
    name: string;
    data: ProgressionData;
    refNumber: number;
    notes?: string[];
}

interface AllProgressionsData {
    mainProgression: ProgressionData;
    otherProgressions: OtherProgression[];
}


interface PensionProgressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: AllProgressionsData | null;
  entitlementDate: string;
  formData: InsuranceDuesFormData;
}

// Reusable Summary Component
const SummaryItem: React.FC<{label: string, value: string | number}> = ({label, value}) => (
     <div className="bg-[var(--surface-container)] p-3 rounded-lg border border-green-400/60 shadow-[0_0_8px_rgba(74,222,128,0.5)] transition-all duration-300 hover:shadow-[0_0_15px_rgba(74,222,128,0.7)] hover:border-green-300/80">
        <p className="text-[var(--on-surface-variant)] text-xs">{label}</p>
        <p className="font-bold text-[var(--on-surface)] font-mono text-lg mt-1">{value}</p>
    </div>
);

const ProgressionSummary: React.FC<{ summary: ProgressionData['summary'], entitlementDate: string }> = ({ summary, entitlementDate }) => {
    const formatCurrency = (val: number | undefined) => (val ?? 0).toFixed(2);
    const formatDateDisplay = (dateStr: string | undefined): string => {
      if (!dateStr) return '-';
      if (dateStr.match(/^\d{4}-\d{2}$/)) { // For YYYY-MM entitlementDate
          const [y, m] = dateStr.split('-');
          return `${m}/${y}`;
      }
      return dateStr;
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            <SummaryItem label="تاريخ استحقاق المعاش" value={formatDateDisplay(entitlementDate)} />
            {typeof summary.basicPensionAtEntitlement === 'number' && <SummaryItem label="المعاش الأساسي (عند الاستحقاق)" value={formatCurrency(summary.basicPensionAtEntitlement)} />}
            {typeof summary.variablePensionAtEntitlement === 'number' && <SummaryItem label="المعاش المتغير (عند الاستحقاق)" value={formatCurrency(summary.variablePensionAtEntitlement)} />}
            {typeof summary.upliftValue === 'number' && <SummaryItem label="مادة الرفع" value={formatCurrency(summary.upliftValue)} />}
            {typeof summary.monthlyGrant === 'number' && <SummaryItem label="المنحة الشهرية" value={formatCurrency(summary.monthlyGrant)} />}
            {summary.minimumPensionUplifts?.map((uplift, index) => (
                 <SummaryItem key={`uplift-${index}`} label={`فرق رفع الحد الأدنى (${uplift.date})`} value={formatCurrency(uplift.amount)} />
            ))}
            {summary.exceptionalGrants?.map((grant, index) => (
                 <SummaryItem key={`grant-${index}`} label={`منحة استثنائية (${grant.date.split('-').reverse().join('/')})`} value={formatCurrency(grant.amount)} />
            ))}
        </div>
    );
}

const ReferencedProgressionPopup: React.FC<{ table: OtherProgression, onClose: () => void, entitlementDate: string }> = ({ table, onClose, entitlementDate }) => (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
        <div className="bg-[var(--surface)] border border-[var(--outline)] rounded-2xl shadow-elevation-5 w-full max-w-5xl max-h-[90vh] flex flex-col animate-modal-content-show" onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                <h3 className="text-lg font-bold text-[var(--on-surface)]">تدرج المعاش وفقاً لـ: {table.name}</h3>
                <button onClick={onClose} className="p-2 text-[var(--on-surface-variant)] rounded-full hover:bg-[color-mix(in_srgb,_var(--on-surface)_8%,_transparent)]">
                    <CloseIcon />
                </button>
            </header>
            <main className="p-4 overflow-y-auto space-y-4">
                 {table.notes && table.notes.length > 0 && (
                    <div className="p-3 bg-yellow-100/40 dark:bg-yellow-900/20 rounded-xl border border-yellow-500/30 text-sm text-[var(--on-surface)]">
                        <h4 className="font-semibold mb-2">ملاحظات الجدول:</h4>
                        <ul className="list-disc list-inside space-y-1 text-[var(--on-surface-variant)]">
                            {table.notes.map((note, index) => <li key={index}>{note}</li>)}
                        </ul>
                    </div>
                )}
                 <div className="p-4 bg-blue-100/30 dark:bg-blue-900/20 rounded-xl border border-[var(--outline-variant)]">
                    <h4 className="font-semibold text-[var(--on-surface)] mb-3">ملخص القيم الأساسية (وفقاً لهذا الجدول)</h4>
                    <ProgressionSummary summary={table.data.summary} entitlementDate={entitlementDate} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm text-center">
                        <thead className="bg-[var(--surface-container)] sticky top-0">
                            <tr>
                                <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)] text-right w-1/4">البيان</th>
                                <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">المعاش قبل</th>
                                <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نسبة العلاوة</th>
                                <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">قيمة العلاوة</th>
                                <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">رفع الحد الأدنى</th>
                                <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)] bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]">إجمالي المعاش</th>
                            </tr>
                        </thead>
                        <tbody>
                            {table.data.steps.filter(step => step.pensionAfter > 0).map((step, index) => (
                                <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0 hover:bg-[var(--surface-container-highest)]">
                                    <td className="p-2 text-[var(--on-surface)] font-semibold text-right">{step.description}</td>
                                    <td className="p-2 text-[var(--on-surface-variant)] font-mono">{step.pensionBefore.toFixed(2)}</td>
                                    <td className="p-2 text-[var(--on-surface)] font-mono">{step.bonusPercentage || '-'}</td>
                                    <td className="p-2 text-[var(--on-surface)] font-mono">{step.bonusAmount > 0 ? step.bonusAmount.toFixed(2) : '-'}</td>
                                    <td className="p-2 text-[var(--on-surface)] font-mono">{step.minUplift > 0 ? step.minUplift.toFixed(2) : '-'}</td>
                                    <td className="p-2 text-[var(--on-tertiary-container)] font-bold font-mono bg-[var(--tertiary-container)]">{step.pensionAfter.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    </div>
);


const PensionProgressionModal: React.FC<PensionProgressionModalProps> = ({ isOpen, onClose, data, entitlementDate, formData }) => {
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [activePopup, setActivePopup] = useState<OtherProgression | null>(null);

  const mainProgressionSteps = useMemo(() => {
    if (!data?.mainProgression.steps) return [];

    const start = filterStartDate ? new Date(`${filterStartDate}-01T00:00:00Z`) : null;
    const end = filterEndDate ? new Date(`${filterEndDate}-01T00:00:00Z`) : null;

    if (start) start.setUTCDate(1);
    if (end) end.setUTCMonth(end.getUTCMonth() + 1, 0);

    return data.mainProgression.steps.filter(step => {
      const stepDate = step.date;
      const isAfterStart = start ? stepDate >= start : true;
      const isBeforeEnd = end ? stepDate <= end : true;
      return isAfterStart && isBeforeEnd;
    });
  }, [data?.mainProgression.steps, filterStartDate, filterEndDate]);
  
  const formatDateDisplay = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) { // YYYY-MM-DD
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }
    if (dateStr.match(/^\d{4}-\d{2}$/)) { // YYYY-MM
        const [y, m] = dateStr.split('-');
        return `${m}/${y}`;
    }
    if (dateStr.match(/^\d{4}\/\d{2}\/\d{2}$/)) { // YYYY/MM/DD
         const [y, m, d] = dateStr.split('/');
         return `${d}/${m}/${y}`;
    }
    return dateStr;
  };

  const parseDateYYYYMM = (dateStr: string | undefined): Date | null => {
      if (!dateStr || !dateStr.includes('-')) return null;
      const [year, month] = dateStr.split('-').map(Number);
      if (isNaN(year) || isNaN(month)) return null;
      return new Date(Date.UTC(year, month - 1, 1));
  };
  
  const summaryItemsToDisplay = useMemo(() => {
    if (!data?.mainProgression.summary) return [];

    const originalSummary = data.mainProgression.summary;
    const lawType = formData.lawType;

    const hasUpliftStep = mainProgressionSteps.some(s => s.description.includes('مادة الرفع'));
    const upliftValue = hasUpliftStep ? (originalSummary.upliftValue ?? 0) : 0;
    
    const totalMinUplift = mainProgressionSteps.reduce((acc, step) => acc + (step.minUplift ?? 0), 0);
    
    const endFilterDate = filterEndDate ? new Date(Date.UTC(parseInt(filterEndDate.substring(0,4)), parseInt(filterEndDate.substring(5,7)), 0)) : null;

    const items: {label: string, value: string | number}[] = [
        { label: "تاريخ استحقاق المعاش", value: formatDateDisplay(entitlementDate)}
    ];

    if (lawType === '79-1975') {
        if(originalSummary.initialNormalBasicPension) items.push({ label: 'المعاش الأساسي الطبيعي (عند الاستحقاق)', value: (originalSummary.initialNormalBasicPension).toFixed(2) });
        if(originalSummary.initialInjuryPension) items.push({ label: 'المعاش الأساسي الإصابي (عند الاستحقاق)', value: (originalSummary.initialInjuryPension).toFixed(2) });
        if((originalSummary.initialVariablePension ?? 0) + (originalSummary.initialSpecialBonuses ?? 0) > 0) items.push({ label: 'إجمالي المعاش المتغير (عند الاستحقاق)', value: ((originalSummary.initialVariablePension ?? 0) + (originalSummary.initialSpecialBonuses ?? 0)).toFixed(2) });
    } else if (lawType === '108-1976') {
        if(originalSummary.initialNormalBasicPension) items.push({ label: 'إجمالي المعاش (عند الاستحقاق)', value: (originalSummary.initialNormalBasicPension).toFixed(2) });
    } else if (lawType === '148-2019') {
        if(originalSummary.initialNormalBasicPension) items.push({ label: 'المعاش الأساسي الطبيعي (عند الاستحقاق)', value: (originalSummary.initialNormalBasicPension).toFixed(2) });
        if(originalSummary.initialInjuryPension) items.push({ label: 'المعاش الأساسي الإصابي (عند الاستحقاق)', value: (originalSummary.initialInjuryPension).toFixed(2) });
    } else { // Fallback for 112/Sadat
        if (typeof originalSummary.basicPensionAtEntitlement === 'number') items.push({ label: "المعاش الأساسي (عند الاستحقاق)", value: originalSummary.basicPensionAtEntitlement.toFixed(2) });
    }
    
    if (upliftValue > 0) items.push({ label: "مادة الرفع", value: upliftValue.toFixed(2) });
    if (totalMinUplift > 0) items.push({ label: "إجمالي فرق رفع الحد الأدنى", value: totalMinUplift.toFixed(2) });
    
    if (originalSummary.monthlyGrant) {
        items.push({ label: "المنحة الشهرية", value: (originalSummary.monthlyGrant).toFixed(2) });
    }
    
    (originalSummary.exceptionalGrants ?? []).forEach(grant => {
        const grantDate = parseDateYYYYMM(grant.date);
        if (!endFilterDate || (grantDate && grantDate <= endFilterDate)) {
            items.push({ label: `منحة استثنائية (${grant.date.split('-').reverse().join('/')})`, value: grant.amount.toFixed(2) });
        }
    });

    return items;
  }, [data, mainProgressionSteps, entitlementDate, formData.lawType, filterEndDate]);


  if (!isOpen || !data) return null;
  const formatCurrency = (val: number | undefined) => (val ?? 0).toFixed(2);

  const handleResetFilter = () => {
    setFilterStartDate('');
    setFilterEndDate('');
  };



  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in-fast">
      <div 
        className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-4 w-full max-w-6xl max-h-[90vh] flex flex-col animate-modal-content-show"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)] sticky top-0 bg-[var(--surface-container-high)] rounded-t-3xl">
          <h2 id="modal-title" className="text-xl font-bold text-[var(--on-surface)]">
            تدرج المعاش الشهري
          </h2>
          <button onClick={onClose} className="p-2 text-[var(--on-surface-variant)] rounded-full hover:bg-[color-mix(in_srgb,_var(--on-surface)_8%,_transparent)]">
            <CloseIcon />
          </button>
        </header>
        <main className="p-6 overflow-y-auto space-y-6">
            <div className="p-4 bg-blue-100/30 dark:bg-blue-900/20 rounded-2xl border border-[var(--outline-variant)]">
                <h3 className="font-semibold text-[var(--on-surface)] mb-3">ملخص القيم الأساسية (وفقاً للبيانات المعروضة)</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                    {summaryItemsToDisplay.map(item => <SummaryItem key={item.label} label={item.label} value={item.value} />)}
                </div>
            </div>

            <div className="p-4 bg-[var(--surface-container)] rounded-2xl border border-[var(--outline-variant)] bg-gradient-to-br from-[var(--surface-container)] to-[var(--surface-container-high)]">
                <h3 className="font-semibold text-[var(--on-surface)] mb-3">فلترة النتائج حسب الفترة</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label htmlFor="filterStartDate" className="text-sm font-medium text-[var(--on-surface-variant)]">تاريخ البدء</label>
                        <input
                            type="month"
                            id="filterStartDate"
                            value={filterStartDate}
                            onChange={(e) => setFilterStartDate(e.target.value)}
                            className="input-style mt-1 filter-input"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="filterEndDate" className="text-sm font-medium text-[var(--on-surface-variant)]">تاريخ الانتهاء</label>
                        <input
                            type="month"
                            id="filterEndDate"
                            value={filterEndDate}
                            onChange={(e) => setFilterEndDate(e.target.value)}
                            className="input-style mt-1 filter-input"
                            min={filterStartDate}
                        />
                    </div>
                    <div className="md:col-span-1">
                        <button
                            onClick={handleResetFilter}
                            className="w-full px-4 py-3 bg-gradient-to-br from-[var(--tertiary)] to-[color-mix(in_srgb,_var(--tertiary)_80%,_var(--primary))] text-white font-semibold rounded-xl hover:shadow-lg transition-all border border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface)] focus:ring-[var(--tertiary)] shadow-[0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)] transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            إعادة تعيين
                        </button>
                    </div>
                </div>
            </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm text-center">
                <thead className="bg-[var(--surface-container)] sticky top-0">
                <tr>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)] text-right w-1/4">البيان</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">المعاش قبل العلاوة</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نسبة العلاوة</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">قيمة العلاوة</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">رفع الحد الأدنى</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)] bg-[var(--secondary-container)] text-[var(--on-secondary-container)]">إجمالي المعاش</th>
                </tr>
                </thead>
                <tbody>
                {mainProgressionSteps.filter(step => step.pensionAfter > 0).map((step, index) => (
                    <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0 hover:bg-[var(--surface-container-highest)]">
                        <td className="p-3 text-[var(--on-surface)] font-semibold text-right">{step.description}</td>
                        <td className="p-3 text-[var(--on-surface-variant)] font-mono">{formatCurrency(step.pensionBefore)}</td>
                        <td className="p-3 text-[var(--on-surface)] font-mono">{step.bonusPercentage || '-'}</td>
                        <td className="p-3 text-[var(--on-surface)] font-mono">{step.bonusAmount > 0 ? formatCurrency(step.bonusAmount) : '-'}</td>
                        <td className="p-3 text-[var(--on-surface)] font-mono">{step.minUplift > 0 ? formatCurrency(step.minUplift) : '-'}</td>
                        <td className="p-3 text-[var(--on-secondary-container)] font-bold font-mono bg-[var(--secondary-container)]">
                            <div className="flex items-center justify-center gap-2">
                                <span>{formatCurrency(step.pensionAfter)}</span>
                                {step.references && step.references.length > 0 && (
                                    <span className="flex items-center gap-1">
                                    {step.references.map((refNum) => {
                                        const otherProg = data.otherProgressions.find(p => p.refNumber === refNum);
                                        if (!otherProg) return null;
                                        return (
                                            <sup key={refNum}>
                                                <button 
                                                    onClick={() => setActivePopup(otherProg)}
                                                    className="px-1.5 py-0.5 bg-transparent text-[var(--on-secondary-container)] hover:bg-[var(--secondary)] rounded-full focus:outline-none focus:ring-1 focus:ring-[var(--on-secondary-container)]"
                                                    title={`عرض التدرج وفقاً لـ ${otherProg.name}`}
                                                >
                                                    {refNum}
                                                </button>
                                            </sup>
                                        )
                                    })}
                                    </span>
                                )}
                            </div>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
          </div>
        </main>
      </div>
      {activePopup && <ReferencedProgressionPopup table={activePopup} onClose={() => setActivePopup(null)} entitlementDate={entitlementDate} />}
      <style>{`
        .filter-input {
          box-shadow: 0 0 0 0px rgba(74, 222, 128, 0.4);
        }
        .filter-input:focus {
          box-shadow: 0 0 8px 2px rgba(74, 222, 128, 0.5), 0 0 0 2px var(--focus-ring);
        }
      `}</style>
    </div>
  );
};

// --- Types for Structured Results ---
interface CurrentPensionBreakdown {
  currentPension: number;
  monthlyGrant: number;
  exceptionalGrant: number;
  totalEntitlement: number;
  disbursementFee: number;
  netPayable: number;
}

interface CalculationResultData {
    pensionerInfo: { label: string; value: string | number }[];
    userInputInfo: { label: string; value: string | number }[];
    summary: {
        entitlements: { label: string; value: number }[];
        deductions: { label: string; value: number }[];
        totalEntitlements: number;
        totalDeductions: number;
        netPayable: number;
    };
    simpleResultText?: string;
    isError?: boolean;
    arrearsBreakdown?: { period: string; percentage: number; amount: number; months: number }[];
    currentPensionBreakdown?: CurrentPensionBreakdown;
    deductionNotes?: string[];
    deductionWarning?: string;
}


// --- Results Display Component ---
const ResultsDisplay: React.FC<{
    data: CalculationResultData;
    isCurrentPensionVisible: boolean;
    onToggleCurrentPension: () => void;
}> = ({ data, isCurrentPensionVisible, onToggleCurrentPension }) => {
    const formatCurrency = (value: number | undefined) => {
        if (typeof value !== 'number') return '0.00';
        return value.toFixed(2);
    };
    
    if (data.simpleResultText) {
        if (data.isError) {
            return (
                <div className="p-6 bg-[var(--error-container)] rounded-2xl shadow-inner">
                    <h3 className="text-lg font-bold text-[var(--on-error-container)] mb-2">رسالة تحذير:</h3>
                    <p className="text-xl text-[var(--on-error-container)] font-semibold whitespace-pre-wrap break-words">
                        {data.simpleResultText.replace('خطأ في الحساب: ', '')}
                    </p>
                </div>
            );
        }
        return (
            <div className="p-6 bg-[var(--secondary-container)] rounded-2xl shadow-inner">
                <h3 className="text-lg font-bold text-[var(--on-secondary-container)] mb-2">نتائج الحساب:</h3>
                <p className="text-2xl text-[var(--on-secondary-container)] font-mono whitespace-pre-wrap break-words">
                    {data.simpleResultText}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--outline-variant)]">
                <h4 className="font-bold text-[var(--on-surface)] mb-3">1. بيانات صاحب المعاش</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    {data.pensionerInfo.map(item => (
                        <div key={item.label}>
                            <p className="text-[var(--on-surface-variant)]">{item.label}</p>
                            <p className="font-semibold text-[var(--on-surface)]">{item.value || '-'}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--outline-variant)]">
                <h4 className="font-bold text-[var(--on-surface)] mb-3">2. مدخلات الحساب</h4>
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    {data.userInputInfo.map(item => (
                        <div key={item.label}>
                            <p className="text-[var(--on-surface-variant)]">{item.label}</p>
                            <p className="font-semibold text-[var(--on-surface)]">{item.value}</p>
                        </div>
                    ))}
                </div>
            </div>
            
            {data.currentPensionBreakdown && (
                <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--outline-variant)]">
                    <div className="flex justify-between items-center cursor-pointer" onClick={onToggleCurrentPension}>
                        <h4 className="font-bold text-[var(--on-surface)]">المعاش الدوري الحالي</h4>
                        <ChevronDownIcon className={`h-6 w-6 text-[var(--on-surface-variant)] transition-transform duration-300 ${isCurrentPensionVisible ? 'rotate-180' : ''}`} />
                    </div>
                    {isCurrentPensionVisible && (
                        <div className="space-y-2 text-sm max-w-md mx-auto mt-4 pt-4 border-t border-[var(--outline-variant)] animate-fade-in">
                            <div className="flex justify-between items-center py-2">
                                <span className="text-[var(--on-surface-variant)]">المعاش الحالي:</span>
                                <span className="font-semibold font-mono text-[var(--on-surface)]">{formatCurrency(data.currentPensionBreakdown.currentPension)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-[var(--on-surface-variant)]">المنحة الشهرية:</span>
                                <span className="font-semibold font-mono text-[var(--on-surface)]">{formatCurrency(data.currentPensionBreakdown.monthlyGrant)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-[var(--on-surface-variant)]">المنحة الاستثنائية:</span>
                                <span className="font-semibold font-mono text-[var(--on-surface)]">{formatCurrency(data.currentPensionBreakdown.exceptionalGrant)}</span>
                            </div>
                            <hr className="border-[var(--outline-variant)] my-2" />
                            <div className="flex justify-between items-center py-2 text-base">
                                <span className="font-bold text-[var(--on-surface)]">إجمالي المستحق الشهري:</span>
                                <span className="font-bold font-mono text-[var(--on-surface)]">{formatCurrency(data.currentPensionBreakdown.totalEntitlement)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-[var(--error)]">(-) عمولة الصرف:</span>
                                <span className="font-semibold font-mono text-[var(--error)]">{formatCurrency(data.currentPensionBreakdown.disbursementFee)}</span>
                            </div>
                            <hr className="border-[var(--primary)] my-2 border-t-2" />
                            <div className="flex justify-between items-center py-2 text-lg">
                                <span className="font-bold text-[var(--primary)]">صافي المستحق الشهري:</span>
                                <span className="font-bold font-mono text-[var(--primary)]">{formatCurrency(data.currentPensionBreakdown.netPayable)}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {data.arrearsBreakdown && data.arrearsBreakdown.length > 0 && (
                <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--outline-variant)]">
                    <h4 className="font-bold text-[var(--on-surface)] mb-3">تفاصيل فترات المتجمد</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-center">
                            <thead className="bg-[var(--surface-container)]">
                                <tr>
                                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">الفترة</th>
                                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">عدد الشهور</th>
                                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نسبة الاستحقاق</th>
                                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">قيمة المتجمد للفترة</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.arrearsBreakdown.map((item, index) => (
                                    <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0">
                                        <td className="p-3 font-mono">{item.period}</td>
                                        <td className="p-3">{item.months}</td>
                                        <td className="p-3">{item.percentage}%</td>
                                        <td className="p-3 font-semibold font-mono text-[var(--on-surface)]">{formatCurrency(item.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="bg-[var(--surface-container-high)] p-4 rounded-2xl border border-[var(--outline)]">
                <h4 className="font-bold text-[var(--on-surface)] mb-4 text-center text-lg">3. ملخص المستحقات المالية</h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="border-b-2 border-[var(--primary)]">
                                <th className="p-3 font-bold text-md text-[var(--primary)]">المستحقات التأمينية</th>
                                <th className="p-3 font-bold text-md text-[var(--error)]">المبالغ واجبة الخصم</th>
                                <th className="p-3 font-bold text-md text-[var(--primary)]">صافي المستحق للصرف</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="p-2 pt-4 text-right font-semibold bg-[var(--surface-container)] text-[var(--on-surface)]" colSpan={3}>بيان الاستحقاقات</td>
                            </tr>
                            {data.summary.entitlements.map((item, index) => (
                                <tr key={`ent-${index}`} className="border-b border-[var(--outline-variant)]">
                                    <td className="p-3 text-[var(--on-surface-variant)]">
                                        <div className="flex justify-between items-center">
                                            <span>{item.label}</span>
                                            <span className="font-mono font-semibold text-[var(--on-surface)]">{formatCurrency(item.value)}</span>
                                        </div>
                                    </td>
                                    <td className="p-3"></td>
                                    <td className="p-3"></td>
                                </tr>
                            ))}

                            <tr>
                                <td className="p-2 pt-4 text-right font-semibold bg-[var(--surface-container)] text-[var(--on-surface)]" colSpan={3}>بيان الخصومات</td>
                            </tr>
                             {data.summary.deductions.map((item, index) => (
                                <tr key={`ded-${index}`} className="border-b border-[var(--outline-variant)]">
                                    <td className="p-3"></td>
                                    <td className="p-3 text-[var(--on-surface-variant)]">
                                        <div className="flex justify-between items-center">
                                            <span>{item.label}</span>
                                            <span className="font-mono font-semibold text-[var(--error)]">{formatCurrency(item.value)}</span>
                                        </div>
                                    </td>
                                    <td className="p-3"></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-[var(--primary)] bg-[var(--surface-container)] text-center">
                                <td className="p-4 font-bold text-lg text-[var(--on-surface)]">
                                    <div>
                                        <div className="text-sm font-normal text-[var(--on-surface-variant)]">إجمالي الاستحقاق</div>
                                        {formatCurrency(data.summary.totalEntitlements)}
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-lg text-[var(--error)]">
                                    <div>
                                        <div className="text-sm font-normal text-[var(--on-surface-variant)]">إجمالي الخصم</div>
                                        {formatCurrency(data.summary.totalDeductions)}
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-lg text-[var(--primary)]">
                                    <div>
                                        <div className="text-sm font-normal text-[var(--on-surface-variant)]">الإجمالي النهائي</div>
                                        {formatCurrency(data.summary.netPayable)}
                                    </div>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {data.deductionNotes && data.deductionNotes.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-100/30 dark:bg-blue-900/20 rounded-xl border border-[var(--outline-variant)] text-sm text-[var(--on-surface-variant)]">
                        <h5 className="font-semibold text-[var(--on-surface)] mb-2">ملاحظات الخصم:</h5>
                        <ul className="list-disc list-inside space-y-1">
                            {data.deductionNotes.map((note, index) => <li key={index}>{note}</li>)}
                        </ul>
                    </div>
                )}
                {data.deductionWarning && (
                     <div className="mt-4 p-3 bg-[var(--error-container)] rounded-xl text-sm text-[var(--on-error-container)]">
                        <h5 className="font-semibold mb-1">تحذير:</h5>
                        <p>{data.deductionWarning}</p>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Custom Date Input component (Day/Month/Year) ---
const CustomDateInput = React.forwardRef<HTMLInputElement, {
  value: string;
  onChange: (value: string) => void;
  onYearKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
}>(({ value, onChange, onYearKeyDown, min, max }, ref) => {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => dayRef.current as HTMLInputElement, []);

  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      setYear(y); setMonth(m); setDay(d);
      setError('');
    } else if (!value) {
      setYear(''); setMonth(''); setDay('');
    }
  }, [value]);

  const updateDate = (d: string, m: string, y: string) => {
    if (!d && !m && !y) {
        onChange('');
        setError('');
        return;
    }
    
    if (d.length > 0 && d.length <= 2 && m.length > 0 && m.length <= 2 && y.length === 4) {
      const dayInt = parseInt(d, 10);
      const monthInt = parseInt(m, 10);
      const yearInt = parseInt(y, 10);
      const tempDate = new Date(Date.UTC(yearInt, monthInt - 1, dayInt));
      const dateString = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

      let validationError = '';
      if (
        tempDate.getUTCFullYear() !== yearInt ||
        tempDate.getUTCMonth() !== monthInt - 1 ||
        tempDate.getUTCDate() !== dayInt
      ) {
        validationError = 'تاريخ غير صالح';
      } else if (min && dateString < min) {
        validationError = `يجب أن يكون بعد ${formatDateDisplay(min)}`;
      } else if (max && dateString > max) {
         validationError = `يجب أن يكون قبل ${formatDateDisplay(max)}`;
      }
      
      setError(validationError);
      onChange(validationError ? '' : dateString);

    } else {
      onChange(''); // Not a full date yet
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    maxLength: number,
    nextFieldRef?: React.RefObject<HTMLInputElement>
  ) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length <= maxLength) {
      setter(val);
      if (val.length === maxLength && nextFieldRef?.current) {
        nextFieldRef.current.focus();
        nextFieldRef.current.select();
      }
    }
  };

  useEffect(() => {
    updateDate(day, month, year);
  }, [day, month, year, min, max]);

  const formatDateDisplay = (dateStr: string) => {
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
      const [y,m,d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
  }

  return (
    <div>
      <div className="flex items-center gap-2" dir="rtl">
        <input
          ref={dayRef}
          type="text"
          value={day}
          onChange={(e) => handleChange(e, setDay, 2, monthRef)}
          placeholder="يوم"
          className="input-style w-20 text-center"
        />
        <span className="text-[var(--on-surface-variant)]">/</span>
        <input
          ref={monthRef}
          type="text"
          value={month}
          onChange={(e) => handleChange(e, setMonth, 2, yearRef)}
          placeholder="شهر"
          className="input-style w-20 text-center"
        />
        <span className="text-[var(--on-surface-variant)]">/</span>
        <input
          ref={yearRef}
          type="text"
          value={year}
          onChange={(e) => handleChange(e, setYear, 4)}
          onKeyDown={onYearKeyDown}
          placeholder="سنة"
          className="input-style w-24 text-center"
        />
      </div>
      {error && <p className="text-xs text-[var(--error)] mt-1">{error}</p>}
    </div>
  );
});


// --- Compensation Modal and helpers ---
const additionalCompensationCoefficients: { [age: number]: number } = {
    25: 2.67, 26: 2.60, 27: 2.53, 28: 2.47, 29: 2.40, 30: 2.33,
    31: 2.27, 32: 2.20, 33: 2.13, 34: 2.07, 35: 2.00, 36: 1.93,
    37: 1.87, 38: 1.80, 39: 1.73, 40: 1.67, 41: 1.60, 42: 1.53,
    43: 1.47, 44: 1.40, 45: 1.33, 46: 1.27, 47: 1.20, 48: 1.13,
    49: 1.07, 50: 1.00, 51: 0.93, 52: 0.87, 53: 0.80, 54: 0.73,
    55: 0.67, 56: 0.60, 57: 0.53, 58: 0.47, 59: 0.40, 60: 0.33,
    61: 0.25, 62: 0.25, 63: 0.20
};

const getCompensationCoefficient = (age: number): number => {
    if (age < 25) return 2.67;
    if (age > 63) return 0.20;
    return additionalCompensationCoefficients[age] || 0;
};

interface AdditionalCompensationModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: InsuranceDuesFormData;
  calculateCommission: (amount: number, rate: number, cap?: number) => number;
  calculatePensionForDate: (targetDate: Date, entitlementDate: Date, lawType: LawType, includeGrants: boolean) => number;
  progressionData: AllProgressionsData | null;
  onShowProgression: () => void;
  getBonusTableNameForDate: (targetDate: Date, tables: any[]) => string;
  dynamicPensionTables: any[];
}

const AdditionalCompensationModal: React.FC<AdditionalCompensationModalProps> = ({ isOpen, onClose, formData, calculateCommission, calculatePensionForDate, progressionData, onShowProgression, getBonusTableNameForDate, dynamicPensionTables }) => {
    const { lawType, pensionEntitlementDate } = formData;
    const [averageSettlementWage, setAverageSettlementWage] = useState('');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [dateOfDeath, setDateOfDeath] = useState(formData.dateOfDeath);
    const [activePopup, setActivePopup] = useState<OtherProgression | null>(null);
    const [pensionAtDeathRef, setPensionAtDeathRef] = useState<OtherProgression | null>(null);
    const [calculationError, setCalculationError] = useState<string | null>(null);
    
    const [results, setResults] = useState<{
        ageAtDeath: { years: number; months: number; days: number; roundedYears: number } | null;
        coefficient: number | null;
        grossCompensation: number | null;
        compensationFee: number | null;
        netCompensation: number | null;
        pensionAtDeath: number | null;
        grossFuneralExpenses: number | null;
        funeralFee: number | null;
        netFuneralExpenses: number | null;
        totalNetPayable: number | null;
    } | null>(null);

    const handleReset = useCallback(() => {
        setAverageSettlementWage('');
        setDateOfBirth('');
        setDateOfDeath(formData.dateOfDeath);
        setResults(null);
        setCalculationError(null);
    }, [formData.dateOfDeath]);

    useEffect(() => {
        if (isOpen) {
            handleReset();
        }
    }, [isOpen, handleReset]);

    const handleCalculateCompensation = () => {
        setCalculationError(null);

        const wage = parseFloat(averageSettlementWage);
        const dob = parseArabicDate(dateOfBirth);
        const dod = parseArabicDate(dateOfDeath);
        const entDate = pensionEntitlementDate ? parseArabicDate(`${pensionEntitlementDate}-01`) : null;

        if (isNaN(wage) || wage <= 0) {
            setCalculationError("الرجاء إدخال متوسط أجر تسوية صحيح.");
            setResults(null);
            return;
        }
        if (!dob || !dod || !entDate) {
            setCalculationError("الرجاء إدخال تواريخ ميلاد ووفاة واستحقاق صحيحة.");
            setResults(null);
            return;
        }
        if (dod < dob) {
            setCalculationError("تاريخ الوفاة لا يمكن أن يكون قبل تاريخ الميلاد.");
            setResults(null);
            return;
        }
        
        // Age Calculation
        let years = dod.getUTCFullYear() - dob.getUTCFullYear();
        let months = dod.getUTCMonth() - dob.getUTCMonth();
        let days = dod.getUTCDate() - dob.getUTCDate();
        if (days < 0) {
            months--;
            const lastDayOfPrevMonth = new Date(dod.getUTCFullYear(), dod.getUTCMonth(), 0).getDate();
            days += lastDayOfPrevMonth;
        }
        if (months < 0) {
            years--;
            months += 12;
        }
        const roundedYears = (months > 0 || days > 0) ? years + 1 : years;
        const ageAtDeath = { years, months, days, roundedYears };
        
        // Compensation Calculation
        const coefficient = getCompensationCoefficient(roundedYears);
        const grossCompensation = wage * 12 * coefficient;

        // Funeral Expenses Calculation
        const law148StartDate = new Date('2020-01-01T00:00:00Z');
        const isPost2020 = dod >= law148StartDate;
        const pensionAtDeath = calculatePensionForDate(dod, entDate, lawType, false);
        let grossFuneralExpenses = 0;
        
        if (isPost2020) {
            // For all laws, if death is after 1/1/2020, it's pension * 3.
            grossFuneralExpenses = pensionAtDeath * 3;
        } else {
            // Death is BEFORE 1/1/2020
            if (lawType === '112-1980' || lawType === 'sadat') {
                grossFuneralExpenses = 20; // Fixed 20 EGP as per new rule
            } else { // For laws 79, 108
                grossFuneralExpenses = Math.max(pensionAtDeath * 2, 200);
            }
        }
        
        // Find reference table for pension
        let pensionRef: OtherProgression | null = null;
        if ((lawType === '79-1975' || lawType === '108-1976') && entDate < new Date('2008-05-01T00:00:00Z')) {
            const bonusTableName = getBonusTableNameForDate(dod, dynamicPensionTables);
            if (progressionData && progressionData.otherProgressions) {
                pensionRef = progressionData.otherProgressions.find(p => p.name === bonusTableName) || null;
            }
        }
        setPensionAtDeathRef(pensionRef);

        // Fee Calculation
        let compensationFee = 0;
        if (grossCompensation > 0) {
            if (isPost2020) {
                compensationFee = calculateCommission(grossCompensation, 0.002, 20);
            } else {
                let tempFee = 1 + (grossCompensation - Math.floor(grossCompensation));
                compensationFee = (tempFee > 1) ? tempFee : 0;
            }
        }

        let funeralFee = 0;
        if (grossFuneralExpenses > 0) {
             if (isPost2020) {
                funeralFee = calculateCommission(grossFuneralExpenses, 0.002, 20);
            } else {
                let tempFee = 1 + (grossFuneralExpenses - Math.floor(grossFuneralExpenses));
                funeralFee = (tempFee > 1) ? tempFee : 0;
            }
        }

        const netCompensation = grossCompensation - compensationFee;
        const netFuneralExpenses = grossFuneralExpenses - funeralFee;
        
        setResults({
            ageAtDeath,
            coefficient,
            grossCompensation,
            compensationFee,
            netCompensation,
            pensionAtDeath,
            grossFuneralExpenses,
            funeralFee,
            netFuneralExpenses,
            totalNetPayable: netCompensation + netFuneralExpenses,
        });
    };

    if (!isOpen) return null;

    const isCalculationDisabled = !averageSettlementWage || !dateOfBirth || !dateOfDeath;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div 
                className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-4 w-full max-w-3xl max-h-[90vh] flex flex-col animate-modal-content-show"
                role="dialog"
                aria-modal="true"
                aria-labelledby="compensation-modal-title"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                    <h2 id="compensation-modal-title" className="text-xl font-bold text-[var(--on-surface)]">
                        حساب مستحقات حالة عدم وجود مستحقين
                    </h2>
                    <button onClick={onClose} className="p-2 text-[var(--on-surface-variant)] rounded-full hover:bg-[color-mix(in_srgb,_var(--on-surface)_8%,_transparent)]">
                        <CloseIcon />
                    </button>
                </header>
                <main className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="averageSettlementWage" className="form-label flex items-center gap-2">
                                متوسط أجر التسوية
                                <span className="group relative">
                                    <InfoIcon className="h-4 w-4 text-[var(--on-surface-variant)] cursor-help" />
                                    <span className="absolute bottom-full mb-2 -right-1/2 translate-x-1/2 w-64 p-2 text-xs text-center text-[var(--on-primary-container)] bg-[var(--primary-container)] rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10">
                                        اكتب متوسط المعاش الأساسي ومتوسط المعاش المتغير ( إن وجد )
                                    </span>
                                </span>
                            </label>
                            <input
                                type="number"
                                id="averageSettlementWage"
                                value={averageSettlementWage}
                                onChange={(e) => setAverageSettlementWage(e.target.value)}
                                className="input-style"
                                placeholder="أدخل المتوسط هنا"
                                required
                            />
                        </div>
                         <div></div>
                        <div>
                             <label className="form-label">تاريخ ميلاد صاحب المعاش</label>
                             <CustomDateInput value={dateOfBirth} onChange={setDateOfBirth} />
                        </div>
                        <div>
                            <label className="form-label">تاريخ وفاة صاحب المعاش</label>
                            <CustomDateInput value={dateOfDeath} onChange={setDateOfDeath} />
                        </div>
                    </div>

                    {calculationError && (
                        <div className="mt-4 p-4 text-center bg-[var(--error-container)] rounded-xl text-[var(--on-error-container)]">
                           <p>{calculationError}</p>
                        </div>
                    )}
                    
                    {results && (
                        <div className="mt-6 p-6 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] space-y-6">
                           
                           {/* Compensation Section */}
                            <div>
                                <h3 className="text-lg font-bold text-[var(--on-surface)] text-center mb-4 border-b border-[var(--outline-variant)] pb-3">1. تفاصيل حساب التعويض الإضافي</h3>
                                {results.ageAtDeath && (
                                    <div className="flex justify-between items-center text-sm flex-wrap gap-x-4 gap-y-1 mb-3">
                                        <span className="text-[var(--on-surface-variant)] shrink-0">عمر صاحب المعاش فى تاريخ الوفاة:</span>
                                        <span className="font-semibold text-[var(--on-surface)] font-mono text-left">
                                            {`${results.ageAtDeath.days} يوم / ${results.ageAtDeath.months} شهر / ${results.ageAtDeath.years} سنة (مقرّب إلى ${results.ageAtDeath.roundedYears} سنة)`}
                                        </span>
                                    </div>
                                )}
                                <div className="text-center p-3 bg-[var(--surface-container)] rounded-lg mb-4">
                                    <p className="text-xs text-[var(--on-surface-variant)]">معادلة الحساب</p>
                                    <p className="font-mono text-[var(--on-surface)] mt-1">متوسط أجر التسوية × 12 × المعامل</p>
                                    {results.coefficient != null && averageSettlementWage && (
                                        <p className="font-mono text-[var(--primary)] mt-1 text-lg">
                                            {parseFloat(averageSettlementWage).toFixed(2)} × 12 × {results.coefficient} = {results.grossCompensation?.toFixed(2)}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-baseline"><p className="text-[var(--on-surface-variant)]">إجمالي التعويض الإضافي</p><p className="font-semibold font-mono text-lg text-[var(--on-surface)]">{results.grossCompensation?.toFixed(2)} جنيه</p></div>
                                    {results.compensationFee != null && results.compensationFee > 0 && (<div className="flex justify-between items-baseline"><p className="text-[var(--error)]">خصم عمولة الصرف</p><p className="font-semibold font-mono text-lg text-[var(--error)]">-{results.compensationFee.toFixed(2)} جنيه</p></div>)}
                                    <hr className="border-[var(--primary)] my-2 border-t" />
                                    <div className="flex justify-between items-center text-lg"><p className="font-bold text-[var(--primary)]">صافي التعويض</p><p className="font-bold font-mono text-[var(--primary)]">{results.netCompensation?.toFixed(2)} جنيه</p></div>
                                </div>
                            </div>

                             {/* Funeral Expenses Section */}
                            <div>
                                <h3 className="text-lg font-bold text-[var(--on-surface)] text-center mb-4 border-b border-[var(--outline-variant)] pb-3">2. تفاصيل حساب مصاريف الجنازة</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-baseline">
                                        <p className="text-[var(--on-surface-variant)]">معاش شهر الوفاة</p>
                                        <p className="font-semibold font-mono text-lg text-[var(--on-surface)]">
                                            {results.pensionAtDeath?.toFixed(2)} جنيه
                                            {pensionAtDeathRef && (
                                                <sup className="mr-1">
                                                    <button 
                                                        onClick={() => setActivePopup(pensionAtDeathRef)}
                                                        className="px-1.5 py-0.5 bg-[var(--tertiary)] text-[var(--on-tertiary)] text-xs rounded-full hover:bg-[color-mix(in_srgb,_black_15%,_var(--tertiary))]"
                                                        title={`عرض التدرج وفقاً لـ ${pensionAtDeathRef.name}`}
                                                    >
                                                        {`جدول (${pensionAtDeathRef.refNumber})`}
                                                    </button>
                                                </sup>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex justify-between items-baseline"><p className="text-[var(--on-surface-variant)]">إجمالي مصاريف الجنازة</p><p className="font-semibold font-mono text-lg text-[var(--on-surface)]">{results.grossFuneralExpenses?.toFixed(2)} جنيه</p></div>
                                    {results.funeralFee != null && results.funeralFee > 0 && (<div className="flex justify-between items-baseline"><p className="text-[var(--error)]">خصم عمولة الصرف</p><p className="font-semibold font-mono text-lg text-[var(--error)]">-{results.funeralFee.toFixed(2)} جنيه</p></div>)}
                                    <hr className="border-[var(--primary)] my-2 border-t" />
                                    <div className="flex justify-between items-center text-lg"><p className="font-bold text-[var(--primary)]">صافي مصاريف الجنازة</p><p className="font-bold font-mono text-[var(--primary)]">{results.netFuneralExpenses?.toFixed(2)} جنيه</p></div>
                                </div>
                            </div>

                             {/* Total Section */}
                            <div className="pt-4 border-t-2 border-[var(--primary)]">
                                {results.totalNetPayable != null && (
                                    <div className="flex justify-between items-center text-xl">
                                        <p className="font-bold text-[var(--primary)]">صافي المبلغ الإجمالي المستحق للصرف</p>
                                        <p className="font-bold font-mono text-[var(--primary)]">{results.totalNetPayable.toFixed(2)} جنيه</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
                 <footer className="p-4 bg-[var(--surface-container)] rounded-b-3xl flex justify-end gap-4 border-t border-[var(--outline-variant)]">
                    <button
                        type="button"
                        onClick={handleCalculateCompensation}
                        disabled={isCalculationDisabled}
                        className="w-full sm:w-auto px-10 py-3 bg-[var(--primary)] text-[var(--on-primary)] font-bold rounded-full shadow-elevation-1 hover:shadow-elevation-2 hover:bg-[color-mix(in_srgb,_var(--on-primary)_8%,_var(--primary))] active:bg-[color-mix(in_srgb,_var(--on-primary)_12%,_var(--primary))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--primary)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        حساب المستحقات
                    </button>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="w-full sm:w-auto px-8 py-3 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] border border-[var(--outline)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--outline)] transition-all"
                    >
                        إعادة تعيين
                    </button>
                </footer>
                 {activePopup && <ReferencedProgressionPopup table={activePopup} onClose={() => setActivePopup(null)} entitlementDate={formData.pensionEntitlementDate} />}
            </div>
        </div>
    );
};

// --- Calculation Details Modal Component ---
const CalculationDetailsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    details: any | null;
    progressionData: AllProgressionsData | null;
}> = ({ isOpen, onClose, details, progressionData }) => {
    const [activePopup, setActivePopup] = useState<OtherProgression | null>(null);

    if (!isOpen || !details) return null;

    const formatCurrency = (val: number | undefined) => (val ?? 0).toFixed(2);

    const arrears = details.arrears;
    const severance = details.severance;

    const DetailRow: React.FC<{label: string, value: string, valueClass?: string, children?: React.ReactNode}> = ({label, value, valueClass, children}) => (
        <>
            <span className="font-semibold text-[var(--on-surface-variant)] text-right">{label}:</span>
            <div className={`text-left ${valueClass || 'text-[var(--on-surface)]'}`}>
                <span className="font-mono">{value}</span>
                {children}
            </div>
        </>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div 
                className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-4 w-full max-w-4xl max-h-[90vh] flex flex-col animate-modal-content-show"
                role="dialog"
                aria-modal="true"
                aria-labelledby="details-modal-title"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                    <h2 id="details-modal-title" className="text-xl font-bold text-[var(--on-surface)]">
                        كيف تم الحساب؟
                    </h2>
                    <button onClick={onClose} className="p-2 text-[var(--on-surface-variant)] rounded-full hover:bg-[color-mix(in_srgb,_var(--on-surface)_8%,_transparent)]">
                        <CloseIcon />
                    </button>
                </header>
                <main className="p-6 overflow-y-auto space-y-6">
                    {/* Arrears Details */}
                    {arrears && arrears.periods.length > 0 && (
                        <div className="p-4 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] space-y-4">
                            <h4 className="text-lg font-bold text-[var(--on-surface)] border-b border-[var(--outline)] pb-2 mb-3">أ. تفاصيل حساب المتجمدات</h4>
                            {arrears.periods.map((period: any, pIndex: number) => {
                                const groupedBreakdown = period.breakdown.reduce((acc: any[], row: any, index: number) => {
                                    const prevRow = period.breakdown[index - 1];
                                    if (index === 0 || row.pensionValue !== prevRow.pensionValue || row.monthlyGrant !== prevRow.monthlyGrant || row.exceptionalGrant !== prevRow.exceptionalGrant || JSON.stringify(row.pensionValueRef) !== JSON.stringify(prevRow.pensionValueRef)) {
                                        acc.push({
                                            startMonth: row.month,
                                            endMonth: row.month,
                                            monthCount: 1,
                                            ...row
                                        });
                                    } else {
                                        const lastGroup = acc[acc.length - 1];
                                        lastGroup.endMonth = row.month;
                                        lastGroup.monthCount++;
                                    }
                                    return acc;
                                }, []);

                                return (
                                <div key={pIndex} className="p-3 bg-[var(--surface-container)] rounded-xl">
                                    <h5 className="font-bold text-[var(--primary)] mb-2">الفترة: {period.period} ( {period.months} شهور )</h5>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[700px] text-sm text-center">
                                            <thead className="bg-[var(--surface-container-high)]">
                                                <tr>
                                                    <th className="p-2 font-semibold">من شهر</th>
                                                    <th className="p-2 font-semibold">إلى شهر</th>
                                                    <th className="p-2 font-semibold">عدد الشهور</th>
                                                    <th className="p-2 font-semibold">قيمة المعاش</th>
                                                    <th className="p-2 font-semibold">المنحة الشهرية</th>
                                                    <th className="p-2 font-semibold">المنح الاستثنائية</th>
                                                    <th className="p-2 font-semibold">نسبة الاستحقاق</th>
                                                    <th className="p-2 font-semibold bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]">إجمالي القيمة للفترة</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {groupedBreakdown.map((row: any, rIndex: number) => (
                                                    <tr key={rIndex} className="border-t border-[var(--outline-variant)]">
                                                        <td className="p-2 font-mono">{row.startMonth}</td>
                                                        <td className="p-2 font-mono">{row.endMonth}</td>
                                                        <td className="p-2 font-mono">{row.monthCount}</td>
                                                        <td className="p-2 font-mono">
                                                            {formatCurrency(row.pensionValue)}
                                                            {row.pensionValueRef && (
                                                                <span className="flex items-center justify-center gap-1 mt-1">
                                                                    <sup>
                                                                        <button onClick={() => setActivePopup(row.pensionValueRef)} className="px-1.5 py-0.5 bg-[var(--tertiary)] text-[var(--on-tertiary)] text-xs rounded-full hover:bg-[color-mix(in_srgb,_black_15%,_var(--tertiary))]" title={`عرض التدرج وفقاً لـ ${row.pensionValueRef.name}`}>
                                                                            {`جدول (${row.pensionValueRef.refNumber})`}
                                                                        </button>
                                                                    </sup>
                                                                </span>
                                                            )}
                                                        </td>
                                                         <td className="p-2 font-mono">{formatCurrency(row.monthlyGrant)}</td>
                                                         <td className="p-2 font-mono">{formatCurrency(row.exceptionalGrant)}</td>
                                                        <td className="p-2 font-mono">{period.percentage}%</td>
                                                        <td className="p-2 font-mono font-bold bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]">{formatCurrency(row.total * (period.percentage / 100) * row.monthCount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="text-left mt-2 p-2 bg-[var(--surface-container-high)] rounded-lg">
                                        <span className="font-bold text-md text-[var(--on-surface)]">إجمالي الفترة: </span>
                                        <span className="font-bold font-mono text-md text-[var(--primary)]">{formatCurrency(period.total)}</span>
                                    </div>
                                </div>
                            )})}
                        </div>
                    )}

                    {/* Grants Details */}
                    {arrears && (arrears.funeralExpenses || arrears.deathGrant) && (
                        <div className="p-4 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] space-y-4">
                            {arrears.funeralExpenses && (
                                <div>
                                    <h4 className="text-lg font-bold text-[var(--on-surface)] border-b border-[var(--outline)] pb-2 mb-3">ب. تفاصيل حساب مصاريف الجنازة</h4>
                                    <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-2 text-sm p-4 bg-[var(--surface-container)] rounded-xl items-center">
                                        <DetailRow label="طريقة الحساب" value={arrears.funeralExpenses.formula} />
                                        <DetailRow label="قيمة المعاش المستخدمة" value={formatCurrency(arrears.funeralExpenses.pensionAtDeath)}>
                                             {arrears.funeralExpenses.pensionAtDeathRef && (
                                                <sup className="ml-2">
                                                    <button onClick={() => setActivePopup(arrears.funeralExpenses.pensionAtDeathRef)} className="px-1.5 py-0.5 bg-[var(--tertiary)] text-[var(--on-tertiary)] text-xs rounded-full hover:bg-[color-mix(in_srgb,_black_15%,_var(--tertiary))]" title={`عرض التدرج وفقاً لـ ${arrears.funeralExpenses.pensionAtDeathRef.name}`}>
                                                        {`جدول (${arrears.funeralExpenses.pensionAtDeathRef.refNumber})`}
                                                    </button>
                                                </sup> 
                                            )}
                                        </DetailRow>
                                        <hr className="col-span-2 border-[var(--outline-variant)] my-1" />
                                        <DetailRow label="النتيجة النهائية" value={formatCurrency(arrears.funeralExpenses.result)} valueClass="font-bold text-lg text-[var(--primary)]" />
                                    </div>
                                </div>
                            )}
                            {arrears.deathGrant && (
                                <div>
                                    <h4 className="text-lg font-bold text-[var(--on-surface)] border-b border-[var(--outline)] pb-2 mb-3">ج. تفاصيل حساب منحة الوفاة</h4>
                                     <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-2 text-sm p-4 bg-[var(--surface-container)] rounded-xl items-center">
                                         <DetailRow label="طريقة الحساب" value={arrears.deathGrant.formula} />
                                         <DetailRow label="قيمة المعاش المستخدمة" value={formatCurrency(arrears.deathGrant.pensionAtDeath)}>
                                            {arrears.deathGrant.pensionAtDeathRef && (
                                                <sup className="ml-2">
                                                    <button onClick={() => setActivePopup(arrears.deathGrant.pensionAtDeathRef)} className="px-1.5 py-0.5 bg-[var(--tertiary)] text-[var(--on-tertiary)] text-xs rounded-full hover:bg-[color-mix(in_srgb,_black_15%,_var(--tertiary))]" title={`عرض التدرج وفقاً لـ ${arrears.deathGrant.pensionAtDeathRef.name}`}>
                                                        {`جدول (${arrears.deathGrant.pensionAtDeathRef.refNumber})`}
                                                    </button>
                                                </sup>
                                            )}
                                        </DetailRow>
                                        <hr className="col-span-2 border-[var(--outline-variant)] my-1" />
                                        <DetailRow label="النتيجة النهائية" value={formatCurrency(arrears.deathGrant.result)} valueClass="font-bold text-lg text-[var(--primary)]" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Severance Details */}
                    {severance && (
                        <div className="p-4 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)]">
                            <h4 className="text-lg font-bold text-[var(--on-surface)] border-b border-[var(--outline)] pb-2 mb-3">تفاصيل حساب منحة القطع</h4>
                            <div className="space-y-2 text-sm p-3 bg-[var(--surface-container)] rounded-xl">
                                <p><span className="font-semibold text-[var(--on-surface-variant)]">طريقة الحساب:</span> {severance.grant.formula}</p>
                                <p className="flex justify-between items-center">
                                    <span className="font-semibold text-[var(--on-surface-variant)]">المعاش في شهر القطع:</span>
                                    <span className="font-mono text-[var(--on-surface)]">
                                        {formatCurrency(severance.grant.pensionAtSeverance)}
                                        {severance.grant.pensionAtSeveranceRef && (
                                            <sup className="ml-2">
                                                <button onClick={() => setActivePopup(severance.grant.pensionAtSeveranceRef)} className="px-1.5 py-0.5 bg-[var(--tertiary)] text-[var(--on-tertiary)] text-xs rounded-full hover:bg-[color-mix(in_srgb,_black_15%,_var(--tertiary))]" title={`عرض التدرج وفقاً لـ ${severance.grant.pensionAtSeveranceRef.name}`}>
                                                    {`جدول (${severance.grant.pensionAtSeveranceRef.refNumber})`}
                                                </button>
                                            </sup>
                                        )}
                                    </span>
                                </p>
                                <p><span className="font-semibold text-[var(--on-surface-variant)]">نسبة الاستحقاق المطبقة:</span> <span className="font-mono text-[var(--on-surface)]">{severance.grant.percentage.toFixed(2)}%</span></p>
                                <p className="font-bold pt-2 border-t border-[var(--outline-variant)]"><span className="text-[var(--primary)]">قيمة المنحة (بعد تطبيق الحد الأدنى):</span> <span className="font-mono text-[var(--primary)]">{formatCurrency(severance.grant.result)}</span></p>
                            </div>
                        </div>
                    )}

                </main>
                {activePopup && progressionData && <ReferencedProgressionPopup table={activePopup} onClose={() => setActivePopup(null)} entitlementDate={progressionData.mainProgression.steps[0]?.date.toISOString().slice(0,7) || ''} />}
            </div>
        </div>
    );
};


// --- Main Calculator Component ---

const InsuranceDuesCalculator: React.FC = () => {
    const LOCAL_STORAGE_KEY = 'insuranceCalculatorData';

    // --- Refs for Focus Management ---
    const insuranceNumberRef = useRef<HTMLInputElement>(null);
    const pensionerNameRef = useRef<HTMLInputElement>(null);
    const dateOfBirthRef = useRef<HTMLInputElement>(null);
    const pensionEntitlementDateRef = useRef<HTMLInputElement>(null);
    const dateOfDeathRef = useRef<HTMLInputElement>(null);
    const normalBasicPensionRef = useRef<HTMLInputElement>(null);
    const injuryBasicPensionRef = useRef<HTMLInputElement>(null);
    const variablePensionRef = useRef<HTMLInputElement>(null);
    const specialBonusesRef = useRef<HTMLInputElement>(null);

    const arrearsStartDateRef = useRef<HTMLInputElement>(null);
    const arrearsEndDateRef = useRef<HTMLInputElement>(null);
    const entitlementPercentageRef = useRef<HTMLInputElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent, nextFieldRef?: React.RefObject<HTMLInputElement | null>) => {
        if (e.key === 'Enter' && nextFieldRef?.current) {
            e.preventDefault();
            nextFieldRef.current.focus();
            if (nextFieldRef.current.type !== 'month' && nextFieldRef.current.type !== 'date') {
              nextFieldRef.current.select();
            }
        }
    };
    
    // --- Helper function for date validation ---
    const addOneMonth = (dateStr: string): string => {
        if (!dateStr || !/^\d{4}-\d{2}$/.test(dateStr)) return '';
        const [year, month] = dateStr.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, 1));
        date.setUTCMonth(date.getUTCMonth() + 1);
        const nextYear = date.getUTCFullYear();
        const nextMonth = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        return `${nextYear}-${nextMonth}`;
    };
    
    // Static data tables for fixed pension values before April 2011
    const fixedPensionLaw112 = [
      { date: '1980/07/01', value: 10.00 }, { date: '1981/07/01', value: 12.00 },
      { date: '1991/06/01', value: 17.00 }, { date: '1992/07/01', value: 21.00 },
      { date: '1993/07/01', value: 25.00 }, { date: '1994/07/01', value: 30.00 },
      { date: '1995/07/01', value: 36.00 }, { date: '1996/07/01', value: 45.00 },
      { date: '1997/07/01', value: 57.00 }, { date: '1998/07/01', value: 63.00 },
      { date: '1999/01/01', value: 63.00 }, { date: '1999/07/01', value: 70.00 },
    ];

    const fixedPensionSadat = [
      { date: '1980/07/01', value: 10.00 }, { date: '1981/07/01', value: 10.00 },
      { date: '1991/06/01', value: 15.00 }, { date: '1992/07/01', value: 18.00 },
      { date: '1993/07/01', value: 20.00 }, { date: '1994/07/01', value: 24.00 },
      { date: '1995/07/01', value: 29.00 }, { date: '1996/07/01', value: 37.00 },
      { date: '1997/07/01', value: 47.00 }, { date: '1998/07/01', value: 52.00 },
      { date: '1999/01/01', value: 52.00 }, { date: '1999/07/01', value: 58.00 },
    ];

    const [formData, setFormData] = useState<InsuranceDuesFormData>(() => {
        try {
            const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData && typeof parsedData === 'object') {
                    const mergedState = {
                        ...defaultFormData,
                        ...parsedData,
                        deductions: {
                            ...defaultFormData.deductions,
                            ...(parsedData.deductions || {}),
                        },
                        periods: Array.isArray(parsedData.periods) ? parsedData.periods : defaultFormData.periods,
                    };
                    return mergedState;
                }
            }
        } catch (error) {
            console.error("Failed to parse saved form data from localStorage:", error);
        }
        return defaultFormData;
    });

    const calculateCommission = (amount: number, rate: number, cap: number = Infinity): number => {
        if (amount <= 0) return 0;
        const rawFee = amount * rate;
        const netBeforeRounding = amount - rawFee;
        let finalFee = amount - Math.floor(netBeforeRounding);
        
        // The cap applies to the fee itself, not including the fractional part of the original amount
        if (cap !== Infinity) {
             const maxFee = cap + (amount - Math.floor(amount));
             if (finalFee > maxFee) {
                finalFee = maxFee;
             }
        }

        return finalFee;
    };

    // FIX: Moved hooks that depend on `formData` to after its declaration to resolve "used before its declaration" errors.
    // --- Focus & Navigation Logic ---
    useEffect(() => {
        if (formData.lawType) {
            setTimeout(() => insuranceNumberRef.current?.focus(), 100);
        }
    }, [formData.lawType]);

    const minValidArrearsStartDate = useMemo(() => {
        const { pensionEntitlementDate, dateOfDeath, duesType } = formData;
        if (duesType === 'inheritance') {
            return dateOfDeath ? dateOfDeath.slice(0, 7) : undefined;
        }
        if (duesType === 'beneficiary') {
            return pensionEntitlementDate;
        }
        // Default for other cases or when no type is selected yet
        if (!pensionEntitlementDate && !dateOfDeath) return undefined;
        const entitlementMonth = pensionEntitlementDate;
        const deathMonth = dateOfDeath ? dateOfDeath.slice(0, 7) : '';
        if (entitlementMonth && deathMonth) {
            return entitlementMonth > deathMonth ? entitlementMonth : deathMonth;
        }
        return entitlementMonth || deathMonth || undefined;
    }, [formData.pensionEntitlementDate, formData.dateOfDeath, formData.duesType]);

    const [dynamicPensionTables, setDynamicPensionTables] = useState(() => {
        try {
            const savedPensions = localStorage.getItem('authorityTables_pensions');
            return savedPensions ? JSON.parse(savedPensions) : defaultPensionTables;
        } catch (error) {
            console.error("Failed to load pension tables from localStorage", error);
            return defaultPensionTables;
        }
    });

    useEffect(() => {
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'authorityTables_pensions') {
            try {
                const savedPensions = localStorage.getItem('authorityTables_pensions');
                setDynamicPensionTables(savedPensions ? JSON.parse(savedPensions) : defaultPensionTables);
            } catch (error) {
                console.error("Failed to reload pension tables from localStorage", error);
            }
        }
      };

      window.addEventListener('storage', handleStorageChange);
      return () => {
          window.removeEventListener('storage', handleStorageChange);
      };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(formData));
        } catch (error) {
            console.error("Failed to save form data to localStorage:", error);
        }
    }, [formData]);

    // Effect to reset duesType if dateOfDeath is cleared
    useEffect(() => {
        if (!formData.dateOfDeath && (formData.duesType === 'inheritance' || formData.duesType === 'severance')) {
            setFormData(prev => ({
                ...prev,
                duesType: ''
            }));
        }
    }, [formData.dateOfDeath, formData.duesType]);

    const [calculationResult, setCalculationResult] = useState<CalculationResultData | null>(null);
    const [activeTab, setActiveTab] = useState<'input' | 'results'>('input');
    const [isProgressionModalOpen, setIsProgressionModalOpen] = useState(false);
    const [pensionProgressionData, setPensionProgressionData] = useState<AllProgressionsData | null>(null);
    const [isCompensationModalOpen, setIsCompensationModalOpen] = useState(false);
    
    // State for the new "How was this calculated?" modal
    const [isCalculationDetailsModalOpen, setCalculationDetailsModalOpen] = useState(false);
    const [calculationDetails, setCalculationDetails] = useState<any | null>(null);
    
    // State for new features
    const [isCurrentPensionBreakdownVisible, setIsCurrentPensionBreakdownVisible] = useState(false);
    const [queryDate, setQueryDate] = useState<string>('');
    const [queriedPensionResult, setQueriedPensionResult] = useState<(CurrentPensionBreakdown & { pensionValueRef: OtherProgression | null }) | null>(null);
    const [activeQueriedPopup, setActiveQueriedPopup] = useState<OtherProgression | null>(null);


    const formatDateDisplay = (dateStr: string | undefined): string => {
        if (!dateStr) return '-';
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) { // YYYY-MM-DD
            const [y, m, d] = dateStr.split('-');
            return `${d}/${m}/${y}`;
        }
        if (dateStr.match(/^\d{4}-\d{2}$/)) { // YYYY-MM
            const [y, m] = dateStr.split('-');
            return `${m}/${y}`;
        }
        if (dateStr.match(/^\d{4}\/\d{2}\/\d{2}$/)) { // YYYY/MM/DD
             const [y, m, d] = dateStr.split('/');
             return `${d}/${m}/${y}`;
        }
        return dateStr;
    };
    
    // --- Date Parsing Utilities ---
    const parseDateYYYYMM = (dateStr: string): Date | null => {
        if (!dateStr || !dateStr.includes('-')) return null;
        const [year, month] = dateStr.split('-').map(Number);
        if (isNaN(year) || isNaN(month)) return null;
        return new Date(Date.UTC(year, month - 1, 1));
    };

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        setCalculationResult(null);
        setCalculationDetails(null);
        setQueriedPensionResult(null);
        setQueryDate('');

        if (activeTab === 'results') {
            setActiveTab('input');
        }

        if (name === 'lawType') {
          const newLawType = value as LawType;
          setFormData(prev => ({ ...defaultFormData, lawType: newLawType }));
          setActiveTab('input');
          return; 
        }

        const isCheckbox = type === 'checkbox';
        const checked = isCheckbox ? (e.target as HTMLInputElement).checked : undefined;

        if (name === 'noBeneficiaries') {
            const isChecked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, noBeneficiaries: isChecked, duesType: isChecked ? '' : prev.duesType }));
            if (isChecked) {
                const allData = calculateAllProgressionData();
                if (allData) {
                    setPensionProgressionData(allData);
                }
                setIsCompensationModalOpen(true);
            }
            return;
        }
    
        if (name.startsWith('deduction_')) {
            const [_, key, property] = name.split('_');
            setFormData(prev => ({
                ...prev,
                deductions: {
                    ...prev.deductions,
                    [key]: {
                        ...prev.deductions[key as keyof typeof prev.deductions],
                        [property]: property === 'active' ? checked : Math.max(0, parseFloat(value) || 0)
                    }
                }
            }));
        } else if (name.startsWith('period_')) {
            const [_, indexStr, key] = name.split('_');
            const index = parseInt(indexStr, 10);
            
            let processedValue: string | number = value;
            if (key === 'percentage') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    if (numValue > 100) processedValue = 100;
                    else if (numValue < 0) processedValue = 0;
                    else processedValue = numValue;
                } else {
                    processedValue = '';
                }
            }

            setFormData(prev => {
                const newPeriods = [...prev.periods];
                newPeriods[index] = { ...newPeriods[index], [key]: processedValue };

                // If an end date is changed, cascade updates to subsequent periods
                if (key === 'endDate') {
                    for (let i = index; i < newPeriods.length - 1; i++) {
                        const currentEndDate = newPeriods[i].endDate;
                        
                        if (currentEndDate) {
                            const nextStartDate = addOneMonth(currentEndDate);
                            newPeriods[i + 1] = { ...newPeriods[i + 1], startDate: nextStartDate };

                            // If the next period's new start date is after its end date, clear the end date.
                            if (newPeriods[i + 1].endDate && nextStartDate && newPeriods[i + 1].endDate < nextStartDate) {
                                newPeriods[i + 1].endDate = '';
                            }
                        } else {
                            // If an end date is cleared, clear all subsequent start and end dates.
                            for (let j = i + 1; j < newPeriods.length; j++) {
                                newPeriods[j] = { ...newPeriods[j], startDate: '', endDate: '' };
                            }
                            break; // Stop cascading once a chain is broken
                        }
                    }
                }

                return { ...prev, periods: newPeriods };
            });
        }
        else {
            let processedValue: string | number | boolean = value;
            if (type === 'checkbox') {
                 processedValue = (e.target as HTMLInputElement).checked;
            } else if (name === 'entitlementPercentage' || name === 'severancePercentage') {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    if (numValue > 100) processedValue = 100;
                    else if (numValue < 0) processedValue = 0;
                    else processedValue = numValue;
                } else {
                    processedValue = '';
                }
            }
            setFormData(prev => ({ ...prev, [name]: processedValue }));
        }
    }, [activeTab]);
    
    
    const calculateLaw112PensionTimeline = useCallback((entitlementDate: Date, lawType: '112-1980' | 'sadat', pensionTables: any[]) => {
        const getTable = (name: string) => pensionTables.find(t => t.name === name)?.data;
    
        const minPensionTableData = getTable('جدول الحد الأدني للمعاش');
        
        const d_2011_04_01 = new Date(Date.UTC(2011, 3, 1));
        const bonusesTableData = getTable('جدول العلاوات الدورية للمعاش')?.filter(row => {
            const bonusDate = parseArabicDate(row[0]);
            if (!bonusDate) return false;
            // For entitlements before 1/4/2011, bonus calculations start from 2012 (2011 is a fixed grant)
            if (entitlementDate < d_2011_04_01) {
                return bonusDate >= new Date(Date.UTC(2012, 0, 1));
            }
            // For entitlements on/after 1/4/2011, bonus calculations start from 1/4/2011
            return bonusDate >= d_2011_04_01;
        });

        if (!minPensionTableData || !bonusesTableData) {
            return { steps: [], summary: { basicPensionAtEntitlement: 0, upliftValue: 0, monthlyGrant: 0, minimumPensionUplifts: [], exceptionalGrants: [] } };
        }
        
        const d_2010_07_01 = new Date(Date.UTC(2010, 6, 1));
        const d_2011_07_01 = new Date(Date.UTC(2011, 6, 1));
        const d_2012_07_01 = new Date(Date.UTC(2012, 6, 1));
        const d_2013_07_01 = new Date(Date.UTC(2013, 6, 1));
        const d_2014_01_01 = new Date(Date.UTC(2014, 0, 1));
        const d_2016_07_01 = new Date(Date.UTC(2016, 6, 1));

        let upliftAmount = 0;
        let upliftDate = entitlementDate;
    
        if (entitlementDate < d_2010_07_01) {
            upliftAmount = 43.60;
            upliftDate = d_2010_07_01;
        } else if (entitlementDate < d_2011_07_01) {
            upliftAmount = 43.60;
        } else if (entitlementDate < d_2012_07_01) {
            upliftAmount = 64;
        } else if (entitlementDate < d_2013_07_01) {
            upliftAmount = 211;
        } else if (entitlementDate < d_2014_01_01) {
            upliftAmount = 220;
        } else { // >= 2014-01-01
            upliftAmount = 370;
        }
    
        let runningPension = 0;
        let pensionAtEntitlement = 0;
        let upliftValue = 0;
        const minimumPensionUplifts: { date: string; amount: number }[] = [];
        const steps: (ProgressionStep & { date: Date })[] = [];
    
        const allBonuses = (bonusesTableData.map(row => {
            const bonusDate = parseArabicDate(row[0]);
            if (!bonusDate) return null;
            return {
                date: bonusDate, type: 'bonus',
                percentage: parseFloat(convertArabicNumerals(row[1]?.replace('%', ''))) || 0,
                min: parseFloat(convertArabicNumerals(row[3])) || 0,
                max: parseFloat(convertArabicNumerals(row[4])) || Infinity,
                description: `علاوة ${row[0]}`
            };
        }).filter(b => b !== null) as any[]);
        
        const otherFixedGrants: any[] = [];
        // Rule 1: Fixed 17 EGP grant for April 2011 bonus if entitlement date is before it.
        if (entitlementDate < new Date(Date.UTC(2011, 3, 1))) {
            otherFixedGrants.push({ date: new Date(Date.UTC(2011, 3, 1)), description: 'علاوة ابريل 2011', bonusAmount: 17.00, type: 'grant' });
        }
        
        const specialEvents: any[] = [];
        if (entitlementDate >= d_2011_04_01 && entitlementDate < d_2011_07_01) {
            specialEvents.push({
                date: d_2011_07_01,
                type: 'special_uplift_134',
                description: 'إضافة مبلغ تكميلي للمعاش إلى 134 جنيه',
            });
        }

        const isBonusException = (event: { date: Date, type: string }, entitlementDate: Date): boolean => {
            if (event.type !== 'bonus' && event.type !== 'grant') return false; 
            
            const eventDate = event.date;
            const eventYear = eventDate.getUTCFullYear();
            const eventMonth = eventDate.getUTCMonth();
            const entitlementYear = entitlementDate.getUTCFullYear();
            const entitlementMonth = entitlementDate.getUTCMonth();
        
            // Exception 1: April 2022 bonus
            if (eventYear === 2022 && eventMonth === 3) { // April
                return entitlementYear === 2022 && entitlementMonth >= 3 && entitlementMonth <= 5; // April, May, June
            }
            
            // Exception 2: April 2023 bonus
            if (eventYear === 2023 && eventMonth === 3) { // April
                return entitlementYear === 2023 && entitlementMonth >= 3 && entitlementMonth <= 5; // April, May, June
            }
            
            // Exception 3: March 2024 bonus
            if (eventYear === 2024 && eventMonth === 2) { // March
                return entitlementYear === 2024 && entitlementMonth >= 2 && entitlementMonth <= 5; // March, April, May, June
            }
        
            return false;
        };

        let allPostEntitlementEvents: any[] = [];
    
        if (entitlementDate < d_2010_07_01) {
            const fixedTable = lawType === 'sadat' ? fixedPensionSadat : fixedPensionLaw112;
            const initialFixedPeriod = [...fixedTable].reverse().find(row => {
                const periodDate = parseArabicDate(row.date);
                return periodDate && entitlementDate >= periodDate;
            });
            pensionAtEntitlement = initialFixedPeriod ? initialFixedPeriod.value : 0;
            runningPension = pensionAtEntitlement;
    
            steps.push({
                date: entitlementDate,
                description: `قيمة المعاش الأساسي للمعاشات المستحقة في الفترة`,
                pensionBefore: 0, bonusAmount: pensionAtEntitlement, minUplift: 0,
                pensionAfter: runningPension
            });
    
            const futureFixedIncreases = fixedTable
                .filter(row => { const d = parseArabicDate(row.date); return d && d > entitlementDate; })
                .map(row => ({
                    date: parseArabicDate(row.date)!, type: 'fixed_increase', newValue: row.value,
                    description: `قيمة المعاش الثابت في ${formatDateDisplay(row.date)}`
                }));

            const upliftEvent = { date: upliftDate, description: 'إضافة مادة الرفع', bonusAmount: upliftAmount, type: 'uplift' };
            
            allPostEntitlementEvents = [...futureFixedIncreases, ...otherFixedGrants, upliftEvent, ...allBonuses, ...specialEvents]
                .filter(e => e.date >= entitlementDate || isBonusException(e, entitlementDate))
                .sort((a, b) => a.date.getTime() - b.date.getTime());

        } else { // >= 2010-07-01
            pensionAtEntitlement = 70;
            runningPension = pensionAtEntitlement;
            steps.push({
                date: entitlementDate, description: 'المعاش الأساسي عند الاستحقاق',
                pensionBefore: 0, bonusAmount: pensionAtEntitlement, minUplift: 0,
                pensionAfter: runningPension,
            });
            
            const pensionBeforeUplift = runningPension;
            runningPension += upliftAmount;
            upliftValue = upliftAmount;
            steps.push({
                date: entitlementDate, description: 'إضافة مادة الرفع',
                pensionBefore: pensionBeforeUplift, bonusAmount: upliftAmount, minUplift: 0,
                pensionAfter: runningPension,
            });

            if (entitlementDate >= d_2016_07_01) {
                const pensionBeforeMinUplift = runningPension;
                const minPensionRow = [...minPensionTableData].reverse().find(row => { const d = parseArabicDate(row[0]); return d && entitlementDate >= d; });
                const minPension = minPensionRow ? parseFloat(minPensionRow[2]) : 0;
                if (runningPension < minPension) {
                    const firstMinUpliftAmount = minPension - runningPension;
                    runningPension += firstMinUpliftAmount;
                    if (firstMinUpliftAmount > 0) {
                        minimumPensionUplifts.push({ date: formatDateDisplay(entitlementDate.toISOString().substring(0, 10)), amount: firstMinUpliftAmount });
                    }
                    steps.push({
                        date: entitlementDate, description: 'فرق رفع الحد الأدنى عند الاستحقاق',
                        pensionBefore: pensionBeforeMinUplift, bonusAmount: 0, minUplift: firstMinUpliftAmount,
                        pensionAfter: runningPension
                    });
                }
            }
            
            allPostEntitlementEvents = [...otherFixedGrants, ...allBonuses, ...specialEvents]
                .filter(e => e.date > entitlementDate || isBonusException(e, entitlementDate))
                .sort((a, b) => a.date.getTime() - b.date.getTime());
        }

        // Remove duplicates just in case (e.g., if a bonus exception is also after entitlement)
        allPostEntitlementEvents = allPostEntitlementEvents.filter((event, index, self) =>
            index === self.findIndex((e) => e.date.getTime() === event.date.getTime() && e.description === event.description)
        );

        for (const event of allPostEntitlementEvents) {
            const d_2012_01_01 = new Date(Date.UTC(2012, 0, 1));
            if (event.type === 'bonus' && event.date.getTime() === d_2012_01_01.getTime() && entitlementDate < d_2011_04_01) {
                const pensionBeforeFixedAdd = runningPension;
                const fixedAmount = 3.40;
                runningPension += fixedAmount;
                steps.push({
                    date: event.date,
                    description: 'إضافة مبلغ ثابت',
                    pensionBefore: pensionBeforeFixedAdd,
                    bonusPercentage: '-',
                    bonusAmount: fixedAmount,
                    minUplift: 0,
                    pensionAfter: runningPension
                });
            }

            const pensionBefore = runningPension;
            let bonusAmount = 0, minUplift = 0, bonusPercentage = '-', description = event.description;
    
            if (event.type === 'fixed_increase') {
                if (event.newValue > pensionBefore) {
                    runningPension = event.newValue;
                } else { continue; }
            } else if (event.type === 'uplift') {
                bonusAmount = event.bonusAmount;
                upliftValue = bonusAmount;
                runningPension += bonusAmount;
            } else if (event.type === 'grant') {
                bonusAmount = event.bonusAmount;
                runningPension += bonusAmount;
            } else if (event.type === 'special_uplift_134') {
                if (pensionBefore < 134) {
                    bonusAmount = 134 - pensionBefore;
                    runningPension = 134;
                } else {
                    continue; // No change if already >= 134
                }
            } else if (event.type === 'bonus') {
                bonusAmount = pensionBefore * (event.percentage! / 100);
                bonusAmount = Math.max(bonusAmount, event.min!);
                bonusAmount = Math.min(bonusAmount, event.max!);
    
                const tempPensionWithBonus = pensionBefore + bonusAmount;
                const minPensionRow = [...minPensionTableData].reverse().find(row => { const d = parseArabicDate(row[0]); return d && event.date >= d; });
                const minPension = minPensionRow ? parseFloat(minPensionRow[2]) : 0;
    
                if (tempPensionWithBonus < minPension) {
                    minUplift = minPension - tempPensionWithBonus;
                    if (minUplift > 0) {
                        minimumPensionUplifts.push({ date: formatDateDisplay(event.date.toISOString().substring(0, 10)), amount: minUplift });
                    }
                }
                runningPension = tempPensionWithBonus + minUplift;
                bonusPercentage = `${event.percentage!}%`;
            }
    
            if (pensionBefore !== runningPension) {
                steps.push({ date: event.date, description, pensionBefore, bonusPercentage, bonusAmount, minUplift, pensionAfter: runningPension });
            }
        }
    
        const allExceptionalGrants = [{ date: '2022-11', amount: 300, entitlement: new Date('2022-11-01T00:00:00Z') }, { date: '2023-10', amount: 300, entitlement: new Date('2023-10-01T00:00:00Z') }];
        const applicableGrants = allExceptionalGrants.filter(grant => entitlementDate < grant.entitlement).map(({ date, amount }) => ({ date, amount }));
    
        return { 
            steps, 
            summary: { 
                basicPensionAtEntitlement: pensionAtEntitlement, 
                upliftValue: upliftValue, 
                monthlyGrant: 10, // The monthly grant is a fixed 10 EGP
                minimumPensionUplifts, 
                exceptionalGrants: applicableGrants 
            } 
        };
    }, [fixedPensionLaw112, fixedPensionSadat]);
    
    // FIX: Moved this function before its usage in `calculatePensionForDate`
    const calculateLaw79PensionTimeline = useCallback((
        formData: InsuranceDuesFormData,
        bonusTableName: string
    ): ProgressionData | null => {
        const getTable = (name: string) => dynamicPensionTables.find(t => t.name === name);
    
        const bonusTable = getTable(bonusTableName);
        const minPensionTable = getTable('جدول الحد الأدني للمعاش');
    
        if (!bonusTable || !minPensionTable) return null;
    
        const entitlementDate = parseDateYYYYMM(formData.pensionEntitlementDate);
        if (!entitlementDate) return null;
    
        let runningBasicPension = (Number(formData.normalBasicPension) || 0) + (Number(formData.injuryBasicPension) || 0);
        const runningVariablePension = (Number(formData.variablePension) || 0) + (Number(formData.specialBonuses) || 0);
        
        const steps: ProgressionStep[] = [];
        const summary: ProgressionData['summary'] = {
            basicPensionAtEntitlement: (Number(formData.normalBasicPension) || 0) + (Number(formData.injuryBasicPension) || 0),
            variablePensionAtEntitlement: (Number(formData.variablePension) || 0) + (Number(formData.specialBonuses) || 0),
            initialNormalBasicPension: (Number(formData.normalBasicPension) || 0),
            initialInjuryPension: (Number(formData.injuryBasicPension) || 0),
            initialVariablePension: (Number(formData.variablePension) || 0),
            initialSpecialBonuses: (Number(formData.specialBonuses) || 0),
            monthlyGrant: 10,
        };

        const allExceptionalGrants = [{ date: '2022-11', amount: 300, entitlement: new Date('2022-11-01T00:00:00Z') }, { date: '2023-10', amount: 300, entitlement: new Date('2023-10-01T00:00:00Z') }];
        summary.exceptionalGrants = allExceptionalGrants
            .filter(grant => entitlementDate < grant.entitlement)
            .map(({ date, amount }) => ({ date, amount }));
    
        steps.push({
            date: entitlementDate,
            description: `المعاش عند الاستحقاق`,
            pensionBefore: 0,
            bonusAmount: 0,
            minUplift: 0,
            pensionAfter: runningBasicPension + runningVariablePension
        });
    
        // Law 30 of 1992 Rule
        const law30StartDate = new Date('1992-07-01T00:00:00Z');
        const law30EndDate = new Date('2020-01-01T00:00:00Z');
        if (entitlementDate >= law30StartDate && entitlementDate < law30EndDate) {
            const pensionBeforeLaw30 = runningBasicPension + runningVariablePension;
            let law30Amount = (Number(formData.normalBasicPension) || 0) * 0.25;
            law30Amount = Math.max(20, Math.min(law30Amount, 35));
            
            runningBasicPension += law30Amount;

            steps.push({
                date: entitlementDate,
                description: 'إضافة قانون 30 لسنة 1992',
                pensionBefore: pensionBeforeLaw30,
                bonusAmount: law30Amount,
                minUplift: 0,
                pensionAfter: runningBasicPension + runningVariablePension
            });
        }

        const allEvents: any[] = [];
    
        // 1. Add Bonuses
        bonusTable.data.forEach((row: string[]) => {
            const bonusDate = parseArabicDate(row[0]);
            if (bonusDate && bonusDate > entitlementDate) {
                allEvents.push({
                    date: bonusDate,
                    type: 'bonus',
                    percentage: parseFloat(convertArabicNumerals(row[1]?.replace('%', ''))) || 0,
                    minAmount: parseFloat(convertArabicNumerals(row[3])) || 0,
                    maxAmount: parseFloat(convertArabicNumerals(row[4])) || Infinity,
                    description: `علاوة ${row[0]}`
                });
            }
        });
    
        // 2. Add Uplift and initial Minimum Pension uplift logic
        const d_2010_07_01 = new Date('2010-07-01T00:00:00Z');
        if (entitlementDate >= d_2010_07_01) {
            // Handle uplift and initial min pension uplift for new pensioners (post-2010)
            const pensionBeforeUplift = runningBasicPension + runningVariablePension;
            
            const d_2011_07_01 = new Date('2011-07-01T00:00:00Z');
            const d_2012_07_01 = new Date('2012-07-01T00:00:00Z');
            const d_2013_07_01 = new Date('2013-07-01T00:00:00Z');
            const d_2014_01_01 = new Date('2014-01-01T00:00:00Z');
            
            let upliftValue = 0;
            if (entitlementDate < d_2011_07_01) upliftValue = 123.60 - (pensionBeforeUplift * 0.33);
            else if (entitlementDate < d_2012_07_01) upliftValue = 144.00 - (pensionBeforeUplift * 0.33);
            else if (entitlementDate < d_2013_07_01) upliftValue = 291.00 - (pensionBeforeUplift * 0.33);
            else if (entitlementDate < d_2014_01_01) upliftValue = 300.00 - (pensionBeforeUplift * 0.33);
            else upliftValue = 450.00 - (pensionBeforeUplift * 0.33);
    
            upliftValue = Math.max(0, upliftValue);
            summary.upliftValue = upliftValue;
            runningBasicPension += upliftValue;
    
            steps.push({
                date: entitlementDate,
                description: 'إضافة مادة الرفع',
                pensionBefore: pensionBeforeUplift,
                bonusAmount: upliftValue,
                minUplift: 0,
                pensionAfter: runningBasicPension + runningVariablePension
            });
    
            const period2StartDate = new Date('2016-07-01T00:00:00Z');
            if (entitlementDate >= period2StartDate) {
                const pensionAfterInitialUplifts = runningBasicPension + runningVariablePension;
                const minPensionRow = [...minPensionTable.data].reverse().find((row: string[]) => {
                    const d = parseArabicDate(row[0]);
                    return d && entitlementDate >= d;
                });
                const minPension = minPensionRow ? parseFloat(minPensionRow[2]) : 0;
    
                if (pensionAfterInitialUplifts < minPension) {
                    const initialMinUplift = minPension - pensionAfterInitialUplifts;
                    runningBasicPension += initialMinUplift;
                    
                    steps.push({
                        date: entitlementDate,
                        description: 'إضافة فرق رفع الحد الأدنى عند الاستحقاق',
                        pensionBefore: pensionAfterInitialUplifts,
                        bonusAmount: 0,
                        minUplift: initialMinUplift,
                        pensionAfter: runningBasicPension + runningVariablePension
                    });
                }
            }
        } else {
             // For old pensioners (pre-2010), add uplift as a future event
            allEvents.push({ date: d_2010_07_01, type: 'uplift' });
        }
    
        allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    
        let upliftApplied = entitlementDate >= d_2010_07_01;
    
        for (const event of allEvents) {
            const pensionBeforeEvent = runningBasicPension + runningVariablePension;
    
            if (event.type === 'uplift') {
                if (upliftApplied) continue;
                
                const d_2010_07_01_inner = new Date('2010-07-01T00:00:00Z');
                const d_2011_07_01 = new Date('2011-07-01T00:00:00Z');
                const d_2012_07_01 = new Date('2012-07-01T00:00:00Z');
                const d_2013_07_01 = new Date('2013-07-01T00:00:00Z');
                const d_2014_01_01 = new Date('2014-01-01T00:00:00Z');
                
                let upliftValue = 0;
                if (entitlementDate < d_2010_07_01_inner) upliftValue = 123.60 - (pensionBeforeEvent * 0.33);
                else if (entitlementDate < d_2011_07_01) upliftValue = 123.60 - (pensionBeforeEvent * 0.33);
                else if (entitlementDate < d_2012_07_01) upliftValue = 144.00 - (pensionBeforeEvent * 0.33);
                else if (entitlementDate < d_2013_07_01) upliftValue = 291.00 - (pensionBeforeEvent * 0.33);
                else if (entitlementDate < d_2014_01_01) upliftValue = 300.00 - (pensionBeforeEvent * 0.33);
                else upliftValue = 450.00 - (pensionBeforeEvent * 0.33);
    
                upliftValue = Math.max(0, upliftValue);
                summary.upliftValue = upliftValue;
                runningBasicPension += upliftValue; // Uplift is added to the pension
    
                steps.push({
                    date: event.date,
                    description: 'إضافة مادة الرفع',
                    pensionBefore: pensionBeforeEvent,
                    bonusAmount: upliftValue,
                    minUplift: 0,
                    pensionAfter: runningBasicPension + runningVariablePension
                });
                upliftApplied = true;
    
            } else if (event.type === 'bonus') {
                const bonusBase = event.date < new Date('2011-04-01T00:00:00Z') ? runningBasicPension : (runningBasicPension + runningVariablePension);
                
                let bonusAmount = bonusBase * (event.percentage / 100);
                if (event.minAmount) bonusAmount = Math.max(bonusAmount, event.minAmount);
                if (event.maxAmount) bonusAmount = Math.min(bonusAmount, event.maxAmount);
    
                const tempPensionWithBonus = pensionBeforeEvent + bonusAmount;
                let minUplift = 0;
    
                if (event.date >= new Date('2016-07-01T00:00:00Z')) {
                    const minPensionRow = [...minPensionTable.data].reverse().find((row: string[]) => {
                        const d = parseArabicDate(row[0]);
                        return d && event.date >= d;
                    });
                    const minPension = minPensionRow ? parseFloat(minPensionRow[2]) : 0;
                    if (tempPensionWithBonus < minPension) {
                        minUplift = minPension - tempPensionWithBonus;
                    }
                }
                
                runningBasicPension += bonusAmount + minUplift; // Bonuses are added to the total
    
                steps.push({
                    date: event.date,
                    description: event.description,
                    pensionBefore: pensionBeforeEvent,
                    bonusPercentage: `${event.percentage}%`,
                    bonusAmount: bonusAmount,
                    minUplift: minUplift,
                    pensionAfter: runningBasicPension + runningVariablePension
                });
            }
        }
        return { summary, steps };
    }, [dynamicPensionTables]);

    const calculateLaw108PensionTimeline = useCallback((
        formData: InsuranceDuesFormData,
        bonusTableName: string
    ): ProgressionData | null => {
        const getTable = (name: string) => dynamicPensionTables.find(t => t.name === name);
        const bonusTable = getTable(bonusTableName);
        const minPensionTable = getTable('جدول الحد الأدني للمعاش');
    
        if (!bonusTable || !minPensionTable) return null;
    
        const entitlementDate = parseDateYYYYMM(formData.pensionEntitlementDate);
        if (!entitlementDate) return null;
    
        let runningPension = Number(formData.normalBasicPension) || 0;
        const steps: ProgressionStep[] = [];
        const summary: ProgressionData['summary'] = {
            basicPensionAtEntitlement: Number(formData.normalBasicPension) || 0,
            initialNormalBasicPension: Number(formData.normalBasicPension) || 0,
            monthlyGrant: 10,
        };

        const allExceptionalGrants = [{ date: '2022-11', amount: 300, entitlement: new Date('2022-11-01T00:00:00Z') }, { date: '2023-10', amount: 300, entitlement: new Date('2023-10-01T00:00:00Z') }];
        summary.exceptionalGrants = allExceptionalGrants
            .filter(grant => entitlementDate < grant.entitlement)
            .map(({ date, amount }) => ({ date, amount }));
    
        steps.push({
            date: entitlementDate, description: `المعاش الأساسي عند الاستحقاق`,
            pensionBefore: 0, bonusAmount: runningPension, minUplift: 0, pensionAfter: runningPension
        });
    
        const d_2010_07_01 = new Date('2010-07-01T00:00:00Z');
        const d_2011_04_01 = new Date('2011-04-01T00:00:00Z');
        const d_2016_07_01 = new Date('2016-07-01T00:00:00Z');
        
        const allBonuses: any[] = bonusTable.data.map((row: string[]) => {
            const bonusDate = parseArabicDate(row[0]);
            if (!bonusDate) return null;
            return {
                date: bonusDate,
                percentage: parseFloat(convertArabicNumerals(row[1]?.replace('%', ''))) || 0,
                minAmount: parseFloat(convertArabicNumerals(row[3])) || 0,
                maxAmount: parseFloat(convertArabicNumerals(row[4])) || Infinity,
                description: `علاوة ${row[0]}`
            };
        }).filter(Boolean);

        if (entitlementDate < d_2010_07_01) {
            const bonusesBeforeJuly2010 = allBonuses.filter(b => b.date > entitlementDate && b.date < d_2010_07_01);
            for (const bonus of bonusesBeforeJuly2010) {
                const pensionBefore = runningPension;
                let bonusAmount = pensionBefore * (bonus.percentage / 100);
                if (bonus.minAmount) bonusAmount = Math.max(bonusAmount, bonus.minAmount);
                if (bonus.maxAmount) bonusAmount = Math.min(bonusAmount, bonus.maxAmount);
                runningPension += bonusAmount;
                steps.push({
                    date: bonus.date, description: bonus.description, pensionBefore,
                    bonusPercentage: `${bonus.percentage}%`, bonusAmount, minUplift: 0, pensionAfter: runningPension
                });
            }

            // Apply July 2010 bonus BEFORE uplift
            const july2010Bonus = allBonuses.find(b => b.date.getTime() === d_2010_07_01.getTime());
            if (july2010Bonus) {
                const pensionBeforeBonus = runningPension;
                let bonusAmount = pensionBeforeBonus * (july2010Bonus.percentage / 100);
                if (july2010Bonus.minAmount) bonusAmount = Math.max(bonusAmount, july2010Bonus.minAmount);
                if (july2010Bonus.maxAmount) bonusAmount = Math.min(bonusAmount, july2010Bonus.maxAmount);
                runningPension += bonusAmount;
                steps.push({
                    date: july2010Bonus.date, description: july2010Bonus.description, pensionBefore: pensionBeforeBonus,
                    bonusPercentage: `${july2010Bonus.percentage}%`, bonusAmount, minUplift: 0, pensionAfter: runningPension
                });
            }

            const pensionBeforeUplift = runningPension;
            let upliftValue = 123.60 - (pensionBeforeUplift * 0.33);
            upliftValue = Math.max(0, upliftValue);
            summary.upliftValue = upliftValue;
            runningPension += upliftValue;
            steps.push({
                date: d_2010_07_01, description: 'إضافة مادة الرفع', pensionBefore: pensionBeforeUplift,
                bonusAmount: upliftValue, minUplift: 0, pensionAfter: runningPension
            });
        } else {
            const pensionBeforeUplift = runningPension;
            const d_2011_07_01 = new Date('2011-07-01T00:00:00Z');
            const d_2012_07_01 = new Date('2012-07-01T00:00:00Z');
            const d_2013_07_01 = new Date('2013-07-01T00:00:00Z');
            const d_2014_01_01 = new Date('2014-01-01T00:00:00Z');
            
            let upliftValue = 0;
            if (entitlementDate < d_2011_07_01) upliftValue = 123.60 - (pensionBeforeUplift * 0.33);
            else if (entitlementDate < d_2012_07_01) upliftValue = 144.00 - (pensionBeforeUplift * 0.33);
            else if (entitlementDate < d_2013_07_01) upliftValue = 291.00 - (pensionBeforeUplift * 0.33);
            else if (entitlementDate < d_2014_01_01) upliftValue = 300.00 - (pensionBeforeUplift * 0.33);
            else upliftValue = 450.00 - (pensionBeforeUplift * 0.33);

            upliftValue = Math.max(0, upliftValue);
            summary.upliftValue = upliftValue;
            runningPension += upliftValue;
            steps.push({
                date: entitlementDate, description: 'إضافة مادة الرفع', pensionBefore: pensionBeforeUplift,
                bonusAmount: upliftValue, minUplift: 0, pensionAfter: runningPension
            });

            if (entitlementDate >= d_2016_07_01) {
                const pensionAfterUplift = runningPension;
                const minPensionRow = [...minPensionTable.data].reverse().find((row: string[]) => { const d = parseArabicDate(row[0]); return d && entitlementDate >= d; });
                const minPension = minPensionRow ? parseFloat(minPensionRow[2]) : 0;
                if (pensionAfterUplift < minPension) {
                    const minUplift = minPension - pensionAfterUplift;
                    runningPension += minUplift;
                    steps.push({
                        date: entitlementDate, description: 'إضافة فرق رفع الحد الأدنى عند الاستحقاق', pensionBefore: pensionAfterUplift,
                        bonusAmount: 0, minUplift, pensionAfter: runningPension
                    });
                }
            }
        }
        
        const subsequentBonuses = allBonuses.filter(b => b.date >= d_2011_04_01 && b.date > entitlementDate);
        for (const bonus of subsequentBonuses) {
            const pensionBefore = runningPension;
            let bonusAmount = pensionBefore * (bonus.percentage / 100);
            if (bonus.minAmount) bonusAmount = Math.max(bonusAmount, bonus.minAmount);
            if (bonus.maxAmount) bonusAmount = Math.min(bonusAmount, bonus.maxAmount);

            const tempPensionWithBonus = pensionBefore + bonusAmount;
            let minUplift = 0;

            if (bonus.date >= d_2016_07_01) {
                const minPensionRow = [...minPensionTable.data].reverse().find((row: string[]) => { const d = parseArabicDate(row[0]); return d && bonus.date >= d; });
                const minPension = minPensionRow ? parseFloat(minPensionRow[2]) : 0;
                if (tempPensionWithBonus < minPension) {
                    minUplift = minPension - tempPensionWithBonus;
                }
            }
            
            runningPension = tempPensionWithBonus + minUplift;
            steps.push({
                date: bonus.date, description: bonus.description, pensionBefore,
                bonusPercentage: `${bonus.percentage}%`, bonusAmount, minUplift, pensionAfter: runningPension
            });
        }
    
        return { summary, steps };
    }, [dynamicPensionTables]);


    const calculateLaw148PensionTimeline = useCallback((
        formData: InsuranceDuesFormData
    ): ProgressionData | null => {
        const getTable = (name: string) => dynamicPensionTables.find(t => t.name === name);
        const bonusTable = getTable('جدول العلاوات الدورية للمعاش');
        const minPensionTable = getTable('جدول الحد الأدني للمعاش');
    
        if (!bonusTable || !minPensionTable) return null;
    
        const entitlementDate = parseDateYYYYMM(formData.pensionEntitlementDate);
        if (!entitlementDate) return null;
    
        const normalBasicPension = Number(formData.normalBasicPension) || 0;
        let runningPension = normalBasicPension;
        const steps: ProgressionStep[] = [];
        const summary: ProgressionData['summary'] = {
            basicPensionAtEntitlement: normalBasicPension,
            initialNormalBasicPension: normalBasicPension,
            initialInjuryPension: Number(formData.injuryBasicPension) || 0,
            monthlyGrant: 10,
        };
        
        const allExceptionalGrants = [{ date: '2022-11', amount: 300, entitlement: new Date('2022-11-01T00:00:00Z') }, { date: '2023-10', amount: 300, entitlement: new Date('2023-10-01T00:00:00Z') }];
        summary.exceptionalGrants = allExceptionalGrants
            .filter(grant => entitlementDate < grant.entitlement)
            .map(({ date, amount }) => ({ date, amount }));
    
        steps.push({
            date: entitlementDate, description: 'المعاش الأساسي الطبيعي',
            pensionBefore: 0, bonusAmount: normalBasicPension, minUplift: 0, pensionAfter: runningPension
        });
    
        // Rule 3: Uplift
        const pensionBeforeUplift = runningPension;
        let upliftValue = 450 - (normalBasicPension * 0.33);
        upliftValue = Math.max(0, upliftValue);
        runningPension += upliftValue;
        summary.upliftValue = upliftValue;
        steps.push({
            date: entitlementDate, description: 'إضافة مادة الرفع', pensionBefore: pensionBeforeUplift,
            bonusAmount: upliftValue, minUplift: 0, pensionAfter: runningPension
        });
    
        // Rule 4: Initial Minimum Pension Uplift
        const pensionAfterUplift = runningPension;
        const minPensionRow = [...minPensionTable.data].reverse().find((row: string[]) => { const d = parseArabicDate(row[0]); return d && entitlementDate >= d; });
        const minPension = minPensionRow ? parseFloat(minPensionRow[2]) : 0;
        if (pensionAfterUplift < minPension) {
            const minUplift = minPension - pensionAfterUplift;
            runningPension += minUplift;
            steps.push({
                date: entitlementDate, description: 'إضافة فرق رفع الحد الأدنى عند الاستحقاق', pensionBefore: pensionAfterUplift,
                bonusAmount: 0, minUplift, pensionAfter: runningPension
            });
        }
    
        // Rule 5: Add injury pension
        const injuryPension = Number(formData.injuryBasicPension) || 0;
        if (injuryPension > 0) {
            const pensionBeforeInjury = runningPension;
            runningPension += injuryPension;
            steps.push({
                date: entitlementDate, description: 'إضافة المعاش الأساسي الإصابي', pensionBefore: pensionBeforeInjury,
                bonusAmount: injuryPension, minUplift: 0, pensionAfter: runningPension
            });
        }
    
        // Rule 7 & 8: Bonuses
        const futureBonuses = bonusTable.data
            .map((row: string[]) => {
                const bonusDate = parseArabicDate(row[0]);
                if (!bonusDate || bonusDate <= entitlementDate) return null;
                return {
                    date: bonusDate,
                    percentage: parseFloat(convertArabicNumerals(row[1]?.replace('%', ''))) || 0,
                    minAmount: parseFloat(convertArabicNumerals(row[3])) || 0,
                    maxAmount: parseFloat(convertArabicNumerals(row[4])) || Infinity,
                    description: `علاوة ${row[0]}`
                };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

        for (const bonus of futureBonuses) {
            const pensionBefore = runningPension;
            let bonusAmount = pensionBefore * (bonus!.percentage / 100);
            if (bonus!.minAmount) bonusAmount = Math.max(bonusAmount, bonus!.minAmount);
            if (bonus!.maxAmount) bonusAmount = Math.min(bonusAmount, bonus!.maxAmount);
            
            const tempPensionWithBonus = pensionBefore + bonusAmount;
            
            const minPensionRowForBonus = [...minPensionTable.data].reverse().find((row: string[]) => { const d = parseArabicDate(row[0]); return d && bonus!.date >= d; });
            const minPensionForBonus = minPensionRowForBonus ? parseFloat(minPensionRowForBonus[2]) : 0;
            
            let minUpliftForBonus = 0;
            if (tempPensionWithBonus < minPensionForBonus) {
                minUpliftForBonus = minPensionForBonus - tempPensionWithBonus;
            }
            
            runningPension = tempPensionWithBonus + minUpliftForBonus;

            steps.push({
                date: bonus!.date, description: bonus!.description, pensionBefore: pensionBefore,
                bonusPercentage: `${bonus!.percentage}%`, bonusAmount: bonusAmount, minUplift: minUpliftForBonus, pensionAfter: runningPension
            });
        }

        return { summary, steps };
    }, [dynamicPensionTables]);

    const getBonusTableNameForDate = useCallback((targetDate: Date, tables: any[]): string => {
        const assignmentTable = tables.find(t => t.name === 'جدول تعيين قيم المعاشات');
        const fallbackTableName = 'جدول العلاوات الدورية للمعاش';
        
        if (!assignmentTable || !assignmentTable.data) {
            return fallbackTableName;
        }

        for (const row of assignmentTable.data) {
            const startDateStr = row[0];
            const endDateStr = row[1];
            
            try {
                const startDate = parseArabicDate(startDateStr);
                const endDate = parseArabicDate(endDateStr);

                if (!startDate || !endDate) continue;

                endDate.setUTCHours(23, 59, 59, 999); 

                if (targetDate >= startDate && targetDate <= endDate) {
                    const description = row[2];
                    const match = description.match(/جدول رقم \((\d+)\)/);
                    if (match) {
                        return `جدول رقم (${match[1]})`;
                    } else if (description.includes(fallbackTableName)) {
                        return fallbackTableName;
                    }
                }
            } catch (e) {
                console.error("Error parsing assignment table dates for row:", row, e);
                continue;
            }
        }
        
        return fallbackTableName;
    }, []);
    
    // FIX: Reordered function declarations to avoid "used before declaration" errors.
    const generatePensionProgression = useCallback((entitlementDate: Date, lawType: '112-1980' | 'sadat'): ProgressionData | null => {
        const { steps, summary } = calculateLaw112PensionTimeline(entitlementDate, lawType, dynamicPensionTables);
        if (!steps || steps.length === 0) return null;
        return { summary, steps };
    }, [calculateLaw112PensionTimeline, dynamicPensionTables]);

    const calculateAllProgressionData = useCallback((): AllProgressionsData | null => {
        let progressionData: ProgressionData | null = null;
        const otherProgressions: OtherProgression[] = [];

        if (formData.lawType === '112-1980' || formData.lawType === 'sadat') {
            const entitlementDate = parseDateYYYYMM(formData.pensionEntitlementDate);
            if (entitlementDate) {
                 progressionData = generatePensionProgression(entitlementDate, formData.lawType);
            }
        } else if (formData.lawType === '148-2019') {
            progressionData = calculateLaw148PensionTimeline(formData);
        } else if (formData.lawType === '79-1975' || formData.lawType === '108-1976') {
             const referenceTables = dynamicPensionTables
                .map(table => {
                    const match = table.name.match(/جدول رقم \((\d+)\)/);
                    if (match) return { ...table, refNumber: parseInt(match[1], 10) };
                    return null;
                })
                .filter(Boolean)
                .sort((a, b) => a!.refNumber - b!.refNumber);

            const calculationFn = formData.lawType === '79-1975' ? calculateLaw79PensionTimeline : calculateLaw108PensionTimeline;
            
            const mainBonusTable = getBonusTableNameForDate(new Date(), dynamicPensionTables);
            progressionData = calculationFn(formData, mainBonusTable);

            const entitlementDate = parseDateYYYYMM(formData.pensionEntitlementDate);
            const limitDate = new Date('2008-05-01T00:00:00Z');

            if (entitlementDate && entitlementDate < limitDate) {
                for (const table of referenceTables) {
                    const progression = calculationFn(formData, table!.name);
                    if (progression) {
                        otherProgressions.push({
                            name: table!.name, data: progression,
                            refNumber: table!.refNumber, notes: table!.notes,
                        });
                    }
                }
            }
            
            if (progressionData && entitlementDate && entitlementDate < limitDate && otherProgressions.length > 0) {
                const dateToRefsMap = new Map<string, Set<number>>();
                otherProgressions.forEach(prog => {
                    prog.data.steps.forEach(step => {
                        if (step.bonusAmount > 0 || step.minUplift > 0) {
                            const dateKey = step.date.toISOString().slice(0, 10);
                            if (!dateToRefsMap.has(dateKey)) dateToRefsMap.set(dateKey, new Set());
                            dateToRefsMap.get(dateKey)!.add(prog.refNumber);
                        }
                    });
                });
                progressionData.steps = progressionData.steps.map(step => {
                    const dateKey = step.date.toISOString().slice(0, 10);
                    const references = dateToRefsMap.has(dateKey) ? Array.from(dateToRefsMap.get(dateKey)!).sort((a, b) => a - b) : [];
                    return { ...step, references };
                });
            }
        }

        if (progressionData) {
            return { mainProgression: progressionData, otherProgressions };
        }
        return null;
    }, [formData, generatePensionProgression, calculateLaw79PensionTimeline, calculateLaw108PensionTimeline, calculateLaw148PensionTimeline, dynamicPensionTables, getBonusTableNameForDate]);
    
    const calculatePensionForDate = useCallback((targetDate: Date, entitlementDate: Date, lawType: LawType, includeGrants = true): number => {
        if (lawType === '112-1980' || lawType === 'sadat') {
            const timeline = calculateLaw112PensionTimeline(entitlementDate, lawType, dynamicPensionTables);
            if (!timeline || timeline.steps.length === 0) return 0;
            
            const relevantStep = [...timeline.steps].reverse().find(s => s.date <= targetDate);
            let currentPension = relevantStep ? relevantStep.pensionAfter : 0;
        
            if (includeGrants && timeline.summary.exceptionalGrants) {
                for (const grant of timeline.summary.exceptionalGrants) {
                    const grantEntitlementDate = new Date(`${grant.date}-01T00:00:00Z`);
                    if (entitlementDate < grantEntitlementDate && targetDate >= grantEntitlementDate) {
                        currentPension += grant.amount;
                    }
                }
            }
    
            return currentPension;
        }
    
        if (lawType === '79-1975' || lawType === '108-1976') {
            const bonusTableName = getBonusTableNameForDate(targetDate, dynamicPensionTables);
            const calculationFn = lawType === '79-1975' ? calculateLaw79PensionTimeline : calculateLaw108PensionTimeline;
            const timeline = calculationFn(formData, bonusTableName);

            if (!timeline || timeline.steps.length === 0) return 0;
    
            const relevantStep = [...timeline.steps].reverse().find(s => s.date <= targetDate);
            let currentPension = relevantStep ? relevantStep.pensionAfter : 0;
            
            if (includeGrants && timeline.summary.exceptionalGrants) {
                 for (const grant of timeline.summary.exceptionalGrants) {
                    const grantEntitlementDate = new Date(`${grant.date}-01T00:00:00Z`);
                    if (entitlementDate < grantEntitlementDate && targetDate >= grantEntitlementDate) {
                        currentPension += grant.amount;
                    }
                }
            }
            return currentPension;
        }
        
        if (lawType === '148-2019') {
            const timeline = calculateLaw148PensionTimeline(formData);
            if (!timeline || timeline.steps.length === 0) return 0;
        
            const relevantStep = [...timeline.steps].reverse().find(s => s.date <= targetDate);
            let currentPension = relevantStep ? relevantStep.pensionAfter : 0;
            
            if (includeGrants && timeline.summary.exceptionalGrants) {
                for (const grant of timeline.summary.exceptionalGrants) {
                    const grantEntitlementDate = new Date(`${grant.date}-01T00:00:00Z`);
                    if (entitlementDate < grantEntitlementDate && targetDate >= grantEntitlementDate) {
                        currentPension += grant.amount;
                    }
                }
            }
            return currentPension;
        }
        
        return 0; // for other laws
    }, [calculateLaw112PensionTimeline, calculateLaw79PensionTimeline, calculateLaw108PensionTimeline, calculateLaw148PensionTimeline, dynamicPensionTables, formData, getBonusTableNameForDate]);

    const handleShowProgression = useCallback(() => {
        const allData = calculateAllProgressionData();
        if (allData) {
            setPensionProgressionData(allData);
            setIsProgressionModalOpen(true);
        }
    }, [calculateAllProgressionData]);

    const handleCalculate = () => {
      try {
        setCalculationDetails(null);
        setQueriedPensionResult(null);
        setQueryDate('');
        const { lawType, pensionEntitlementDate, normalBasicPension } = formData;

        if (!pensionEntitlementDate) throw new Error("الرجاء إدخال تاريخ استحقاق صحيح.");
        if ((lawType !== '112-1980' && lawType !== 'sadat') && (Number(normalBasicPension) || 0) <= 0) {
            throw new Error("قيمة المعاش الأساسي يجب أن تكون أكبر من صفر.");
        }

        const entitlementDate = parseDateYYYYMM(pensionEntitlementDate);
        if (!entitlementDate) throw new Error("الرجاء إدخال تاريخ استحقاق صحيح.");

        if (formData.dateOfDeath && /^\d{4}-\d{2}-\d{2}$/.test(formData.dateOfDeath)) {
            if (new Date(formData.dateOfDeath) < entitlementDate) throw new Error("تاريخ وفاة صاحب المعاش يجب أن يكون بعد أو في نفس تاريخ استحقاق المعاش.");
        }

        if (lawType === '148-2019') {
            const { duesType } = formData;
            const law148StartDate = new Date('2020-01-01T00:00:00Z');

            if (entitlementDate < law148StartDate) {
                throw new Error("العمل بالقانون 148 لسنة 2019 بدأ من 2020/01/01 ولا يمكن كتابة تاريخ استحقاق سابق علي العمل بالقانون.");
            }
            
            if (duesType === 'inheritance' || duesType === 'beneficiary') {
                calculateArrearsDues(entitlementDate, lawType, duesType);
            } else if (duesType === 'severance') {
                calculateSeveranceDues(entitlementDate, lawType);
            } else {
                const progression = calculateLaw148PensionTimeline(formData);
                if (!progression || progression.steps.length === 0) {
                    throw new Error("لم يتمكن من حساب تدرج المعاش. يرجى مراجعة المدخلات.");
                }
                
                const finalPensionValue = calculatePensionForDate(new Date(), entitlementDate, lawType, false);
                const monthlyGrant = progression.summary.monthlyGrant || 10;
                const totalExceptionalGrants = progression.summary.exceptionalGrants?.reduce((sum, grant) => sum + grant.amount, 0) || 0;
                
                const totalMonthlyEntitlement = finalPensionValue + monthlyGrant + totalExceptionalGrants;
                const disbursementFee = calculateCommission(totalMonthlyEntitlement, 0.002, 20);
                const netPayablePeriodic = totalMonthlyEntitlement - disbursementFee;
        
                const result: CalculationResultData = {
                    pensionerInfo: [
                        { label: 'الرقم التأميني', value: formData.insuranceNumber },
                        { label: 'اسم صاحب المعاش', value: formData.pensionerName },
                        { label: 'تاريخ الاستحقاق', value: formatDateDisplay(formData.pensionEntitlementDate) },
                    ],
                    userInputInfo: [
                        { label: 'نوع المستحقات', value: 'معاش دوري حالي' },
                         { label: 'إجمالي المعاش الأساسي', value: ((Number(formData.normalBasicPension) || 0) + (Number(formData.injuryBasicPension) || 0)).toFixed(2) },
                    ],
                    summary: { entitlements: [], deductions: [], totalEntitlements: 0, totalDeductions: 0, netPayable: 0},
                    currentPensionBreakdown: {
                        currentPension: finalPensionValue,
                        monthlyGrant,
                        exceptionalGrant: totalExceptionalGrants,
                        totalEntitlement: totalMonthlyEntitlement,
                        disbursementFee: disbursementFee,
                        netPayable: netPayablePeriodic
                    }
                };
                setCalculationResult(result);
            }
            
        } else if (lawType === '79-1975' || lawType === '108-1976') {
            const { duesType } = formData;
            
            // Validation
            const limitDate1990 = new Date('1990-01-01T00:00:00Z');
            const limitDate2020 = new Date('2020-01-01T00:00:00Z');
            if (entitlementDate < limitDate1990) throw new Error("البرنامج يقوم بحساب المعاشات اعتبارا من أول يناير لعام 1990");
            if (entitlementDate >= limitDate2020) throw new Error(`تم الغاء العمل بالقانون ${lawType} ليحل محله القانون 148 لسنة 2019 والذي بدأ العمل به اعتبارا من 1/1/2020`);
            
            if (duesType === 'inheritance' || duesType === 'beneficiary' || duesType === 'severance') {
                if (duesType === 'severance') {
                    calculateSeveranceDues(entitlementDate, lawType);
                } else {
                    calculateArrearsDues(entitlementDate, lawType, duesType);
                }
            } else {
                // Calculate current periodic pension
                const calculationFn = lawType === '79-1975' ? calculateLaw79PensionTimeline : calculateLaw108PensionTimeline;
                const mainBonusTable = getBonusTableNameForDate(new Date(), dynamicPensionTables);
                const progressionData = calculationFn(formData, mainBonusTable);
                if (progressionData && progressionData.steps.length > 0) {
                    const finalPensionValue = calculatePensionForDate(new Date(), entitlementDate, lawType, false);
                    const monthlyGrant = progressionData.summary.monthlyGrant || 10;
                    const totalExceptionalGrants = progressionData.summary.exceptionalGrants?.reduce((sum, grant) => sum + grant.amount, 0) || 0;
                    
                    const totalMonthlyEntitlement = finalPensionValue + monthlyGrant + totalExceptionalGrants;
                    const netBeforeAdjustment = totalMonthlyEntitlement - (totalMonthlyEntitlement * 0.002);
                    const finalDisbursementFee = totalMonthlyEntitlement - Math.floor(netBeforeAdjustment);
                    const netPayablePeriodic = Math.floor(netBeforeAdjustment);
        
                    const result: CalculationResultData = {
                        pensionerInfo: [
                            { label: 'الرقم التأميني', value: formData.insuranceNumber },
                            { label: 'اسم صاحب المعاش', value: formData.pensionerName },
                            { label: 'تاريخ الاستحقاق', value: formatDateDisplay(formData.pensionEntitlementDate) },
                        ],
                        userInputInfo: [
                            { label: 'نوع المستحقات', value: 'معاش دوري حالي' },
                             ...(lawType === '79-1975' ? [
                                { label: 'إجمالي المعاش الأساسي', value: ((Number(formData.normalBasicPension) || 0) + (Number(formData.injuryBasicPension) || 0)).toFixed(2) },
                                { label: 'إجمالي المعاش المتغير', value: ((Number(formData.variablePension) || 0) + (Number(formData.specialBonuses) || 0)).toFixed(2) }
                             ] : [
                                { label: 'المعاش الأساسي (شامل العلاوات)', value: (Number(formData.normalBasicPension) || 0).toFixed(2) }
                             ])
                        ],
                        summary: { entitlements: [], deductions: [], totalEntitlements: 0, totalDeductions: 0, netPayable: 0},
                        currentPensionBreakdown: {
                            currentPension: finalPensionValue,
                            monthlyGrant,
                            exceptionalGrant: totalExceptionalGrants,
                            totalEntitlement: totalMonthlyEntitlement,
                            disbursementFee: finalDisbursementFee,
                            netPayable: netPayablePeriodic
                        }
                    };
                    setCalculationResult(result);
                } else {
                    throw new Error("لم يتم العثور على بيانات لحساب المعاش الدوري.");
                }
            }
        }
        else if (lawType === '112-1980' || lawType === 'sadat') {
            const { duesType } = formData;

            const limitDate1980 = new Date('1980-07-01T00:00:00Z');
            const limitDate2020 = new Date('2020-01-01T00:00:00Z');

            if (entitlementDate < limitDate1980) {
                throw new Error("البرنامج يقوم بحساب المعاشات اعتبارا من أول يوليو لعام 1980");
            }
            if (entitlementDate >= limitDate2020) {
                throw new Error("تم الغاء العمل بالقانون 112 لسنة 1980 ليحل محله القانون 148 لسنة 2019 والذي بدأ العمل به اعتبارا من 1/1/2020");
            }

            if (duesType === 'inheritance' || duesType === 'beneficiary') {
                calculateArrearsDues(entitlementDate, lawType, duesType);
            } else if (duesType === 'severance') {
                calculateSeveranceDues(entitlementDate, lawType);
            } else {
                 const progressionData = generatePensionProgression(entitlementDate, lawType);
                 if (progressionData && progressionData.steps.length > 0) {
                    const finalPensionValue = calculatePensionForDate(new Date(), entitlementDate, lawType, false); // Calculate WITHOUT exceptional grants
                    const monthlyGrant = 10;
                    const totalExceptionalGrants = progressionData.summary.exceptionalGrants?.reduce((sum, grant) => sum + grant.amount, 0) || 0;
                    
                    const totalMonthlyEntitlement = finalPensionValue + monthlyGrant + totalExceptionalGrants;
                    const netBeforeAdjustment = totalMonthlyEntitlement - (totalMonthlyEntitlement * 0.002);
                    const finalDisbursementFee = totalMonthlyEntitlement - Math.floor(netBeforeAdjustment);
                    const netPayablePeriodic = Math.floor(netBeforeAdjustment);

                    const result: CalculationResultData = {
                        pensionerInfo: [
                            { label: 'الرقم التأميني', value: formData.insuranceNumber },
                            { label: 'اسم صاحب المعاش', value: formData.pensionerName },
                            { label: 'تاريخ الاستحقاق', value: formatDateDisplay(formData.pensionEntitlementDate) },
                        ],
                        userInputInfo: [{ label: 'نوع المستحقات', value: 'معاش دوري حالي' }],
                        summary: { entitlements: [], deductions: [], totalEntitlements: 0, totalDeductions: 0, netPayable: 0},
                        currentPensionBreakdown: {
                            currentPension: finalPensionValue,
                            monthlyGrant,
                            exceptionalGrant: totalExceptionalGrants,
                            totalEntitlement: totalMonthlyEntitlement,
                            disbursementFee: finalDisbursementFee,
                            netPayable: netPayablePeriodic
                        }
                    };
                    setCalculationResult(result);
                 } else {
                     throw new Error("لم يتم العثور على بيانات لحساب المعاش الدوري.");
                 }
            }
        } else {
             setCalculationResult({
                 simpleResultText: "منطق الحساب لهذا القانون لم يتم تنفيذه بعد.",
                 isError: true,
                 pensionerInfo: [], userInputInfo: [], summary: { entitlements: [], deductions: [], totalEntitlements: 0, totalDeductions: 0, netPayable: 0 }
            });
        }
      } catch (error: any) {
        setCalculationResult({
            simpleResultText: `خطأ في الحساب: ${error.message}`,
            isError: true,
            pensionerInfo: [], userInputInfo: [], summary: { entitlements: [], deductions: [], totalEntitlements: 0, totalDeductions: 0, netPayable: 0 }
        });
      }
      setActiveTab('results');
    };

    const calculateArrearsDues = (entitlementDate: Date, lawType: LawType, duesType: 'inheritance' | 'beneficiary') => {
        const periodsToCalculate = formData.multiplePeriods === 'yes' ? formData.periods : [{
            startDate: formData.arrearsStartDate,
            endDate: formData.arrearsEndDate,
            percentage: formData.entitlementPercentage
        }];

        if (formData.multiplePeriods === 'no' && (!formData.arrearsStartDate || !formData.arrearsEndDate)) {
            throw new Error("لحساب المتجمد، الرجاء إدخال تاريخ بداية وتاريخ نهاية المتجمد.");
        }
        
        for (const [index, period] of periodsToCalculate.entries()) {
            if (!period.startDate || !period.endDate) continue;
            
            let minValidPeriodStart: string | undefined;
            if (index === 0) {
                 if (duesType === 'inheritance') {
                    if (!formData.dateOfDeath) throw new Error("تاريخ الوفاة مطلوب لحساب مستحقات التوريث.");
                    minValidPeriodStart = formData.dateOfDeath.slice(0, 7);
                } else { // beneficiary
                    minValidPeriodStart = formData.pensionEntitlementDate;
                }
            } else {
                const prevPeriod = periodsToCalculate[index-1];
                if (prevPeriod.endDate) {
                    minValidPeriodStart = addOneMonth(prevPeriod.endDate);
                }
            }

            if (minValidPeriodStart && period.startDate < minValidPeriodStart) {
                const errorSource = (duesType === 'inheritance' && index === 0) ? 'تاريخ الوفاة' : 'نهاية الفترة السابقة';
                throw new Error(`تاريخ بداية الفترة ${index + 1} (${formatDateDisplay(period.startDate)}) لا يمكن أن يكون قبل ${errorSource} (${formatDateDisplay(minValidPeriodStart)}).`);
            }

            if (period.startDate > period.endDate) {
                 throw new Error(`في الفترة ${index + 1}، تاريخ النهاية (${formatDateDisplay(period.endDate)}) لا يمكن أن يكون قبل تاريخ البداية (${formatDateDisplay(period.startDate)}).`);
            }
        }

        let totalPensionArrears = 0;
        let totalMonthlyGrantArrears = 0;
        let totalExceptionalGrantArrears = 0;
        let totalArrearsCommission = 0;

        let totalMonths = 0;
        const arrearsBreakdown: { period: string; percentage: number; amount: number; months: number }[] = [];
        let hasCalculatedAnyPeriod = false;
        const law148StartDate = new Date('2020-01-01T00:00:00Z');

        const progressionData = calculateAllProgressionData();
        
        let detailsForModal: any = { 
            type: 'arrears', 
            lawType, 
            duesType, 
            arrears: { 
                periods: [], 
                funeralExpenses: null, 
                deathGrant: null 
            } 
        };
        let deductionNotes: string[] = [];
        let deductionWarning: string | undefined;

        for (const period of periodsToCalculate) {
            if (!period.startDate || !period.endDate || !period.percentage) continue;
            
            const startDate = parseDateYYYYMM(period.startDate);
            const endDate = parseDateYYYYMM(period.endDate);
            if (!startDate || !endDate || startDate > endDate) continue;
            
            hasCalculatedAnyPeriod = true;
            const percentage = parseFloat(String(period.percentage)) / 100;
            let currentDate = new Date(startDate);
            
            let periodPensionArrears = 0;
            let periodMonthlyGrantArrears = 0;
            let periodExceptionalGrantArrears = 0;
            let periodMonths = 0;
            
            const periodDetails: any = { period: `${formatDateDisplay(period.startDate)} إلى ${formatDateDisplay(period.endDate)}`, months: 0, percentage: parseFloat(String(period.percentage)), breakdown: [], total: 0 };

            while (currentDate <= endDate) {
                const monthlyPensionWithoutGrants = calculatePensionForDate(currentDate, entitlementDate, lawType, false);
                const monthlyGrant = currentDate >= new Date('1999-01-01T00:00:00Z') ? 10 : 0;
                let exceptionalGrantsForMonth = 0;
                
                if (progressionData && progressionData.mainProgression.summary.exceptionalGrants) {
                    for (const grant of progressionData.mainProgression.summary.exceptionalGrants) {
                        const grantEntitlementDate = new Date(`${grant.date}-01T00:00:00Z`);
                        if (entitlementDate < grantEntitlementDate && currentDate >= grantEntitlementDate) {
                            exceptionalGrantsForMonth += grant.amount;
                        }
                    }
                }
                
                let pensionValueRef = null;
                const entitlementDateForRef = parseDateYYYYMM(formData.pensionEntitlementDate);
                const limitDate = new Date('2008-05-01T00:00:00Z');
                if ((lawType === '79-1975' || lawType === '108-1976') && entitlementDateForRef && entitlementDateForRef < limitDate) {
                    const bonusTableName = getBonusTableNameForDate(currentDate, dynamicPensionTables);
                    if (progressionData && progressionData.otherProgressions) {
                        const correctProg = progressionData.otherProgressions.find(p => p.name === bonusTableName);
                        if (correctProg) {
                            pensionValueRef = correctProg;
                        }
                    }
                }

                periodDetails.breakdown.push({ month: `${currentDate.getUTCFullYear()}-${(currentDate.getUTCMonth() + 1).toString().padStart(2, '0')}`, pensionValue: monthlyPensionWithoutGrants, pensionValueRef, monthlyGrant, exceptionalGrant: exceptionalGrantsForMonth, total: monthlyPensionWithoutGrants + monthlyGrant + exceptionalGrantsForMonth });

                const totalForMonthBeforePercentage = monthlyPensionWithoutGrants + monthlyGrant + exceptionalGrantsForMonth;
                const disbursedTotalForMonth = totalForMonthBeforePercentage * percentage;

                let commissionForMonth = 0;
                if (disbursedTotalForMonth > 0) {
                    if (currentDate >= law148StartDate) {
                        commissionForMonth = calculateCommission(disbursedTotalForMonth, 0.002);
                    } else {
                        // Logic for periods before 2020-01-01
                        switch (lawType) {
                            case '108-1976':
                            case '112-1980':
                            case 'sadat':
                                commissionForMonth = 1;
                                break;
                            case '79-1975':
                                const limitDateFeb2014 = new Date('2014-02-01T00:00:00Z');
                                if (currentDate < limitDateFeb2014) {
                                    commissionForMonth = 1;
                                } else { // From 2014-02-01 to 2019-12-31
                                    const hasVariablePension = (Number(formData.variablePension) || 0) + (Number(formData.specialBonuses) || 0) > 0;
                                    if (hasVariablePension) {
                                        commissionForMonth = 2; // 1 for basic, 1 for variable
                                    } else {
                                        commissionForMonth = 1;
                                    }
                                }
                                break;
                            default:
                                // Fallback to old rounding logic if lawType doesn't match
                                let tempFee = 1 + (disbursedTotalForMonth - Math.floor(disbursedTotalForMonth));
                                if (tempFee > 1) {
                                    commissionForMonth = tempFee;
                                }
                                break;
                        }
                    }
                }
                totalArrearsCommission += commissionForMonth;

                periodPensionArrears += monthlyPensionWithoutGrants * percentage;
                periodMonthlyGrantArrears += monthlyGrant * percentage;
                periodExceptionalGrantArrears += exceptionalGrantsForMonth * percentage;

                periodMonths++;
                currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
            }
            totalPensionArrears += periodPensionArrears;
            totalMonthlyGrantArrears += periodMonthlyGrantArrears;
            totalExceptionalGrantArrears += periodExceptionalGrantArrears;
            totalMonths += periodMonths;
            
            periodDetails.months = periodMonths;
            periodDetails.total = periodPensionArrears + periodMonthlyGrantArrears + periodExceptionalGrantArrears;
            detailsForModal.arrears.periods.push(periodDetails);

            arrearsBreakdown.push({
                period: `${formatDateDisplay(period.startDate)} إلى ${formatDateDisplay(period.endDate)}`,
                percentage: parseFloat(String(period.percentage)),
                amount: periodPensionArrears + periodMonthlyGrantArrears + periodExceptionalGrantArrears,
                months: periodMonths
            });
        }
        
        if (!hasCalculatedAnyPeriod && duesType !== 'beneficiary') {
            throw new Error("لحساب المتجمد، الرجاء إدخال بيانات فترة واحدة صحيحة على الأقل.");
        }
        if (duesType === 'beneficiary' && (lawType === '79-1975' || lawType === '108-1976') && !hasCalculatedAnyPeriod) {
            throw new Error("لحساب متجمد المستفيد، الرجاء إدخال بيانات فترة واحدة صحيحة على الأقل.");
        }

        const userInputInfo: { label: string; value: string | number }[] = [
            { label: 'نوع المستحقات', value: duesType === 'inheritance' ? 'مستحقات توريث' : 'مستحقات مستفيد' },
            { label: 'عدد شهور المتجمد', value: totalMonths },
        ];
        if (formData.multiplePeriods === 'no') {
            userInputInfo.push({ label: 'فترة المتجمد', value: `${formatDateDisplay(formData.arrearsStartDate)} إلى ${formatDateDisplay(formData.arrearsEndDate)}` });
            userInputInfo.push({ label: 'نسبة الاستحقاق', value: `${formData.entitlementPercentage}%` });
        } else {
            userInputInfo.push({ label: 'فترة المتجمد', value: 'فترات متعددة' });
        }
        
        const resultData: CalculationResultData = {
            pensionerInfo: [
                { label: 'الرقم التأميني', value: formData.insuranceNumber },
                { label: 'اسم صاحب المعاش', value: formData.pensionerName },
                { label: 'تاريخ الوفاة', value: formatDateDisplay(formData.dateOfDeath) },
                { label: 'تاريخ الاستحقاق', value: formatDateDisplay(formData.pensionEntitlementDate) },
            ],
            userInputInfo: userInputInfo,
            summary: {
                entitlements: [], deductions: [],
                totalEntitlements: 0, totalDeductions: 0, netPayable: 0
            },
            arrearsBreakdown: formData.multiplePeriods === 'yes' ? arrearsBreakdown : undefined,
        };
        
        let totalUserDeductions = 0;
        const userDeductionsBreakdown: { label: string; value: number }[] = [];
        const deductionLabels: { [key: string]: string } = {
            nasserBankInstallments: 'أقساط بنك ناصر', governmentFund: 'مبالغ للصندوق الحكومي',
            privateFund: 'مبالغ للصندوق الخاص', alimony: 'أقساط نفقة', other: 'أخرى',
        };
        if (formData.hasDeductions === 'yes') {
            for (const key in formData.deductions) {
                const deduction = formData.deductions[key as keyof typeof formData.deductions];
                if (deduction.active && deduction.amount > 0) {
                    totalUserDeductions += deduction.amount;
                    userDeductionsBreakdown.push({ label: deductionLabels[key], value: deduction.amount });
                }
            }
        }

        const totalAllArrears = totalPensionArrears + totalMonthlyGrantArrears + totalExceptionalGrantArrears;
        
        let grossFuneralExpenses = 0;
        let grossDeathGrant = 0;
        
        if (duesType === 'inheritance') {
             const dateOfDeath = parseArabicDate(formData.dateOfDeath);
             if (!dateOfDeath) throw new Error("تاريخ الوفاة مطلوب لحساب مستحقات التوريث.");
             const pensionAtDeath = calculatePensionForDate(dateOfDeath, entitlementDate, lawType, false);
             
             let pensionAtDeathRef = null;
             if ((lawType === '79-1975' || lawType === '108-1976') && entitlementDate < new Date('2008-05-01T00:00:00Z')) {
                 const bonusTableName = getBonusTableNameForDate(dateOfDeath, dynamicPensionTables);
                 if (progressionData && progressionData.otherProgressions) {
                     pensionAtDeathRef = progressionData.otherProgressions.find(p => p.name === bonusTableName) || null;
                 }
             }

             const law148StartDateForGrants = new Date('2020-01-01T00:00:00Z');
             if (dateOfDeath >= law148StartDateForGrants) {
                // Post 2020 rules for ALL laws (79, 108, 112, Sadat, 148)
                grossFuneralExpenses = pensionAtDeath * 3;
                grossDeathGrant = pensionAtDeath * 3;
                detailsForModal.arrears.funeralExpenses = { formula: `معاش شهر الوفاة × 3`, pensionAtDeath, pensionAtDeathRef, result: grossFuneralExpenses };
                detailsForModal.arrears.deathGrant = { formula: `معاش شهر الوفاة × 3`, pensionAtDeath, pensionAtDeathRef, result: grossDeathGrant };
             } else {
                // Pre 2020 rules
                if (lawType === '112-1980' || lawType === 'sadat') {
                    // New special rules for 112/Sadat
                    grossFuneralExpenses = 20;
                    grossDeathGrant = 0; // No death grant
                    detailsForModal.arrears.funeralExpenses = { formula: `قيمة ثابتة قدرها 20 جنيه قبل 2020/01/01`, pensionAtDeath, pensionAtDeathRef, result: grossFuneralExpenses };
                    detailsForModal.arrears.deathGrant = null; // Mark as not applicable
                } else {
                    // Original rules for 79/108
                    grossFuneralExpenses = Math.max(pensionAtDeath * 2, 200);
                    grossDeathGrant = Math.max(pensionAtDeath * 3, 200);
                    detailsForModal.arrears.funeralExpenses = { formula: `الأكبر من (معاش شهر الوفاة × 2) أو 200 جنيه`, pensionAtDeath, pensionAtDeathRef, result: grossFuneralExpenses };
                    detailsForModal.arrears.deathGrant = { formula: `الأكبر من (معاش شهر الوفاة × 3) أو 200 جنيه`, pensionAtDeath, pensionAtDeathRef, result: grossDeathGrant };
                }
             }
        }
        
        const entitlements = [];
        if (totalPensionArrears > 0) entitlements.push({ label: 'متجمد المعاش', value: totalPensionArrears });
        if (totalMonthlyGrantArrears > 0) entitlements.push({ label: 'متجمد المنحة الشهرية', value: totalMonthlyGrantArrears });
        if (totalExceptionalGrantArrears > 0) entitlements.push({ label: 'متجمد المنح الاستثنائية', value: totalExceptionalGrantArrears });
        if (grossFuneralExpenses > 0) entitlements.push({ label: 'مصاريف الجنازة', value: grossFuneralExpenses });
        if (grossDeathGrant > 0) entitlements.push({ label: 'منحة الوفاة', value: grossDeathGrant });
        resultData.summary.entitlements = entitlements;

        let remainingUserDeductions = totalUserDeductions;
        const deductionsFromArrears = Math.min(remainingUserDeductions, totalAllArrears);
        remainingUserDeductions -= deductionsFromArrears;
        
        const deductionsFromDeathGrant = Math.min(remainingUserDeductions, grossDeathGrant);
        remainingUserDeductions -= deductionsFromDeathGrant;
        
        const deductionsFromFuneral = Math.min(remainingUserDeductions, grossFuneralExpenses);
        remainingUserDeductions -= deductionsFromFuneral;
        
        const totalActuallyDeducted = totalUserDeductions - remainingUserDeductions;
        if (totalActuallyDeducted > 0) {
            if (totalActuallyDeducted >= totalUserDeductions) {
                resultData.summary.deductions.push(...userDeductionsBreakdown);
            } else {
                for (const deductionItem of userDeductionsBreakdown) {
                    const proportion = deductionItem.value / totalUserDeductions;
                    const deductedAmount = totalActuallyDeducted * proportion;
                    resultData.summary.deductions.push({ label: deductionItem.label, value: deductedAmount });
                }
            }

            if (deductionsFromArrears > 0) deductionNotes.push(`تم خصم مبلغ ${deductionsFromArrears.toFixed(2)} من متجمد المعاش.`);
            if (deductionsFromDeathGrant > 0) deductionNotes.push(`تم خصم مبلغ ${deductionsFromDeathGrant.toFixed(2)} من منحة الوفاة.`);
            if (deductionsFromFuneral > 0) deductionNotes.push(`تم خصم مبلغ ${deductionsFromFuneral.toFixed(2)} من مصاريف الجنازة.`);
        }
        if (remainingUserDeductions > 0) {
            deductionWarning = `تنبيه: تبقى مبلغ ${remainingUserDeductions.toFixed(2)} من الخصومات لم يتم خصمه لعدم كفاية المستحقات. يرجى اتخاذ الإجراءات القانونية لتحصيله.`;
        }
        
        const netFuneralExpenses = grossFuneralExpenses - deductionsFromFuneral;
        const netDeathGrant = grossDeathGrant - deductionsFromDeathGrant;
        
        const isPost2020Dues = formData.dateOfDeath ? new Date(formData.dateOfDeath) >= law148StartDate : false;
        
        if (totalArrearsCommission > 0) resultData.summary.deductions.push({ label: 'عمولة صرف المتجمد', value: totalArrearsCommission });
        
        let funeralCommission = 0;
        if (netFuneralExpenses > 0) {
            if (isPost2020Dues) {
                funeralCommission = calculateCommission(netFuneralExpenses, 0.002, 20);
            } else {
                funeralCommission = 1;
            }
        }
        if (funeralCommission > 0) resultData.summary.deductions.push({ label: 'عمولة صرف مصاريف الجنازة', value: funeralCommission });

        let deathGrantCommission = 0;
        if (netDeathGrant > 0) {
            if (isPost2020Dues) {
                deathGrantCommission = calculateCommission(netDeathGrant, 0.002, 20);
            } else {
                deathGrantCommission = 1;
            }
        }
        if (deathGrantCommission > 0) resultData.summary.deductions.push({ label: 'عمولة صرف منحة الوفاة', value: deathGrantCommission });
        
        resultData.summary.totalEntitlements = resultData.summary.entitlements.reduce((sum, item) => sum + item.value, 0);
        resultData.summary.totalDeductions = resultData.summary.deductions.reduce((sum, item) => sum + item.value, 0);
        resultData.summary.netPayable = Math.max(0, resultData.summary.totalEntitlements - resultData.summary.totalDeductions);
        resultData.deductionNotes = deductionNotes;
        resultData.deductionWarning = deductionWarning;

        if (progressionData && progressionData.mainProgression.steps.length > 0) {
            let lastEntitlementPercentage = 100;
            if (formData.multiplePeriods === 'yes') {
                const lastValidPeriod = [...formData.periods].reverse().find(p => p.percentage > 0);
                if (lastValidPeriod) {
                    lastEntitlementPercentage = parseFloat(String(lastValidPeriod.percentage));
                }
            } else {
                lastEntitlementPercentage = parseFloat(String(formData.entitlementPercentage));
            }
            const lastPercentageFactor = lastEntitlementPercentage / 100;

            const finalPensionValue = calculatePensionForDate(new Date(), entitlementDate, lawType, false);

            const currentPension = finalPensionValue * lastPercentageFactor;
            const monthlyGrant = (progressionData.mainProgression.summary.monthlyGrant || 0) * lastPercentageFactor;
            
            let currentExceptionalGrants = 0;
            if (progressionData.mainProgression.summary.exceptionalGrants) {
                for (const grant of progressionData.mainProgression.summary.exceptionalGrants) {
                    const grantEntitlementDate = new Date(`${grant.date}-01T00:00:00Z`);
                    if (entitlementDate < grantEntitlementDate) { // Grant applies if entitlement is before it
                        currentExceptionalGrants += grant.amount;
                    }
                }
            }
            const exceptionalGrant = currentExceptionalGrants * lastPercentageFactor;

            const totalMonthlyEntitlement = currentPension + monthlyGrant + exceptionalGrant;
            
            const netBeforeAdjustment = totalMonthlyEntitlement - (totalMonthlyEntitlement * 0.002);
            const finalDisbursementFee = totalMonthlyEntitlement - Math.floor(netBeforeAdjustment);
            const netPayablePeriodic = Math.floor(netBeforeAdjustment);

            resultData.currentPensionBreakdown = {
                currentPension,
                monthlyGrant,
                exceptionalGrant,
                totalEntitlement: totalMonthlyEntitlement,
                disbursementFee: finalDisbursementFee,
                netPayable: netPayablePeriodic
            };
        }
        
        if (progressionData) {
            setPensionProgressionData(progressionData);
        }
        setCalculationResult(resultData);
        setCalculationDetails(detailsForModal);
    };

    const calculateSeveranceDues = (entitlementDate: Date, lawType: LawType) => {
        const severanceDate = parseArabicDate(formData.severanceDate);
        if (!severanceDate) throw new Error("الرجاء إدخال تاريخ قطع صحيح.");

        const law148StartDate = new Date('2020-01-01T00:00:00Z');
        if ((lawType === '112-1980' || lawType === 'sadat') && severanceDate < law148StartDate) {
            setCalculationResult({
                simpleResultText: "لا يستحق المستفيد منحة قطع حيث أن تاريخ القطع قبل تاريخ العمل بالقانون 148 لسنة 2019.",
                isError: true,
                pensionerInfo: [], userInputInfo: [], summary: { entitlements: [], deductions: [], totalEntitlements: 0, totalDeductions: 0, netPayable: 0 }
            });
            return;
        }

        if (formData.dateOfDeath) {
            const dateOfDeath = parseArabicDate(formData.dateOfDeath);
            if(dateOfDeath && severanceDate < dateOfDeath) {
                 throw new Error("تاريخ قطع المستفيد يجب أن يكون بعد أو في نفس تاريخ وفاة صاحب المعاش.");
            }
        }

        let totalUserDeductions = 0;
        const userDeductionsBreakdown: { label: string; value: number }[] = [];
        const deductionLabels: { [key: string]: string } = {
            nasserBankInstallments: 'أقساط بنك ناصر', governmentFund: 'مبالغ للصندوق الحكومي',
            privateFund: 'مبالغ للصندوق الخاص', alimony: 'أقساط نفقة', other: 'أخرى',
        };
        if (formData.hasDeductions === 'yes') {
            for (const key in formData.deductions) {
                const deduction = formData.deductions[key as keyof typeof formData.deductions];
                if (deduction.active && deduction.amount > 0) {
                    totalUserDeductions += deduction.amount;
                    userDeductionsBreakdown.push({ label: deductionLabels[key], value: deduction.amount });
                }
            }
        }

        const pensionAtSeverance = calculatePensionForDate(severanceDate, entitlementDate, lawType, false);
        const maxPercentage = (2 / 3) * 100;
        const inputPercentage = parseFloat(String(formData.severancePercentage));
        const cappedPercentage = Math.min(inputPercentage, maxPercentage);
        const percentage = cappedPercentage / 100;
        const grant = pensionAtSeverance * percentage * 12;
        
        let finalGrant: number;
        if (severanceDate >= law148StartDate) {
            finalGrant = Math.max(grant, 500);
        } else {
            finalGrant = Math.max(grant, 200);
        }

        const cappedUserDeductions = Math.min(totalUserDeductions, finalGrant);
        const netGrant = finalGrant - cappedUserDeductions;
        
        const isPost2020Dues = severanceDate >= law148StartDate;
        let disbursementFee;
        if (isPost2020Dues) {
            disbursementFee = calculateCommission(netGrant, 0.002, 20);
        } else {
            disbursementFee = netGrant > 0 ? 1 : 0;
        }
        
        const netPayable = Math.max(0, netGrant - disbursementFee);

        const resultData: CalculationResultData = {
            pensionerInfo: [
                { label: 'الرقم التأميني', value: formData.insuranceNumber },
                { label: 'اسم صاحب المعاش', value: formData.pensionerName },
                { label: 'تاريخ الاستحقاق', value: formatDateDisplay(formData.pensionEntitlementDate) },
            ],
            userInputInfo: [
                { label: 'نوع المستحقات', value: 'منحة قطع للمستفيد' },
                { label: 'تاريخ القطع', value: formatDateDisplay(formData.severanceDate) },
                { label: 'نسبة الاستحقاق المدخلة', value: `${formData.severancePercentage}%` },
                { label: 'النسبة المطبقة (بعد الحد الأقصى)', value: `${cappedPercentage.toFixed(2)}%` },
                { label: 'المعاش في شهر القطع', value: pensionAtSeverance.toFixed(2) },
            ],
             summary: {
                entitlements: [{ label: 'قيمة المنحة (بعد تطبيق الحد الأدنى)', value: finalGrant }],
                deductions: [],
                totalEntitlements: finalGrant,
                totalDeductions: 0,
                netPayable: 0
            },
            deductionNotes: [],
            deductionWarning: undefined,
        };

        if (cappedUserDeductions > 0) {
            if (cappedUserDeductions >= totalUserDeductions) {
                resultData.summary.deductions.push(...userDeductionsBreakdown);
            } else {
                for (const deductionItem of userDeductionsBreakdown) {
                    const proportion = deductionItem.value / totalUserDeductions;
                    const deductedAmount = cappedUserDeductions * proportion;
                    resultData.summary.deductions.push({ label: deductionItem.label, value: deductedAmount });
                }
            }
            resultData.deductionNotes?.push(`تم خصم مبلغ ${cappedUserDeductions.toFixed(2)} من منحة القطع.`);
        }
        if (totalUserDeductions > cappedUserDeductions) {
            const remainingDeductions = totalUserDeductions - cappedUserDeductions;
            resultData.deductionWarning = `تنبيه: تبقى مبلغ ${remainingDeductions.toFixed(2)} من الخصومات لم يتم خصمه لعدم كفاية منحة القطع. يرجى اتخاذ الإجراءات القانونية لتحصيله.`;
        }

        if (disbursementFee > 0) {
            resultData.summary.deductions.push({ label: 'عمولة الصرف لمنحة القطع', value: disbursementFee });
        }
        
        resultData.summary.totalDeductions = resultData.summary.deductions.reduce((sum, item) => sum + item.value, 0);
        resultData.summary.netPayable = netPayable;
        
        // --- Reference table logic for details modal ---
        let pensionAtSeveranceRef = null;
        const entitlementDateForRef = parseDateYYYYMM(formData.pensionEntitlementDate);
        const limitDate = new Date('2008-05-01T00:00:00Z');
        if ((lawType === '79-1975' || lawType === '108-1976') && entitlementDateForRef && entitlementDateForRef < limitDate) {
            const progressionData = calculateAllProgressionData();
            if (progressionData) {
                setPensionProgressionData(progressionData); // Ensure it's available for the modal
                const bonusTableName = getBonusTableNameForDate(severanceDate, dynamicPensionTables);
                pensionAtSeveranceRef = progressionData.otherProgressions.find(p => p.name === bonusTableName) || null;
            }
        }
        
        setCalculationResult(resultData);
        setCalculationDetails({ type: 'severance', lawType, severance: { grant: { formula: `الأكبر من (المعاش في شهر القطع × نسبة الاستحقاق المطبقة × 12) أو ${severanceDate >= law148StartDate ? '500' : '200'} جنيه`, pensionAtSeverance, pensionAtSeveranceRef, percentage: cappedPercentage, result: finalGrant } } });
    };


    const handleReset = () => {
      setFormData(defaultFormData);
      setCalculationResult(null);
      setCalculationDetails(null);
      setQueriedPensionResult(null);
      setQueryDate('');
      setActiveTab('input');
    }

    const handleCloseCompensationModal = () => {
        setIsCompensationModalOpen(false);
        // We only uncheck if the modal is closed manually, not if calculation is done inside it.
        // This keeps the state consistent.
        if (formData.noBeneficiaries) {
             setFormData(prev => ({ ...prev, noBeneficiaries: false }));
        }
    };
    
    const lawType = formData.lawType;
    const duesType = formData.duesType;

    const renderDeductions = () => (
      <div className="mt-4 p-4 bg-[var(--surface-container)] rounded-2xl">
        <h4 className="font-semibold text-[var(--on-surface)] mb-3">بيان المبالغ واجبة الخصم</h4>
        <div className="space-y-4">
          {Object.entries({
            nasserBankInstallments: 'أقساط بنك ناصر',
            governmentFund: 'مبالغ مستحقة للصندوق الحكومي',
            privateFund: 'مبالغ مستحقة للصندوق الخاص',
            alimony: 'أقساط نفقة',
            other: 'أخري',
          }).map(([key, label]) => (
            <div key={key} className="grid grid-cols-5 gap-4 items-center">
              <div className="col-span-5 sm:col-span-3 flex items-center">
                <input
                  type="checkbox"
                  id={`deduction_check_${key}`}
                  name={`deduction_${key}_active`}
                  checked={formData.deductions[key as keyof typeof formData.deductions].active}
                  onChange={handleChange}
                  className="ml-3 h-4 w-4 rounded border-[var(--outline)] bg-transparent text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-[var(--surface-container)]"
                />
                <label htmlFor={`deduction_check_${key}`} className="text-sm font-medium text-[var(--on-surface)]">{label}</label>
              </div>
              <div className="col-span-5 sm:col-span-2">
                {formData.deductions[key as keyof typeof formData.deductions].active && (
                  <input
                    type="number"
                    min="0"
                    name={`deduction_${key}_amount`}
                    value={formData.deductions[key as keyof typeof formData.deductions].amount}
                    onChange={handleChange}
                    className="input-style"
                    placeholder="قيمة المبلغ"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
    
    const renderArrearsAndDeductions = () => {
        const todayMonth = new Date().toISOString().slice(0, 7);
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="md:col-span-1">
                        <label htmlFor="arrearsStartDate" className="form-label">تاريخ بداية متجمد المعاش</label>
                        <input type="month" placeholder="YYYY-MM" name="arrearsStartDate" value={formData.arrearsStartDate} onChange={handleChange} className="input-style" min={minValidArrearsStartDate} max={formData.arrearsEndDate || todayMonth} ref={arrearsStartDateRef} onKeyDown={(e) => handleKeyDown(e, arrearsEndDateRef)} />
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="arrearsEndDate" className="form-label">تاريخ نهاية المتجمد</label>
                        <input type="month" placeholder="YYYY-MM" name="arrearsEndDate" value={formData.arrearsEndDate} onChange={handleChange} className="input-style" min={formData.arrearsStartDate} max={todayMonth} ref={arrearsEndDateRef} onKeyDown={(e) => handleKeyDown(e, entitlementPercentageRef)} />
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="entitlementPercentage" className="form-label">نسبة الاستحقاق</label>
                        <div className="relative">
                            <input type="number" name="entitlementPercentage" value={formData.entitlementPercentage} onChange={handleChange} className="input-style pr-8" ref={entitlementPercentageRef} min="0" max="100"/>
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]">%</span>
                        </div>
                    </div>
                </div>
                <div>
                  <label className="form-label">هل يوجد مبالغ واجبة الخصم؟</label>
                  <div className="flex gap-6 items-center mt-2">
                      <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="no" checked={formData.hasDeductions === 'no'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent"/> لا</label>
                      <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="yes" checked={formData.hasDeductions === 'yes'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent"/> نعم</label>
                  </div>
                </div>
                {formData.hasDeductions === 'yes' && renderDeductions()}
            </div>
        );
    }

    const renderOtherLawsForm = () => {
        const isNoBeneficiariesDisabled = !formData.pensionEntitlementDate || ((Number(formData.normalBasicPension) || 0) <= 0);
        return (
            <div className="space-y-8">
                <section className="p-6 border border-[var(--outline-variant)] rounded-2xl shadow-sm bg-[var(--surface)]">
                    <h3 className="form-section-header">1. بيانات صاحب المعاش</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                            <label htmlFor="insuranceNumber" className="form-label">الرقم التأميني</label>
                            <input type="text" name="insuranceNumber" value={formData.insuranceNumber} onChange={handleChange} className="input-style" ref={insuranceNumberRef} onKeyDown={(e) => handleKeyDown(e, pensionerNameRef)} />
                        </div>
                        <div>
                            <label htmlFor="pensionerName" className="form-label">اسم صاحب المعاش</label>
                            <input type="text" name="pensionerName" value={formData.pensionerName} onChange={handleChange} className="input-style" ref={pensionerNameRef} onKeyDown={(e) => handleKeyDown(e, dateOfBirthRef)} />
                        </div>
                        <div>
                            <label htmlFor="pensionEntitlementDate" className="form-label">تاريخ استحقاق المعاش</label>
                            <input type="month" placeholder="YYYY-MM" name="pensionEntitlementDate" value={formData.pensionEntitlementDate} onChange={handleChange} className="input-style" ref={pensionEntitlementDateRef} onKeyDown={(e) => handleKeyDown(e, dateOfDeathRef)} required />
                        </div>
                        {(lawType === '79-1975' || lawType === '108-1976' || lawType === '148-2019') && (
                            <div>
                                <label htmlFor="dateOfDeath" className="form-label">تاريخ وفاة صاحب المعاش</label>
                                <CustomDateInput
                                    ref={dateOfDeathRef}
                                    value={formData.dateOfDeath}
                                    onChange={(newDateValue) => {
                                        setFormData(prev => ({ ...prev, dateOfDeath: newDateValue }));
                                        setCalculationResult(null);
                                        if (activeTab === 'results') setActiveTab('input');
                                    }}
                                    min={formData.pensionEntitlementDate ? `${formData.pensionEntitlementDate}-01` : undefined}
                                    onYearKeyDown={(e) => handleKeyDown(e, normalBasicPensionRef)}
                                />
                            </div>
                        )}
                    </div>
                </section>
        
                <section className="p-6 border border-[var(--outline-variant)] rounded-2xl shadow-sm bg-[var(--surface)]">
                    <h3 className="form-section-header">2. قيم المعاش</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                            <label htmlFor="normalBasicPension" className="form-label flex items-center gap-2">
                                <span>قيمة المعاش الأساسي الطبيعي</span>
                                {lawType === '108-1976' && (
                                    <span className="cursor-help" title="هذا الحقل مخصص لإدخال المعاش الأساسي المجرد والعلاوات الأربعة المستحقة علي المعاش الأساسي">
                                        <InfoIcon className="h-4 w-4 text-[var(--on-surface-variant)]" />
                                    </span>
                                )}
                            </label>
                            <input type="number" step="0.01" min="0" name="normalBasicPension" value={formData.normalBasicPension} onChange={handleChange} className="input-style" ref={normalBasicPensionRef} onKeyDown={(e) => handleKeyDown(e, (lawType === '79-1975' || lawType === '148-2019') ? injuryBasicPensionRef : null)} required />
                        </div>

                        {(lawType === '79-1975' || lawType === '148-2019') && (
                            <div>
                                <label htmlFor="injuryBasicPension" className="form-label">قيمة المعاش الأساسي الإصابي</label>
                                <input type="number" step="0.01" min="0" name="injuryBasicPension" value={formData.injuryBasicPension} onChange={handleChange} className="input-style" ref={injuryBasicPensionRef} onKeyDown={(e) => handleKeyDown(e, lawType === '79-1975' ? variablePensionRef : null)} />
                            </div>
                        )}
                
                        {lawType === '79-1975' && (
                            <>
                                <div>
                                    <label htmlFor="variablePension" className="form-label">قيمة المعاش المتغير</label>
                                    <input type="number" step="0.01" min="0" name="variablePension" value={formData.variablePension} onChange={handleChange} className="input-style" ref={variablePensionRef} onKeyDown={(e) => handleKeyDown(e, specialBonusesRef)} />
                                </div>
                                <div>
                                    <label htmlFor="specialBonuses" className="form-label">العلاوات الخاصة للمعاش المتغير</label>
                                    <input type="number" step="0.01" min="0" name="specialBonuses" value={formData.specialBonuses} onChange={handleChange} className="input-style" ref={specialBonusesRef} />
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {formData.pensionEntitlementDate && (lawType === '79-1975' || lawType === '108-1976' || lawType === '148-2019') && (
                    <section>
                        <h3 className="form-section-header">3. تفاصيل المستحقات التأمينية</h3>
                        <div className="mb-4" title={isNoBeneficiariesDisabled ? "الرجاء إدخال تاريخ استحقاق وقيمة معاش أساسي أولاً" : ""}>
                            <label className={`flex items-center w-fit ${isNoBeneficiariesDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                                <input
                                    type="checkbox"
                                    name="noBeneficiaries"
                                    checked={formData.noBeneficiaries}
                                    onChange={handleChange}
                                    disabled={isNoBeneficiariesDisabled}
                                    className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent"
                                />
                                لا يوجد مستحقين فى المعاش
                            </label>
                        </div>
                        {!formData.noBeneficiaries && (
                            <div>
                                <label htmlFor="duesType" className="form-label">نوع المستحقات التأمينية</label>
                                <select name="duesType" value={formData.duesType} onChange={handleChange} className="input-style">
                                    <option value="">-- اختر --</option>
                                    {formData.dateOfDeath && <option value="inheritance">مستحقات توريث معاش</option>}
                                    {formData.dateOfDeath && <option value="severance">منحة قطع للمستفيد</option>}
                                    <option value="beneficiary">مستحقات مستفيد</option>
                                </select>
                            </div>
                        )}
                    </section>
                )}
        
                {duesType && (lawType === '79-1975' || lawType === '108-1976' || lawType === '148-2019') && (
                    <section className="p-4 bg-[var(--surface-container)] rounded-2xl">
                        {(duesType === 'inheritance' || duesType === 'beneficiary') && (
                            <div>
                                <div>
                                    <label className="form-label">هل يتم حساب المتجمد علي اكثر من فترة؟</label>
                                    <div className="flex gap-6 items-center mt-2">
                                        <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="multiplePeriods" value="no" checked={formData.multiplePeriods === 'no'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] bg-transparent border-[var(--outline)]" /> لا</label>
                                        <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="multiplePeriods" value="yes" checked={formData.multiplePeriods === 'yes'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] bg-transparent border-[var(--outline)]" /> نعم</label>
                                    </div>
                                </div>

                                {formData.multiplePeriods === 'no' && (
                                    <div className="mt-4">{renderArrearsAndDeductions()}</div>
                                )}

                                {formData.multiplePeriods === 'yes' && (
                                    <div className="mt-4 space-y-4">
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-[600px] text-sm text-center">
                                                <thead className="bg-[var(--surface)]">
                                                    <tr>
                                                        <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">الفترة</th>
                                                        <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">تاريخ بداية المتجمد</th>
                                                        <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">تاريخ نهاية المتجمد</th>
                                                        <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نسبة الاستحقاق (%)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {formData.periods.map((period, index) => {
                                                        const todayMonth = new Date().toISOString().slice(0, 7);
                                                        const minStartDate = index === 0 ? minValidArrearsStartDate : (formData.periods[index - 1].endDate ? addOneMonth(formData.periods[index - 1].endDate) : '');
                                                        const isStartDateReadOnly = index > 0 && !!formData.periods[index - 1].endDate;
                                        
                                                        return (
                                                            <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0">
                                                                <td className="p-2 font-medium">الفترة {['الأولي', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'][index]}</td>
                                                                <td className="p-2">
                                                                    <input
                                                                        type="month"
                                                                        placeholder="YYYY-MM"
                                                                        name={`period_${index}_startDate`}
                                                                        value={period.startDate}
                                                                        onChange={handleChange}
                                                                        className={`input-style w-full ${isStartDateReadOnly ? 'bg-[var(--surface-container)] text-[var(--on-surface-variant)] cursor-not-allowed' : ''}`}
                                                                        min={minStartDate}
                                                                        max={period.endDate || todayMonth}
                                                                        readOnly={isStartDateReadOnly}
                                                                    />
                                                                </td>
                                                                <td className="p-2">
                                                                    <input
                                                                        type="month"
                                                                        placeholder="YYYY-MM"
                                                                        name={`period_${index}_endDate`}
                                                                        value={period.endDate}
                                                                        onChange={handleChange}
                                                                        className="input-style w-full"
                                                                        min={period.startDate || ''}
                                                                        max={todayMonth}
                                                                        disabled={!period.startDate}
                                                                    />
                                                                </td>
                                                                <td className="p-2">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max="100"
                                                                        name={`period_${index}_percentage`}
                                                                        value={period.percentage}
                                                                        onChange={handleChange}
                                                                        className="input-style w-full"
                                                                        disabled={!period.startDate}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div>
                                            <label className="form-label">هل يوجد مبالغ واجبة الخصم؟</label>
                                            <div className="flex gap-6 items-center mt-2">
                                                <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="no" checked={formData.hasDeductions === 'no'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent" /> لا</label>
                                                <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="yes" checked={formData.hasDeductions === 'yes'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent" /> نعم</label>
                                            </div>
                                        </div>
                                        {formData.hasDeductions === 'yes' && renderDeductions()}
                                    </div>
                                )}
                            </div>
                        )}

                        {duesType === 'severance' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="severanceDate" className="form-label">تاريخ قطع المستفيد</label>
                                        <CustomDateInput
                                            value={formData.severanceDate}
                                            onChange={(newDateValue) => {
                                                setFormData(prev => ({ ...prev, severanceDate: newDateValue }));
                                                setCalculationResult(null);
                                                if (activeTab === 'results') setActiveTab('input');
                                            }}
                                            min={formData.dateOfDeath || undefined}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="severancePercentage" className="form-label">نسبة استحقاق المعاش</label>
                                        <div className="relative"><input type="number" min="0" max="100" name="severancePercentage" value={formData.severancePercentage} onChange={handleChange} className="input-style pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]">%</span></div>
                                    </div>
                                </div>
                                <div>
                                    <label className="form-label">هل يوجد مبالغ واجبة الخصم؟</label>
                                    <div className="flex gap-6 items-center mt-2">
                                        <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="no" checked={formData.hasDeductions === 'no'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent" /> لا</label>
                                        <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="yes" checked={formData.hasDeductions === 'yes'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent" /> نعم</label>
                                    </div>
                                </div>
                                {formData.hasDeductions === 'yes' && renderDeductions()}
                            </div>
                        )}
                    </section>
                )}
            </div>
        )
    };

    const renderLaw112Form = () => {
        const todayMonth = new Date().toISOString().slice(0, 7);
        const allDuesTypeOptions = [
            { value: "inheritance", label: "مستحقات توريث معاش" },
            { value: "severance", label: "منحة قطع للمستفيد" },
            { value: "beneficiary", label: "مستحقات مستفيد" }
        ];

        const duesTypeOptions = formData.dateOfDeath 
            ? allDuesTypeOptions
            : allDuesTypeOptions.filter(opt => opt.value !== 'inheritance' && opt.value !== 'severance');

        return (
            <div className="space-y-8">
                <section className="p-6 border border-[var(--outline-variant)] rounded-2xl shadow-sm bg-[var(--surface)]">
                    <h3 className="form-section-header">بيانات صاحب المعاش</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                            <label htmlFor="insuranceNumber" className="form-label">الرقم التأميني</label>
                            <input type="text" name="insuranceNumber" value={formData.insuranceNumber} onChange={handleChange} className="input-style" ref={insuranceNumberRef} onKeyDown={(e) => handleKeyDown(e, pensionerNameRef)} />
                        </div>
                        <div>
                            <label htmlFor="pensionerName" className="form-label">اسم صاحب المعاش</label>
                            <input type="text" name="pensionerName" value={formData.pensionerName} onChange={handleChange} className="input-style" ref={pensionerNameRef} onKeyDown={(e) => handleKeyDown(e, pensionEntitlementDateRef)} />
                        </div>
                        <div>
                            <label htmlFor="pensionEntitlementDate" className="form-label">تاريخ استحقاق المعاش</label>
                            <input type="month" placeholder="YYYY-MM" name="pensionEntitlementDate" value={formData.pensionEntitlementDate} onChange={handleChange} className="input-style" max={formData.dateOfDeath ? formData.dateOfDeath.slice(0,7) : todayMonth} ref={pensionEntitlementDateRef} onKeyDown={(e) => handleKeyDown(e, dateOfDeathRef)} required />
                        </div>
                        <div>
                            <label htmlFor="dateOfDeath" className="form-label">تاريخ وفاة صاحب المعاش</label>
                            <CustomDateInput 
                                ref={dateOfDeathRef}
                                value={formData.dateOfDeath}
                                onChange={(newDateValue) => {
                                    setFormData(prev => ({ ...prev, dateOfDeath: newDateValue }));
                                    setCalculationResult(null);
                                    if (activeTab === 'results') setActiveTab('input');
                                }}
                                min={formData.pensionEntitlementDate ? `${formData.pensionEntitlementDate}-01` : undefined}
                            />
                        </div>
                    </div>
                </section>

                {formData.pensionEntitlementDate && (
                  <section>
                      <h3 className="form-section-header">تفاصيل المستحقات التأمينية</h3>
                       <div>
                          <label htmlFor="duesType" className="form-label">نوع المستحقات التأمينية</label>
                          <select name="duesType" value={formData.duesType} onChange={handleChange} className="input-style">
                              <option value="">-- اختر --</option>
                              {duesTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                      </div>
                  </section>
                )}


                {duesType && (
                  <section className="p-4 bg-[var(--surface-container)] rounded-2xl">
                      {(duesType === 'inheritance' || duesType === 'beneficiary') && (
                          <>
                              <div>
                                  <label className="form-label">هل يتم حساب المتجمد علي اكثر من فترة؟</label>
                                  <div className="flex gap-6 items-center mt-2">
                                    <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="multiplePeriods" value="no" checked={formData.multiplePeriods === 'no'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] bg-transparent border-[var(--outline)]"/> لا</label>
                                    <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="multiplePeriods" value="yes" checked={formData.multiplePeriods === 'yes'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] bg-transparent border-[var(--outline)]"/> نعم</label>
                                  </div>
                              </div>

                              {formData.multiplePeriods === 'no' && <div className="mt-4">{renderArrearsAndDeductions()}</div>}
                              
                              {formData.multiplePeriods === 'yes' && (
                                  <div className="mt-4 space-y-4">
                                      <div className="overflow-x-auto">
                                          <table className="w-full min-w-[600px] text-sm text-center">
                                              <thead className="bg-[var(--surface)]">
                                              <tr>
                                                  <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">الفترة</th>
                                                  <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">تاريخ بداية المتجمد</th>
                                                  <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">تاريخ نهاية المتجمد</th>
                                                  <th className="p-2 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نسبة الاستحقاق (%)</th>
                                              </tr>
                                              </thead>
                                              <tbody>
                                              {formData.periods.map((period, index) => {
                                                  const isStartDateReadOnly = index > 0 && !!formData.periods[index - 1].endDate;
                                                  
                                                  return (
                                                      <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0">
                                                          <td className="p-2 font-medium">الفترة {['الأولي', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'][index]}</td>
                                                          <td className="p-2">
                                                            <input 
                                                                type="month" 
                                                                placeholder="YYYY-MM" 
                                                                name={`period_${index}_startDate`} 
                                                                value={period.startDate} 
                                                                onChange={handleChange} 
                                                                className={`input-style w-full ${isStartDateReadOnly ? 'bg-[var(--surface-container)] text-[var(--on-surface-variant)] cursor-not-allowed' : ''}`} 
                                                                min={index === 0 ? minValidArrearsStartDate : (formData.periods[index - 1].endDate ? addOneMonth(formData.periods[index - 1].endDate) : '')}
                                                                max={period.endDate || todayMonth}
                                                                readOnly={isStartDateReadOnly}
                                                            />
                                                          </td>
                                                          <td className="p-2">
                                                            <input 
                                                                type="month" 
                                                                placeholder="YYYY-MM" 
                                                                name={`period_${index}_endDate`} 
                                                                value={period.endDate} 
                                                                onChange={handleChange} 
                                                                className="input-style w-full" 
                                                                min={period.startDate || ''} 
                                                                max={todayMonth}
                                                                disabled={!period.startDate}
                                                            />
                                                          </td>
                                                          <td className="p-2">
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                max="100" 
                                                                name={`period_${index}_percentage`} 
                                                                value={period.percentage} 
                                                                onChange={handleChange} 
                                                                className="input-style w-full"
                                                                disabled={!period.startDate}
                                                            />
                                                          </td>
                                                      </tr>
                                                  );
                                              })}
                                              </tbody>
                                          </table>
                                      </div>
                                      <div>
                                          <label className="form-label">هل يوجد مبالغ واجبة الخصم؟</label>
                                          <div className="flex gap-6 items-center mt-2">
                                              <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="no" checked={formData.hasDeductions === 'no'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent"/> لا</label>
                                              <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="yes" checked={formData.hasDeductions === 'yes'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent"/> نعم</label>
                                          </div>
                                      </div>
                                      {formData.hasDeductions === 'yes' && renderDeductions()}
                                  </div>
                              )}
                          </>
                      )}

                      {duesType === 'severance' && (
                           <div className="space-y-6">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div>
                                       <label htmlFor="severanceDate" className="form-label">تاريخ قطع المستفيد</label>
                                       <CustomDateInput
                                            value={formData.severanceDate}
                                            onChange={(newDateValue) => {
                                                setFormData(prev => ({ ...prev, severanceDate: newDateValue }));
                                                setCalculationResult(null);
                                                if (activeTab === 'results') setActiveTab('input');
                                            }}
                                            min={formData.dateOfDeath || undefined}
                                        />
                                  </div>
                                  <div>
                                      <label htmlFor="severancePercentage" className="form-label">نسبة استحقاق المعاش</label>
                                      <div className="relative"><input type="number" min="0" max="100" name="severancePercentage" value={formData.severancePercentage} onChange={handleChange} className="input-style pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]">%</span></div>
                                  </div>
                               </div>
                              {/* Deductions can also apply to severance */}
                              <div className="md:col-span-2">
                                <label className="form-label">هل يوجد مبالغ واجبة الخصم؟</label>
                                <div className="flex gap-6 items-center mt-2">
                                    <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="no" checked={formData.hasDeductions === 'no'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent"/> لا</label>
                                    <label className="flex items-center cursor-pointer text-[var(--on-surface)]"><input type="radio" name="hasDeductions" value="yes" checked={formData.hasDeductions === 'yes'} onChange={handleChange} className="ml-2 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent"/> نعم</label>
                                </div>
                              </div>
                              {formData.hasDeductions === 'yes' && <div className="md:col-span-2">{renderDeductions()}</div>}
                          </div>
                      )}
                  </section>
                )}
            </div>
        );
    }


    return (
        <div className="bg-[var(--surface-container-low)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-1 p-6 sm:p-8 transition-colors duration-300">
            
            <div className="p-4 mb-6 bg-[var(--tertiary-container)] rounded-2xl" role="alert">
                <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                        <svg className="h-6 w-6 text-[var(--on-tertiary-container)]" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                        </svg>
                    </div>
                    <div className="mr-4 flex-1">
                        <h3 className="text-md font-bold text-[var(--on-tertiary-container)]">تنويه</h3>
                        <p className="mt-1 text-sm text-[var(--on-tertiary-container)]/80">
                            هذا البرنامج مخصص لحساب متجمدات المعاش لصاحب المعاش بعد ربطه وكذا مستحقات توريث المعاش ومنح قطع المستفيدين وحالات الاستحقاق بعد الوفاة وعودة الحق ولا يقوم البرنامج بحساب المعاش ذاته للمؤمن عليه
                        </p>
                    </div>
                </div>
            </div>

            <section className="mb-6">
                <label htmlFor="lawType" className="form-label">نوع القانون</label>
                <select id="lawType" name="lawType" value={formData.lawType} onChange={handleChange} className="input-style">
                    <option value="">-- اختر القانون --</option>
                    <option value="79-1975">قانون 79 لسنة 1975</option>
                    <option value="108-1976">قانون 108 لسنة 1976</option>
                    <option value="112-1980">قانون 112 لسنة 1980</option>
                    <option value="sadat" hidden>قانون السادات</option>
                    <option value="148-2019">قانون 148 لسنة 2019</option>
                </select>
            </section>
            
            {lawType && (
                <>
                    <div className="border-b border-[var(--outline-variant)]">
                        <nav className="-mb-px flex space-x-1" aria-label="Tabs" role="tablist">
                            <TabButton label="بيانات الإدخال" isActive={activeTab === 'input'} onClick={() => setActiveTab('input')} />
                            
                            {calculationResult && (
                                <TabButton label="نتائج الحساب" isActive={activeTab === 'results'} onClick={() => setActiveTab('results')} />
                            )}
                        </nav>
                    </div>

                    <div className="py-6 bg-transparent">
                        <div role="tabpanel" hidden={activeTab !== 'input'}>
                            {(lawType === '79-1975' || lawType === '108-1976' || lawType === '148-2019') && renderOtherLawsForm()}
                            {(lawType === '112-1980' || lawType === 'sadat') && renderLaw112Form()}
                        </div>
                        
                        <div role="tabpanel" hidden={activeTab !== 'results'}>
                            {calculationResult && (
                                <div className="space-y-4">
                                    <ResultsDisplay 
                                        data={calculationResult} 
                                        isCurrentPensionVisible={isCurrentPensionBreakdownVisible}
                                        onToggleCurrentPension={() => setIsCurrentPensionBreakdownVisible(p => !p)}
                                    />
                                    <div className="flex items-center gap-4 text-left mt-6 flex-wrap">
                                        {(formData.lawType === '112-1980' || formData.lawType === 'sadat' || formData.lawType === '79-1975' || formData.lawType === '108-1976' || formData.lawType === '148-2019') && (
                                            <button
                                                onClick={handleShowProgression}
                                                className="px-6 py-2 bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)] font-semibold rounded-full hover:bg-[color-mix(in_srgb,_var(--on-tertiary-container)_8%,_var(--tertiary-container))] transition shadow-sm"
                                            >
                                                عرض تدرج المعاش
                                            </button>
                                        )}
                                        {calculationDetails && (
                                            <button
                                                onClick={() => setCalculationDetailsModalOpen(true)}
                                                className="px-6 py-2 bg-[var(--secondary-container)] text-[var(--on-secondary-container)] font-semibold rounded-full hover:bg-[color-mix(in_srgb,_var(--on-secondary-container)_8%,_var(--secondary-container))] transition shadow-sm"
                                            >
                                                كيف تم الحساب
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 pt-6 border-t border-[var(--outline-variant)] flex flex-col sm:flex-row items-center gap-4">
                        <button
                            onClick={handleCalculate}
                            className="w-full sm:w-auto px-10 py-3 bg-[var(--primary)] text-[var(--on-primary)] font-bold rounded-full shadow-elevation-1 hover:shadow-elevation-2 hover:bg-[color-mix(in_srgb,_var(--on-primary)_8%,_var(--primary))] active:bg-[color-mix(in_srgb,_var(--on-primary)_12%,_var(--primary))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--primary)] transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            حساب المستحقات
                        </button>
                        <button
                            onClick={handleReset}
                            className="w-full sm:w-auto px-8 py-3 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] border border-[var(--outline)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--outline)] transition-all"
                        >
                            إعادة تعيين
                        </button>
                    </div>
                </>
            )}

            <PensionProgressionModal
                isOpen={isProgressionModalOpen}
                onClose={() => setIsProgressionModalOpen(false)}
                data={pensionProgressionData}
                entitlementDate={formData.pensionEntitlementDate}
                formData={formData}
            />

            <AdditionalCompensationModal
                isOpen={isCompensationModalOpen}
                onClose={handleCloseCompensationModal}
                formData={formData}
                calculateCommission={calculateCommission}
                calculatePensionForDate={calculatePensionForDate}
                progressionData={pensionProgressionData}
                onShowProgression={handleShowProgression}
                getBonusTableNameForDate={getBonusTableNameForDate}
                dynamicPensionTables={dynamicPensionTables}
            />
            
            <CalculationDetailsModal
                isOpen={isCalculationDetailsModalOpen}
                onClose={() => setCalculationDetailsModalOpen(false)}
                details={calculationDetails}
                progressionData={pensionProgressionData}
            />
            
            {activeQueriedPopup && (
                 <ReferencedProgressionPopup 
                    table={activeQueriedPopup} 
                    onClose={() => setActiveQueriedPopup(null)} 
                    entitlementDate={formData.pensionEntitlementDate} 
                />
            )}

            <style>{`
                .input-style {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    border: 1px solid var(--outline);
                    border-radius: 0.5rem;
                    box-shadow: none;
                    transition: all 0.2s ease-in-out;
                    text-align: right;
                    background-color: var(--surface-container-high);
                    color: var(--on-surface);
                    caret-color: var(--primary);
                }
                .input-style:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px var(--focus-ring), 0 0 8px 1px var(--focus-ring);
                }
                .input-style::placeholder {
                    color: var(--on-surface-variant);
                    opacity: 0.8;
                }
                 .input-style[type="date"]::-webkit-calendar-picker-indicator,
                .input-style[type="month"]::-webkit-calendar-picker-indicator {
                    cursor: pointer;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                }
                 .input-style[type="date"]:hover::-webkit-calendar-picker-indicator,
                .input-style[type="month"]:hover::-webkit-calendar-picker-indicator {
                    opacity: 1;
                }

                [data-color-scheme="dark"] .input-style[type="date"]::-webkit-calendar-picker-indicator,
                [data-color-scheme="dark"] .input-style[type="month"]::-webkit-calendar-picker-indicator {
                   filter: invert(1) brightness(0.8);
                }
                .form-label {
                  display: block;
                  margin-bottom: 0.5rem;
                  font-weight: 500;
                  color: var(--on-surface-variant);
                  font-size: 0.875rem;
                }
                .form-section-header {
                  font-size: 1.125rem;
                  font-weight: 600;
                  color: var(--on-surface);
                  border-bottom: 1px solid var(--outline-variant);
                  padding-bottom: 0.75rem;
                  margin-bottom: 1.5rem;
                }

                @keyframes fade-in-fast {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in-fast { animation: fade-in-fast 0.2s ease-out forwards; }
                
                @keyframes modal-content-show {
                    from { opacity: 0; transform: translateY(20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-modal-content-show { animation: modal-content-show 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            `}</style>
        </div>
    );
};

export default InsuranceDuesCalculator;