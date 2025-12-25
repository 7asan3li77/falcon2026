
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    subscriptionTables as defaultSubscriptionTables
} from './data';
import { PlusIcon, DeleteIcon, ClipboardListIcon, CheckIcon, CogIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, CloseIcon, EditIcon } from './Icons';
import { produce } from 'immer';


// --- Types and Constants ---
const SUBSCRIPTION_DATA_STORAGE_KEY = 'falcon_subscription_calculator_periods';

const workerCategories = [
    { code: '1', type: 'gov', label: 'العاملين بالقطاع الحكومي' },
    { code: '2', type: 'public', label: 'العاملين بالقطاع العام' },
    { code: '3', type: 'private', label: 'العاملين بالقطاع الخاص' },
    { code: '4', type: 'construction', label: 'عمال المقاولات' },
    { code: '5', type: 'transport', label: 'عمال النقل البري' },
    { code: '8', type: 'business_owner', label: 'أصحاب الأعمال' },
    { code: '7', type: 'abroad', label: 'العاملين بالخارج' },
    { code: '9', type: 'irregular', label: 'العمالة غير المنتظمة' },
] as const;

type WorkerType = typeof workerCategories[number]['type'] | '';

type InsuranceType = 'pension' | 'bonus' | 'illness' | 'unemployment' | 'injury';
type ReductionType = 'illness_care' | 'illness_comp' | 'injury_care' | 'injury_comp';

interface WageSubPeriod {
    id: string;
    startDate: string;
    endDate: string; // Can be empty string meaning "until end of period"
    amount: string;
    type: 'basic' | 'variable' | 'unified' | 'income';
}

interface SubscriptionPeriod {
  id: number;
  sectorCode: string;
  workerType: WorkerType;
  startDate: string;
  endDate: string;
  // New Variable Wage Dates (Legacy kept for backward compat validation logic in old flow)
  variableStartDate?: string;
  variableEndDate?: string;
  workerGrade: string;
  // Pre-2020 Fields
  basicSubscriptionWage: string;
  variableSubscriptionWage: string;
  // Post-2020 Fields
  subscriptionWage: string;
  // Business Owner / Abroad Fields
  subscriptionIncomeCategory: string;
  // Multi-wage support
  wagePeriods: WageSubPeriod[];
  // Selections
  insuranceSelections: Record<InsuranceType, boolean>;
  reductionSelections: Record<ReductionType, boolean>;
}

interface PeriodResult {
  id: number;
  params: Omit<SubscriptionPeriod, 'id'>;
  totalContribution: number;
  breakdown: any[]; 
  error?: string;
  displayType: 'grouped' | 'detailed' | 'detailed-grouped';
  // Helpers for display
  basicMonths?: number;
  variableMonths?: number;
}

interface AggregationData {
    m: number; // Months
    w: number; // Total Wage
    c: number; // Total Contribution
}

interface AggregationRow {
    label: { name: string; code: string };
    preBasic: AggregationData;
    preVar: AggregationData;
    post: AggregationData;
}

interface CalculationResult {
  grandTotal: number;
  periodResults: PeriodResult[];
}

const workerGrades = {
    transport: ['التباع', 'الدرجة الثالثة', 'الدرجة الثانية', 'الدرجة الأولي'],
    construction: ['عامل محدود المهارة', 'عامل متوسط المهارة', 'عامل ماهر']
};

// --- Helper Functions ---
const parseDate = (dateStr: string): Date => {
    const adjustedDateStr = dateStr.replace(/\//g, '-');
    if (adjustedDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return new Date(`${adjustedDateStr}T00:00:00Z`);
    }
    if (adjustedDateStr.match(/^\d{4}$/)) {
        return new Date(`${adjustedDateStr}-01-01T00:00:00Z`);
    }
    return new Date(adjustedDateStr);
};

// Helper to calculate month difference inclusive
const getMonthDiff = (d1: Date, d2: Date): number => {
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    return (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth()) + 1;
};

const parseTransportDataFromArray = (data: string[][]) => {
    if (!data) return [];
    return data.map(row => ({
        startDate: row[0],
        endDate: row[1],
        minWage: row[2],
        grades: {
            'التباع': { wage: row[3], contribution: row[4] },
            'الدرجة الثالثة': { wage: row[5], contribution: row[6] },
            'الدرجة الثانية': { wage: row[7], contribution: row[8] },
            'الدرجة الأولي': { wage: row[9], contribution: row[10] }
        }
    }));
};

const parseConstructionDataFromArray = (data: string[][]) => {
    if (!data) return [];
    return data.map(row => ({
        startDate: row[0],
        endDate: row[1],
        minWage: row[2],
        grades: {
            'عامل محدود المهارة': { wage: row[3], contribution: row[4] },
            'عامل متوسط المهارة': { wage: row[5], contribution: row[6] },
            'عامل ماهر': { wage: row[7], contribution: row[8] }
        }
    }));
};

const parseIrregularWorkerTables = (
    wagesBefore2020: string[][], 
    contributionsBefore2020: string[][], 
    law148Data: string[][]
) => {
    if (!wagesBefore2020?.length || !contributionsBefore2020?.length || !law148Data?.length) {
        return [];
    }
    const result: { startDate: string, endDate: string, wage: string, contribution: string }[] = [];
    try {
        const wageMap = new Map<string, string>();
        wagesBefore2020.forEach(row => {
            const year = row[1];
            const wage = row[3] || row[2]; 
            if (year && wage) wageMap.set(year, wage);
        });
        for (let i = 0; i < contributionsBefore2020.length; i++) {
            const [dateStr, contribution] = contributionsBefore2020[i]; 
            if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) continue;
            const startDate = new Date(dateStr.replace(/\//g, '-'));
            const year = startDate.getFullYear().toString();
            let endDateStr: string;
            if (i + 1 < contributionsBefore2020.length) {
                const nextDateStr = contributionsBefore2020[i+1][0];
                if (!/^\d{4}\/\d{2}\/\d{2}$/.test(nextDateStr)) continue;
                const nextStartDate = new Date(nextDateStr.replace(/\//g, '-'));
                const endDate = new Date(nextStartDate.getTime() - (24 * 60 * 60 * 1000));
                endDateStr = `${endDate.getUTCFullYear()}/${(endDate.getUTCMonth() + 1).toString().padStart(2, '0')}/${endDate.getUTCDate().toString().padStart(2, '0')}`;
            } else {
                endDateStr = '2019/12/31';
            }
            result.push({
                startDate: dateStr,
                endDate: endDateStr,
                wage: wageMap.get(year) || '0.00',
                contribution: contribution,
            });
        }
    } catch (e) { console.error("Error parsing pre-2020 irregular worker data", e); }
    try {
        law148Data.forEach(row => {
            const [dateStr, wage, contribution] = row; 
            if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return;
            const [day, month, year] = dateStr.split('/');
            const startDateStr = `${year}/${month}/${day}`;
            const endDateStr = `${year}/12/31`;
            result.push({ startDate: startDateStr, endDate: endDateStr, wage: wage, contribution: contribution });
        });
    } catch (e) { console.error("Error parsing 2020+ irregular worker data", e); }
    return result;
}

interface DateRange {
    start: Date;
    end: Date;
    min?: number;
    max?: number;
}

const parseRangeTable = (data: string[][], type: 'min' | 'max' | 'both', dateColIndex: number = 0, minColIndex: number = -1, maxColIndex: number = -1, hasEndDate: boolean = false): DateRange[] => {
    if (!data) return [];
    const sortedData = data.map(row => {
        let dateStr = row[dateColIndex];
        return { row, date: parseDate(dateStr) };
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
    const ranges: DateRange[] = [];
    for (let i = 0; i < sortedData.length; i++) {
        const current = sortedData[i];
        const next = sortedData[i+1];
        let endDate: Date;
        if (hasEndDate && current.row[1]) {
             endDate = parseDate(current.row[1]);
             endDate.setUTCHours(23, 59, 59, 999);
        } else if (next) {
             endDate = new Date(next.date.getTime() - 24 * 60 * 60 * 1000);
             endDate.setUTCHours(23, 59, 59, 999);
        } else {
             endDate = new Date('2099-12-31T23:59:59Z');
        }
        const range: DateRange = { start: current.date, end: endDate };
        if (minColIndex !== -1) range.min = parseFloat(current.row[minColIndex]);
        if (maxColIndex !== -1) range.max = parseFloat(current.row[maxColIndex]);
        ranges.push(range);
    }
    return ranges;
};

let nextId = 0;
const createNewPeriod = (): SubscriptionPeriod => ({
  id: nextId++,
  sectorCode: '',
  workerType: '',
  startDate: '',
  endDate: '',
  variableStartDate: '',
  variableEndDate: '',
  workerGrade: '',
  basicSubscriptionWage: '',
  variableSubscriptionWage: '',
  subscriptionWage: '',
  subscriptionIncomeCategory: '',
  wagePeriods: [],
  insuranceSelections: {
      pension: true, bonus: true, illness: true, unemployment: true, injury: true
  },
  reductionSelections: {
      illness_care: false, illness_comp: false, injury_care: false, injury_comp: false
  },
});

// --- Validation Helper ---
const validatePeriodLimits = (start: Date, end: Date, wage: number, ranges: DateRange[], typeLabel: string): string | null => {
    const relevantRanges = ranges.filter(r => r.start <= end && r.end >= start);
    if (relevantRanges.length === 0) return null;
    for (const range of relevantRanges) {
        const overlapStart = new Date(Math.max(start.getTime(), range.start.getTime()));
        const overlapEnd = new Date(Math.min(end.getTime(), range.end.getTime()));
        const dStr = (d: Date) => `${d.getUTCFullYear()}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}`;
        if (range.min !== undefined && wage < range.min) return `أجر الاشتراك ${typeLabel} (${wage}) أقل من الحد الأدنى (${range.min}) للفترة من ${dStr(overlapStart)} إلى ${dStr(overlapEnd)}.`;
        if (range.max !== undefined && wage > range.max) return `أجر الاشتراك ${typeLabel} (${wage}) أكبر من الحد الأقصى (${range.max}) للفترة من ${dStr(overlapStart)} إلى ${dStr(overlapEnd)}.`;
    }
    return null;
};

// --- Wage Management Modal ---
interface WageManagementModalProps {
    period: SubscriptionPeriod;
    onClose: () => void;
    onSave: (id: number, wages: WageSubPeriod[]) => void;
    dynamicTables: any;
}

const WageManagementModal: React.FC<WageManagementModalProps> = ({ period, onClose, onSave, dynamicTables }) => {
    const [wages, setWages] = useState<WageSubPeriod[]>(period.wagePeriods || []);
    const [newWage, setNewWage] = useState<WageSubPeriod>({
        id: '',
        startDate: '',
        endDate: '',
        amount: '',
        type: 'basic' // default
    });
    const [error, setError] = useState<string>('');

    const isPre2020 = parseInt(period.startDate.split('-')[0], 10) < 2020;
    const isBusinessOwner = ['business_owner', 'abroad'].includes(period.workerType);

    useEffect(() => {
        // Set initial type based on context
        if (isPre2020) {
            setNewWage(prev => ({ ...prev, type: 'basic' }));
        } else {
            setNewWage(prev => ({ ...prev, type: isBusinessOwner ? 'income' : 'unified' }));
        }
    }, [isPre2020, isBusinessOwner]);

    // Auto-set start date for the first wage of a type
    useEffect(() => {
        const existingOfType = wages.filter(w => w.type === newWage.type);
        if (existingOfType.length === 0) {
            if (newWage.type === 'variable' && period.variableStartDate) {
                setNewWage(prev => ({ ...prev, startDate: period.variableStartDate! }));
            } else if (newWage.type === 'basic' || newWage.type === 'unified' || newWage.type === 'income') {
                setNewWage(prev => ({ ...prev, startDate: period.startDate }));
            }
        }
    }, [newWage.type, period.startDate, period.variableStartDate, wages]);

    const handleAddWage = () => {
        setError('');
        if (!newWage.startDate || !newWage.amount) {
            setError('يرجى إدخال تاريخ البداية والقيمة.');
            return;
        }

        // Validation: First wage start date match
        const existingOfType = wages.filter(w => w.type === newWage.type);
        if (existingOfType.length === 0) {
            if (newWage.type === 'variable' && period.variableStartDate) {
                if (newWage.startDate !== period.variableStartDate) {
                    setError(`أول تدرج للأجر المتغير يجب أن يبدأ في ${period.variableStartDate}`);
                    return;
                }
            } else if (['basic', 'unified', 'income'].includes(newWage.type)) {
                if (newWage.startDate !== period.startDate) {
                    setError(`أول تدرج للأجر يجب أن يبدأ في ${period.startDate}`);
                    return;
                }
            }
        }

        const start = new Date(`${newWage.startDate}-01T00:00:00Z`);
        // If end date is empty, it means "until end of period" or next wage. 
        // For validation, we assume it goes to period end.
        let end: Date;
        if (newWage.endDate) {
            end = new Date(parseInt(newWage.endDate.split('-')[0]), parseInt(newWage.endDate.split('-')[1]), 0);
            end.setUTCHours(23, 59, 59, 999);
        } else {
            // If no end date, default to period end for validation check
            end = new Date(parseInt(period.endDate.split('-')[0]), parseInt(period.endDate.split('-')[1]), 0);
            end.setUTCHours(23, 59, 59, 999);
        }
        
        const amount = parseFloat(newWage.amount);

        const parentStart = new Date(`${period.startDate}-01T00:00:00Z`);
        const parentEnd = new Date(parseInt(period.endDate.split('-')[0]), parseInt(period.endDate.split('-')[1]), 0);
        parentEnd.setUTCHours(23, 59, 59, 999);

        // 1. Check if within parent period
        if (start < parentStart || end > parentEnd) {
            setError('الفترة المدخلة يجب أن تكون ضمن فترة الاشتراك الأصلية.');
            return;
        }
        if (start > end) {
            setError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
            return;
        }

        // 2. Check for overlaps with same type
        // NOTE: With open-ended logic, we check if START is strictly after previous START
        // Overlap checks become trickier with open-ends. Simple rule: New wage start must not be "inside" another defined range?
        // Or better: Sort by start date later. Here just ensure start dates are unique.
        if (wages.some(w => w.type === newWage.type && w.startDate === newWage.startDate)) {
             setError('يوجد بالفعل أجر يبدأ في هذا التاريخ لنفس النوع.');
             return;
        }

        // 3. Validate Limits
        let limitError: string | null = null;
        if (newWage.type === 'basic') {
             limitError = validatePeriodLimits(start, end, amount, dynamicTables.minBasicWageTable79Ranges, 'الأساسي')
                       || validatePeriodLimits(start, end, amount, dynamicTables.maxBasicWageTable79Ranges, 'الأساسي');
        } else if (newWage.type === 'variable') {
             limitError = validatePeriodLimits(start, end, amount, dynamicTables.maxVariableWageTable79Ranges, 'المتغير');
             if(!limitError) {
                 const variableLegalStart = new Date('1984-04-01T00:00:00Z');
                 if (start < variableLegalStart) limitError = 'لا يوجد أجر اشتراك متغير قبل 1/4/1984.';
             }
        } else if (newWage.type === 'unified' || newWage.type === 'income') {
             limitError = validatePeriodLimits(start, end, amount, dynamicTables.unifiedLimitTable148Ranges, newWage.type === 'income' ? 'فئة الدخل' : 'النمطي');
        }

        if (limitError) {
            setError(limitError);
            return;
        }

        setWages([...wages, { ...newWage, id: Math.random().toString(36).substr(2, 9) }]);
        setNewWage({ ...newWage, amount: '', startDate: '', endDate: '' }); // Reset form but keep type
    };

    const handleDeleteWage = (id: string) => {
        setWages(wages.filter(w => w.id !== id));
    };

    const sortedWages = [...wages].sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    const isFirstWageOfType = (type: string) => !sortedWages.some(w => w.type === type);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-4 w-full max-w-2xl max-h-[90vh] flex flex-col animate-modal-content-show" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                    <h2 className="text-xl font-bold text-[var(--on-surface)]">إدارة الأجور للفترة ({period.startDate} - {period.endDate})</h2>
                    <button onClick={onClose} className="p-2 text-[var(--on-surface-variant)] rounded-full hover:bg-[color-mix(in_srgb,_var(--on-surface)_8%,_transparent)]"><CloseIcon /></button>
                </header>
                <main className="p-6 overflow-y-auto space-y-6">
                    
                    {/* Add New Wage Form */}
                    <div className="p-4 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] space-y-4">
                        <h4 className="font-bold text-[var(--primary)]">إضافة أجر جديد</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {isPre2020 ? (
                                <div className="col-span-2 flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="wageType" checked={newWage.type === 'basic'} onChange={() => setNewWage({...newWage, type: 'basic', startDate: wages.some(w => w.type === 'basic') ? '' : period.startDate })} className="text-[var(--primary)] focus:ring-[var(--primary)]" />
                                        <span>أجر أساسي</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="wageType" checked={newWage.type === 'variable'} onChange={() => setNewWage({...newWage, type: 'variable', startDate: wages.some(w => w.type === 'variable') ? '' : (period.variableStartDate || '') })} className="text-[var(--primary)] focus:ring-[var(--primary)]" />
                                        <span>أجر متغير</span>
                                    </label>
                                </div>
                            ) : (
                                <div className="col-span-2">
                                    <span className="text-sm font-medium text-[var(--on-surface-variant)]">نوع الأجر: {isBusinessOwner ? 'فئة دخل' : 'أجر موحد'}</span>
                                </div>
                            )}
                            
                            <div>
                                <label className="block text-xs text-[var(--on-surface-variant)] mb-1">من</label>
                                <input 
                                    type="month" 
                                    value={newWage.startDate} 
                                    onChange={e => setNewWage({...newWage, startDate: e.target.value})} 
                                    className={`input-style w-full ${isFirstWageOfType(newWage.type) ? 'bg-[var(--surface-container)]' : ''}`}
                                    min={period.startDate} 
                                    max={period.endDate}
                                    readOnly={isFirstWageOfType(newWage.type)} // First wage locked to period start
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[var(--on-surface-variant)] mb-1">إلى (اختياري)</label>
                                <input type="month" value={newWage.endDate} onChange={e => setNewWage({...newWage, endDate: e.target.value})} className="input-style w-full" min={period.startDate} max={period.endDate} placeholder="ممتد لنهاية الفترة" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs text-[var(--on-surface-variant)] mb-1">القيمة</label>
                                <input type="number" value={newWage.amount} onChange={e => setNewWage({...newWage, amount: e.target.value})} className="input-style w-full" placeholder="أدخل القيمة بالجنيه" />
                            </div>
                        </div>
                        {error && <p className="text-xs text-[var(--error)]">{error}</p>}
                        <div className="flex justify-end">
                            <button onClick={handleAddWage} className="px-4 py-2 bg-[var(--primary)] text-[var(--on-primary)] rounded-full text-sm font-bold hover:bg-[var(--primary-hover)] transition">إضافة</button>
                        </div>
                    </div>

                    {/* Wages List */}
                    <div className="space-y-2">
                        <h4 className="font-bold text-[var(--on-surface)]">قائمة الأجور المدرجة</h4>
                        {sortedWages.length === 0 ? (
                            <p className="text-sm text-[var(--on-surface-variant)] text-center py-4">لا توجد أجور مضافة لهذه الفترة.</p>
                        ) : (
                            <div className="space-y-2">
                                {sortedWages.map(wage => (
                                    <div key={wage.id} className="flex items-center justify-between p-3 bg-[var(--surface-container)] rounded-xl border border-[var(--outline-variant)]">
                                        <div className="grid grid-cols-3 gap-4 text-sm w-full">
                                            <div>
                                                <span className="block text-xs text-[var(--on-surface-variant)]">النوع</span>
                                                <span className="font-medium">{{basic: 'أجر أساسي', variable: 'أجر متغير', unified: 'أجر موحد', income: 'فئة دخل'}[wage.type]}</span>
                                            </div>
                                            <div>
                                                <span className="block text-xs text-[var(--on-surface-variant)]">الفترة</span>
                                                <span className="font-mono">{wage.startDate} - {wage.endDate || 'ممتد'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-xs text-[var(--on-surface-variant)]">القيمة</span>
                                                <span className="font-mono font-bold text-[var(--primary)]">{wage.amount}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteWage(wage.id)} className="p-2 text-[var(--error)] hover:bg-[var(--error-container)] rounded-full ml-2">
                                            <DeleteIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </main>
                <footer className="p-4 bg-[var(--surface-container)] rounded-b-3xl flex justify-end gap-4 border-t border-[var(--outline-variant)]">
                     <button type="button" onClick={onClose} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)]">إلغاء</button>
                    <button type="button" onClick={() => onSave(period.id, wages)} className="px-6 py-2 bg-[var(--primary)] text-[var(--on-primary)] font-semibold rounded-full hover:bg-[var(--primary-hover)]">حفظ الأجور</button>
                </footer>
            </div>
        </div>
    );
};


// --- Components ---

interface InsuranceSelectionModalProps {
    period: SubscriptionPeriod;
    onClose: () => void;
    onSave: (id: number, newSelections: { 
        insuranceSelections: Record<InsuranceType, boolean>; 
        reductionSelections: Record<ReductionType, boolean>; 
    }) => void;
    ratesTable: any;
    reductionsTable: any;
}

const InsuranceSelectionModal: React.FC<InsuranceSelectionModalProps> = ({ period, onClose, onSave, ratesTable, reductionsTable }) => {
    const [insuranceSelections, setInsuranceSelections] = useState(period.insuranceSelections);
    const [reductionSelections, setReductionSelections] = useState(period.reductionSelections);

    useEffect(() => {
        setInsuranceSelections(period.insuranceSelections);
        setReductionSelections(period.reductionSelections);
    }, [period]);

    const handleSaveClick = () => {
        onSave(period.id, { insuranceSelections, reductionSelections });
    };

    const isPre2020 = period.startDate && parseInt(period.startDate.split('-')[0], 10) < 2020;
    const isBusinessOwner = ['business_owner', 'abroad'].includes(period.workerType); // Sectors 7 and 8
    const showReductions = ['gov', 'public', 'private'].includes(period.workerType);

    const workerTypeLabelMap: Record<WorkerType, string> = {
        gov: 'القطاع الحكومي', public: 'القطاع العام', private: 'القطاع الخاص',
        business_owner: 'أصحاب الأعمال', abroad: 'العاملين بالخارج',
        construction: '', transport: '', irregular: '', '': ''
    };
    const currentWorkerLabel = workerTypeLabelMap[period.workerType as WorkerType];

    const insuranceRateData = useMemo(() => {
        if (!ratesTable || !currentWorkerLabel) return [];
        const relevantRows = ratesTable.data.filter((row: string[]) => row[0] === currentWorkerLabel);

        if (isPre2020) {
            return [
                { type: 'pension', label: 'الشيخوخة والعجز والوفاة', basic: relevantRows.find(r => r[1] === 'أساسي'), variable: relevantRows.find(r => r[1] === 'متغير') },
                { type: 'bonus', label: 'مكافأة نهاية الخدمة', basic: relevantRows.find(r => r[1] === 'أساسي'), variable: relevantRows.find(r => r[1] === 'متغير') },
                { type: 'illness', label: 'تأمين المرض', basic: relevantRows.find(r => r[1] === 'أساسي'), variable: relevantRows.find(r => r[1] === 'متغير') },
                { type: 'unemployment', label: 'تأمين البطالة', basic: relevantRows.find(r => r[1] === 'أساسي'), variable: relevantRows.find(r => r[1] === 'متغير') },
                { type: 'injury', label: 'تأمين إصابات العمل', basic: relevantRows.find(r => r[1] === 'أساسي'), variable: relevantRows.find(r => r[1] === 'متغير') },
            ];
        } else {
             return [
                { type: 'pension', label: 'الشيخوخة والعجز والوفاة', row: relevantRows[0] },
                { type: 'bonus', label: 'مكافأة نهاية الخدمة', row: relevantRows[0] },
                { type: 'illness', label: 'تأمين المرض', row: relevantRows[0] },
                { type: 'unemployment', label: 'تأمين البطالة', row: relevantRows[0] },
                { type: 'injury', label: 'تأمين إصابات العمل', row: relevantRows[0] },
            ];
        }
    }, [ratesTable, currentWorkerLabel, isPre2020]);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-4 w-full max-w-4xl max-h-[90vh] flex flex-col animate-modal-content-show" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                    <h2 className="text-xl font-bold text-[var(--on-surface)]">تحديد أنواع التأمين والتخفيضات</h2>
                    <button onClick={onClose} className="p-2 text-[var(--on-surface-variant)] rounded-full hover:bg-[color-mix(in_srgb,_var(--on-surface)_8%,_transparent)]"><CloseIcon /></button>
                </header>
                <main className="p-6 overflow-y-auto space-y-6">
                    <div>
                        <h3 className="font-semibold text-[var(--on-surface)] mb-2">أنواع التأمين المطبقة</h3>
                        <div className="overflow-x-auto bg-[var(--surface)] p-2 rounded-xl border border-[var(--outline-variant)]">
                            {isPre2020 ? (
                                <table className="w-full text-sm text-center">
                                    <thead className="bg-[var(--surface-container)]">
                                        <tr>
                                            <th rowSpan={2} className="p-2 border-b border-[var(--outline)]">نوع التأمين</th>
                                            <th colSpan={isBusinessOwner ? 1 : 2} className="p-2 border-b border-[var(--outline)]">الأجر الأساسي</th>
                                            <th colSpan={isBusinessOwner ? 1 : 2} className="p-2 border-b border-[var(--outline)]">الأجر المتغير</th>
                                            <th rowSpan={2} className="p-2 border-b border-[var(--outline)]">مطبق</th>
                                        </tr>
                                        <tr>
                                            {!isBusinessOwner && <th className="p-2 font-normal border-b border-[var(--outline)]">حصة العامل</th>}
                                            <th className="p-2 font-normal border-b border-[var(--outline)]">{isBusinessOwner ? 'النسبة' : 'حصة صاحب العمل'}</th>
                                            {!isBusinessOwner && <th className="p-2 font-normal border-b border-[var(--outline)]">حصة العامل</th>}
                                            <th className="p-2 font-normal border-b border-[var(--outline)]">{isBusinessOwner ? 'النسبة' : 'حصة صاحب العمل'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {insuranceRateData.map(item => {
                                            const key = item.type as InsuranceType;
                                            // For business owners, uncheck irrelevant insurances by default if needed, but usually manual control is fine.
                                            const isDisabled = (key === 'bonus' && isBusinessOwner) || (key === 'unemployment' && isBusinessOwner);
                                            
                                            const getRate = (wageType: 'basic'|'variable', party: 'worker' | 'employer') => {
                                                const row = item[wageType];
                                                if (!row) return '-';
                                                const mapping = {
                                                    pension: { worker: 3, employer: 2},
                                                    bonus: { worker: 5, employer: 4 },
                                                    illness: { worker: 7, employer: 6 },
                                                    unemployment: { worker: -1, employer: 8 },
                                                    injury: { worker: -1, employer: 9 },
                                                };
                                                const idx = mapping[key][party];
                                                return idx > -1 && row[idx] ? `${row[idx]}%` : '-';
                                            }
                                            return (
                                                <tr key={key} className="border-b border-[var(--outline-variant)] last:border-b-0">
                                                    <td className="p-2 font-semibold text-right">{item.label}</td>
                                                    {!isBusinessOwner && <td>{getRate('basic', 'worker')}</td>}
                                                    <td>{getRate('basic', 'employer')}</td>
                                                    {!isBusinessOwner && <td>{getRate('variable', 'worker')}</td>}
                                                    <td>{getRate('variable', 'employer')}</td>
                                                    <td><input type="checkbox" checked={insuranceSelections[key]} onChange={e => setInsuranceSelections(p => ({...p, [key]: e.target.checked}))} disabled={isDisabled} className="h-4 w-4 rounded text-[var(--primary)] focus:ring-[var(--primary)]"/></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-sm text-center">
                                    <thead className="bg-[var(--surface-container)]">
                                        <tr>
                                            <th className="p-2 border-b border-[var(--outline)]">نوع التأمين</th>
                                            {!isBusinessOwner && <th className="p-2 border-b border-[var(--outline)]">حصة العامل</th>}
                                            <th className="p-2 border-b border-[var(--outline)]">{isBusinessOwner ? 'النسبة' : 'حصة صاحب العمل'}</th>
                                            <th className="p-2 border-b border-[var(--outline)]">الإجمالي</th>
                                            <th className="p-2 border-b border-[var(--outline)]">مطبق</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {insuranceRateData.map(item => {
                                            const key = item.type as InsuranceType;
                                            const row = item.row;
                                            const isDisabled = key === 'injury' && isBusinessOwner;
                                            const mapping = {
                                                pension: { worker: 2, employer: 1 },
                                                bonus: { worker: 4, employer: 3 },
                                                illness: { worker: 6, employer: 5 },
                                                unemployment: { worker: -1, employer: 7 },
                                                injury: { worker: -1, employer: 8 },
                                            };
                                            const empRate = parseFloat(row?.[mapping[key].worker]) || 0;
                                            const ownerRate = parseFloat(row?.[mapping[key].employer]) || 0;
                                            const total = empRate + ownerRate;

                                            return (
                                                <tr key={key} className="border-b border-[var(--outline-variant)] last:border-b-0">
                                                    <td className="p-2 font-semibold text-right">{item.label}</td>
                                                    {!isBusinessOwner && <td>{empRate > 0 ? `${empRate}%` : '-'}</td>}
                                                    <td>{ownerRate > 0 ? `${ownerRate}%` : '-'}</td>
                                                    <td>{total > 0 ? `${total}%` : '-'}</td>
                                                    <td><input type="checkbox" checked={insuranceSelections[key]} onChange={e => setInsuranceSelections(p => ({...p, [key]: e.target.checked}))} disabled={isDisabled} className="h-4 w-4 rounded text-[var(--primary)] focus:ring-[var(--primary)]"/></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                    {showReductions && (
                        <div className="animate-fade-in">
                            <h3 className="font-semibold text-[var(--on-surface)] mb-2">التخفيضات</h3>
                            <div className="overflow-x-auto bg-[var(--surface)] p-2 rounded-xl border border-[var(--outline-variant)]">
                                <table className="w-full text-sm text-center">
                                    <thead className="bg-[var(--surface-container)]">
                                        <tr>
                                            <th className="p-2 border-b border-[var(--outline)]">نوع التخفيض</th>
                                            <th className="p-2 border-b border-[var(--outline)]">النسبة</th>
                                            <th className="p-2 border-b border-[var(--outline)]">مطبق</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(reductionsTable?.data || []).map((row: string[]) => {
                                            const keyMap: Record<string, ReductionType> = {
                                                'رعاية طبية (مرض)': 'illness_care', 'تعويض (مرض)': 'illness_comp',
                                                'رعاية طبية (إصابة)': 'injury_care', 'تعويض (إصابة)': 'injury_comp',
                                            };
                                            const key = keyMap[row[0]];
                                            if(!key) return null;
                                            return (
                                                <tr key={key} className="border-b border-[var(--outline-variant)] last:border-b-0">
                                                    <td className="p-2 font-semibold text-right">{row[0]}</td>
                                                    <td>{row[2]}%</td>
                                                    <td><input type="checkbox" checked={reductionSelections[key]} onChange={e => setReductionSelections(p => ({...p, [key]: e.target.checked}))} className="h-4 w-4 rounded text-[var(--primary)] focus:ring-[var(--primary)]"/></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
                <footer className="p-4 bg-[var(--surface-container)] rounded-b-3xl flex justify-end gap-4 border-t border-[var(--outline-variant)]">
                     <button type="button" onClick={onClose} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)]">إلغاء</button>
                    <button type="button" onClick={handleSaveClick} className="px-6 py-2 bg-[var(--primary)] text-[var(--on-primary)] font-semibold rounded-full hover:bg-[var(--primary-hover)]">حفظ</button>
                </footer>
            </div>
        </div>
    );
};

const GroupedResultTable: React.FC<{ breakdown: PeriodResult['breakdown'] }> = ({ breakdown }) => (
    <div className="overflow-x-auto p-1 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] shadow-sm">
        <table className="w-full text-sm text-center">
            <thead className="bg-[var(--surface-container)]">
                <tr>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">الشهر</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">أجر الاشتراك</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">قيمة الاشتراك</th>
                </tr>
            </thead>
            <tbody className="text-[var(--on-surface-variant)]">
                {breakdown.map((item, index) => (
                    <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0">
                        <td className="p-3 font-mono">{item.month}</td>
                        <td className="p-3 font-mono">{item.wage}</td>
                        <td className="p-3 font-mono font-semibold text-[var(--on-surface)]">{item.contribution}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const DetailedGroupedResultTable: React.FC<{ breakdown: any[] }> = ({ breakdown }) => (
    <div className="overflow-x-auto p-1 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] shadow-sm">
        <table className="w-full text-sm text-center">
            <thead className="bg-[var(--surface-container)]">
                <tr>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">بداية الاشتراك</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نهاية الاشتراك</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">عدد الشهور</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">أجر الاشتراك الشهري</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">إجمالي أجر الاشتراك</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">قيمة الاشتراك الشهري</th>
                    <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">إجمالي قيمة الاشتراك</th>
                </tr>
            </thead>
            <tbody className="text-[var(--on-surface-variant)]">
                {breakdown.map((item, index) => (
                    <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0">
                        <td className="p-3 font-mono">{item.startDate}</td>
                        <td className="p-3 font-mono">{item.endDate}</td>
                        <td className="p-3 font-mono">{item.numMonths}</td>
                        <td className="p-3 font-mono">{item.monthlyWage}</td>
                        <td className="p-3 font-mono">{item.totalWage.toFixed(2)}</td>
                        <td className="p-3 font-mono font-semibold text-[var(--on-surface)]">{item.monthlyContrib}</td>
                        <td className="p-3 font-mono font-semibold text-[var(--on-surface)]">{item.totalContrib.toFixed(2)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const StandardResultTable: React.FC<{ breakdown: PeriodResult['breakdown'], periodParams: PeriodResult['params'], basicMonths?: number, variableMonths?: number }> = ({ breakdown, periodParams, basicMonths, variableMonths }) => {
    const isPre2020 = parseInt(periodParams.startDate.split('-')[0], 10) < 2020;
    const isBusinessOwner = ['business_owner', 'abroad'].includes(periodParams.workerType);
    
    const totals = breakdown.reduce((acc, item) => {
        acc.employee += item.employeeAmount || 0;
        acc.employer += item.employerAmount || 0;
        acc.total += item.totalAmount || 0;
        return acc;
    }, { employee: 0, employer: 0, total: 0 });
    
    // Check if wages are detailed (multi-period) or simple (legacy)
    const isDetailedWages = periodParams.wagePeriods && periodParams.wagePeriods.length > 0;

    return (
        <div>
            <div className="mb-3 p-3 bg-[var(--surface-container-high)] rounded-xl border border-[var(--outline-variant)] flex flex-wrap justify-between items-center gap-4 text-sm">
                 {isDetailedWages && (
                     <div className="flex items-center gap-2">
                        <span className="text-[var(--on-surface-variant)]">نظام الأجور:</span>
                        <span className="font-mono font-bold text-[var(--primary)]">تلقائي / متعدد الفترات</span>
                     </div>
                 )}
                 <div className="w-px h-6 bg-[var(--outline)] hidden sm:block"></div>
                 <div className="flex items-center gap-2">
                    <span className="text-[var(--on-surface-variant)]">شهور الأساسي:</span>
                    <span className="font-mono font-bold text-[var(--on-surface)]">{basicMonths || 0}</span>
                 </div>
                 {isPre2020 && (
                     <div className="flex items-center gap-2">
                        <span className="text-[var(--on-surface-variant)]">شهور المتغير:</span>
                        <span className="font-mono font-bold text-[var(--on-surface)]">{variableMonths || 0}</span>
                     </div>
                 )}
                 <div className="w-px h-6 bg-[var(--outline)] hidden sm:block"></div>
                 <div className="flex items-center gap-2">
                    <span className="text-[var(--on-surface-variant)]">إجمالي الاشتراكات:</span>
                    <span className="font-mono font-bold text-[var(--primary)] text-lg">{totals.total.toFixed(2)}</span>
                 </div>
            </div>
             <div className="overflow-x-auto p-1 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] shadow-sm">
                <table className="w-full text-sm text-center">
                    <thead className="bg-[var(--surface-container)]">
                        <tr>
                            <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نوع التأمين</th>
                            <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">البيان</th>
                            <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">أجر الاشتراك الشهري</th>
                            <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">مدة الاشتراك (شهر)</th>
                            <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">إجمالي أجر الاشتراك للفترة</th>
                            {!isBusinessOwner && <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">نسبة العامل</th>}
                            <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">{isBusinessOwner ? 'النسبة' : 'نسبة صاحب العمل'}</th>
                            {!isBusinessOwner && <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">قيمة حصة العامل للفترة</th>}
                            <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">{isBusinessOwner ? 'قيمة الاشتراك' : 'قيمة حصة صاحب العمل للفترة'}</th>
                            {!isBusinessOwner && <th className="p-3 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider border-b-2 border-[var(--outline-variant)]">إجمالي الاشتراك للفترة</th>}
                        </tr>
                    </thead>
                    <tbody className="text-[var(--on-surface-variant)]">
                        {breakdown.map((item, index) => (
                            <tr key={index} className="border-b border-[var(--outline-variant)] last:border-b-0">
                                <td className="p-3 font-semibold text-right">{item.insuranceType}</td>
                                <td className="p-3 text-xs">{item.notes || '-'}</td>
                                <td className="font-mono">{item.wage.toFixed(2)}</td>
                                <td>{item.months}</td>
                                <td className="font-mono">{item.totalWageForPeriod.toFixed(2)}</td>
                                {!isBusinessOwner && <td>{item.employeeRate != null ? `${item.employeeRate.toFixed(2)}%` : '-'}</td>}
                                <td>{item.employerRate != null ? `${item.employerRate.toFixed(2)}%` : '-'}</td>
                                {!isBusinessOwner && <td>{item.employeeAmount != null ? item.employeeAmount.toFixed(2) : '-'}</td>}
                                <td>{item.employerAmount != null ? item.employerAmount.toFixed(2) : '-'}</td>
                                {!isBusinessOwner && <td className="font-semibold text-[var(--on-surface)]">{item.totalAmount != null ? item.totalAmount.toFixed(2) : '-'}</td>}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-[var(--surface-container)] font-bold">
                        <tr>
                            <td colSpan={5} className="p-3 text-right">الإجمالي الكلي للفترة</td>
                            {!isBusinessOwner && <td></td>} 
                            <td></td>
                            {!isBusinessOwner && <td>{totals.employee.toFixed(2)}</td>}
                            <td>{totals.employer.toFixed(2)}</td>
                            {!isBusinessOwner && <td className="text-[var(--primary)]">{totals.total.toFixed(2)}</td>}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}

const DeleteConfirmationModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void }> = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-fade-in-fast">
            <div className="bg-[var(--surface-container-high)] rounded-2xl p-6 max-w-sm w-full shadow-xl border border-[var(--outline-variant)]">
                <h3 className="text-lg font-bold text-[var(--on-surface)] mb-2">تأكيد الحذف</h3>
                <p className="text-[var(--on-surface-variant)] mb-6">هل أنت متأكد من رغبتك في حذف فترة الاشتراك هذه؟</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-full hover:bg-[var(--surface-container)] text-[var(--on-surface)]">إلغاء</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-full bg-[var(--error)] text-[var(--on-error)] font-bold hover:opacity-90">حذف</button>
                </div>
            </div>
        </div>
    )
}

const AutoCalcConfirmationModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void }> = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-fade-in-fast">
            <div className="bg-[var(--surface-container-high)] rounded-2xl p-6 max-w-md w-full shadow-xl border border-[var(--outline-variant)]">
                <h3 className="text-lg font-bold text-[var(--on-surface)] mb-2">تنبيه هام</h3>
                <p className="text-[var(--on-surface-variant)] mb-6 leading-relaxed">
                    لم يتم إدخال تدرج لأجر الاشتراك عن الفترة.
                    <br/>
                    سيتم الحساب بشكل افتراضي على <strong>الحد الأدنى لأجر الاشتراك</strong>.
                    <br/><br/>
                    هل ترغب في المتابعة؟
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-full hover:bg-[var(--surface-container)] text-[var(--on-surface)]">إلغاء (لإدخال الأجور)</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-bold hover:opacity-90">متابعة (حساب تلقائي)</button>
                </div>
            </div>
        </div>
    )
}

// --- Main Calculator Component ---
const SubscriptionCalculator: React.FC = () => {
    const [periods, setPeriods] = useState<SubscriptionPeriod[]>(() => {
        try {
            const savedData = localStorage.getItem(SUBSCRIPTION_DATA_STORAGE_KEY);
            if(savedData) {
                const parsed = JSON.parse(savedData);
                if(Array.isArray(parsed) && parsed.length > 0) {
                    nextId = Math.max(...parsed.map(p => p.id)) + 1;
                    return parsed.map(p => ({...p, wagePeriods: p.wagePeriods || []})); // Backward compatibility
                }
            }
        } catch (e) { console.error("Failed to load", e); }
        return [createNewPeriod()];
    });
    const [result, setResult] = useState<CalculationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
    const [wageEditingPeriodId, setWageEditingPeriodId] = useState<number | null>(null); // New state for wage modal
    const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set());
    const [copySuccessId, setCopySuccessId] = useState<number | null>(null);
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(true);
    const [deleteConfirmationId, setDeleteConfirmationId] = useState<number | null>(null);
    const [isAutoCalcConfirmationOpen, setIsAutoCalcConfirmationOpen] = useState(false);

    const [dynamicTables, setDynamicTables] = useState<any>({
        structuredTransportTable79: [], structuredConstructionTable79: [],
        structuredTransportTable148: [], structuredConstructionTable148: [],
        structuredIrregularWorkerTable: [],
        ratesTableBefore2020: null, ratesTableAfter2020: null,
        reductionsTableBefore2020: null, reductionsTableAfter2020: null,
        minBasicWageTable79Ranges: [], maxBasicWageTable79Ranges: [],
        maxVariableWageTable79Ranges: [], unifiedLimitTable148Ranges: [],
    });

    useEffect(() => {
        let tables = defaultSubscriptionTables;
        try {
            const savedData = localStorage.getItem('authorityTables_subscriptions');
            if (savedData) { const parsed = JSON.parse(savedData); if (Array.isArray(parsed)) tables = parsed; }
        } catch (e) { console.error("Failed to load tables", e); tables = defaultSubscriptionTables; }

        const findTable = (nameLike: string) => tables.find(t => t.name.includes(nameLike));
        const findTableById = (id: string) => tables.find(t => t.id === id);

        setDynamicTables({
            structuredTransportTable79: parseTransportDataFromArray(findTableById('transport_79')?.data || []),
            structuredConstructionTable79: parseConstructionDataFromArray(findTableById('construction_79')?.data || []),
            structuredTransportTable148: parseTransportDataFromArray(findTableById('transport_148')?.data || []),
            structuredConstructionTable148: parseConstructionDataFromArray(findTableById('construction_148')?.data || []),
            structuredIrregularWorkerTable: parseIrregularWorkerTables(
                findTableById('irregular_wages_pre_2020')?.data || [], 
                findTableById('irregular_contrib_pre_2020')?.data || [], 
                findTableById('irregular_148')?.data || []
            ),
            ratesTableBefore2020: findTableById('rates_before_148'),
            ratesTableAfter2020: findTableById('rates_after_148'),
            reductionsTableBefore2020: findTableById('reductions_before_148'),
            reductionsTableAfter2020: findTableById('reductions_after_148'),
            minBasicWageTable79Ranges: parseRangeTable(findTable('جدول الحد الأدني لأجر الاشتراك الأساسي طبقا للقانون 79')?.data, 'min', 0, 2, -1, true),
            maxBasicWageTable79Ranges: parseRangeTable(findTable('جدول الحد الأقصي لأجر الاشتراك الأساسي طبقا للقانون 79')?.data, 'max', 1, -1, 2),
            maxVariableWageTable79Ranges: parseRangeTable(findTable('جدول الحد الأقصي لأجر الاشتراك المتغير طبقا للقانون 79')?.data, 'max', 0, -1, 1),
            unifiedLimitTable148Ranges: parseRangeTable(findTable('جدول الحد الأدني والأقصي لأجر الاشتراك النمطي طبقا للقانون 148')?.data, 'both', 0, 1, 2),
        });
    }, []);

    useEffect(() => { localStorage.setItem(SUBSCRIPTION_DATA_STORAGE_KEY, JSON.stringify(periods)); }, [periods]);

    const handleAddPeriod = () => setPeriods(prev => [...prev, createNewPeriod()]);
    const confirmDeletePeriod = () => {
        if (deleteConfirmationId !== null) {
            setPeriods(prev => prev.filter(p => p.id !== deleteConfirmationId));
            setDeleteConfirmationId(null);
        }
    };

    const handlePeriodChange = (id: number, field: keyof Omit<SubscriptionPeriod, 'id' | 'insuranceSelections' | 'reductionSelections' | 'wagePeriods'>, value: string) => {
        setPeriods(produce(draft => {
            const period = draft.find(p => p.id === id);
            if (!period) return;
            const originalWorkerType = period.workerType;
            const originalStartDate = period.startDate;
            (period as any)[field] = value;

            if (field === 'sectorCode') {
                const category = workerCategories.find(c => c.code === value);
                period.workerType = category ? category.type : '';
            } else if (field === 'workerType') {
                const category = workerCategories.find(c => c.type === value);
                period.sectorCode = category ? category.code : '';
            }

            if (field === 'workerType' && value !== originalWorkerType) {
                period.workerGrade = '';
                period.basicSubscriptionWage = '';
                period.variableSubscriptionWage = '';
                period.subscriptionWage = '';
                period.subscriptionIncomeCategory = '';
                period.variableStartDate = '';
                period.variableEndDate = '';
                period.wagePeriods = []; // Reset wages on type change
            } else if (field === 'startDate' && value !== originalStartDate) {
                // Logic: If Pre-2020 start, enforce pre-2020 limit on End
                const isStartDatePre2020 = period.startDate && parseInt(period.startDate.split('-')[0], 10) < 2020;
                if (isStartDatePre2020 && period.endDate && parseInt(period.endDate.split('-')[0], 10) >= 2020) {
                    period.endDate = '';
                }
                period.wagePeriods = []; // Clear wages if dates change to avoid inconsistency
            }
        }));
    };

    const handleInsuranceSelectionSave = (id: number, newSelections: { insuranceSelections: Record<InsuranceType, boolean>; reductionSelections: Record<ReductionType, boolean>; }) => {
        setPeriods(produce(draft => {
            const period = draft.find(p => p.id === id);
            if (period) {
                period.insuranceSelections = newSelections.insuranceSelections;
                period.reductionSelections = newSelections.reductionSelections;
            }
        }));
        setEditingPeriodId(null);
    };

    const handleWagesSave = (id: number, newWages: WageSubPeriod[]) => {
        setPeriods(produce(draft => {
            const period = draft.find(p => p.id === id);
            if (period) {
                period.wagePeriods = newWages;
            }
        }));
        setWageEditingPeriodId(null);
    };

    const handleReset = () => {
        setPeriods([createNewPeriod()]);
        setResult(null);
        setError(null);
        setExpandedPeriods(new Set());
    };
    
    const getAutomaticWages = (period: SubscriptionPeriod): WageSubPeriod[] => {
        const isPre2020 = parseInt(period.startDate.split('-')[0], 10) < 2020;
        const ranges = isPre2020 
            ? dynamicTables.minBasicWageTable79Ranges 
            : dynamicTables.unifiedLimitTable148Ranges;
        
        if (!ranges || ranges.length === 0) return [];

        const start = new Date(`${period.startDate}-01T00:00:00Z`);
        const end = new Date(parseInt(period.endDate.split('-')[0]), parseInt(period.endDate.split('-')[1]), 0);
        end.setUTCHours(23, 59, 59, 999);

        const autoWages: WageSubPeriod[] = [];
        const type = isPre2020 ? 'basic' : (['business_owner', 'abroad'].includes(period.workerType) ? 'income' : 'unified');

        // Sort ranges just in case
        const sortedRanges = [...ranges].sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

        for (const range of sortedRanges) {
            const overlapStart = new Date(Math.max(start.getTime(), range.start.getTime()));
            const overlapEnd = new Date(Math.min(end.getTime(), range.end.getTime()));

            if (overlapStart <= overlapEnd) {
                // Convert Date to YYYY-MM string
                const startDateStr = `${overlapStart.getUTCFullYear()}-${(overlapStart.getUTCMonth() + 1).toString().padStart(2, '0')}`;
                const endDateStr = `${overlapEnd.getUTCFullYear()}-${(overlapEnd.getUTCMonth() + 1).toString().padStart(2, '0')}`;
                
                autoWages.push({
                    id: `auto-${Math.random().toString(36).substr(2, 9)}`,
                    startDate: startDateStr,
                    endDate: endDateStr,
                    amount: (range.min || 0).toString(),
                    type: type as any
                });
            }
        }
        
        return autoWages;
    }

    const calculateStandardContribution = useCallback((period: SubscriptionPeriod, basicMonths: number, variableMonths: number, bonusMonths: number): { totalContribution: number; breakdown: PeriodResult['breakdown']; error?: string } => {
        const isPre2020 = parseInt(period.startDate.split('-')[0], 10) < 2020;
        const isBusinessOwner = ['business_owner', 'abroad'].includes(period.workerType);
        const isStandardWorker = ['gov', 'public', 'private'].includes(period.workerType);
        
        const ratesTable = isPre2020 ? dynamicTables.ratesTableBefore2020 : dynamicTables.ratesTableAfter2020;
        const reductionsTable = isPre2020 ? dynamicTables.reductionsTableBefore2020 : dynamicTables.reductionsTableAfter2020;

        if (!ratesTable) return { totalContribution: 0, breakdown: [], error: `جدول نسب الاشتراكات للفترة ${isPre2020 ? 'قبل' : 'بعد'} 2020 غير موجود.` };

        const workerTypeLabelMap: Record<WorkerType, string> = {
            gov: 'القطاع الحكومي', public: 'القطاع العام', private: 'القطاع الخاص',
            business_owner: 'أصحاب الأعمال', abroad: 'العاملين بالخارج',
            '': '', construction: '', transport: '', irregular: ''
        };
        const currentWorkerLabel = workerTypeLabelMap[period.workerType];
        
        let totalContribution = 0;
        const breakdown: PeriodResult['breakdown'] = [];

        // Determine wages to use (Manual + Auto-generated if missing)
        let wagesToUse = [...(period.wagePeriods || [])];
        const sector = period.sectorCode;
        
        // Check missing Main wages
        const hasBasic = wagesToUse.some(w => w.type === 'basic');
        const hasUnified = wagesToUse.some(w => w.type === 'unified' || w.type === 'income');
        let needAutoFill = false;

        if (isPre2020) {
            // Pre-2020: Sectors 1, 2, 3 MUST have basic wages. Auto-fill if missing.
            if (['1', '2', '3'].includes(sector) && !hasBasic) {
                needAutoFill = true;
            }
        } else {
            // Post-2020: Sectors 1, 2, 3, 7, 8 MUST have unified/income wages. Auto-fill if missing.
            if (['1', '2', '3', '7', '8'].includes(sector) && !hasUnified) {
                needAutoFill = true;
            }
        }

        if (needAutoFill) {
             const autoWages = getAutomaticWages(period);
             wagesToUse = [...wagesToUse, ...autoWages];
        }

        // Helper to get active wage for a specific month from the wages array
        const getWageForDate = (date: Date, type: 'basic' | 'variable' | 'unified' | 'income'): number | null => {
            if (!wagesToUse || wagesToUse.length === 0) return null;
            
            // Sort wages of type by start date
            const typeWages = wagesToUse.filter(w => w.type === type).sort((a, b) => a.startDate.localeCompare(b.startDate));
            
            const targetWage = typeWages.find((w, index) => {
                const start = new Date(`${w.startDate}-01T00:00:00Z`);
                
                let end: Date;
                if (w.endDate) {
                    end = new Date(parseInt(w.endDate.split('-')[0]), parseInt(w.endDate.split('-')[1]), 0);
                    end.setUTCHours(23, 59, 59, 999);
                } else {
                    // If no end date, it goes until the next wage starts OR end of period
                    const nextWage = typeWages[index + 1];
                    if (nextWage) {
                        end = new Date(`${nextWage.startDate}-01T00:00:00Z`);
                        end.setUTCDate(end.getUTCDate() - 1); // Day before next start
                        end.setUTCHours(23, 59, 59, 999);
                    } else {
                        // Until period end
                        if (type === 'variable' && period.variableEndDate) {
                             end = new Date(parseInt(period.variableEndDate.split('-')[0]), parseInt(period.variableEndDate.split('-')[1]), 0);
                        } else {
                             end = new Date(parseInt(period.endDate.split('-')[0]), parseInt(period.endDate.split('-')[1]), 0);
                        }
                        end.setUTCHours(23, 59, 59, 999);
                    }
                }
                return date >= start && date <= end;
            });
            return targetWage ? parseFloat(targetWage.amount) : null;
        };

        // Helper to calculate contribution for a specific insurance type
        const calculateInsuranceType = (
            type: InsuranceType, 
            insuranceLabel: string, 
            wageType: 'أساسي' | 'متغير' | 'موحد' | 'دخل', 
            codeType: 'basic' | 'variable' | 'unified' | 'income',
            startD: Date, endD: Date
        ) => {
            if (!period.insuranceSelections[type]) return;

            // Determine valid period for this wage type/insurance type
            let calcStart = new Date(startD);
            let calcEnd = new Date(endD);

            // Adjust for Bonus before 1984
            if (isPre2020 && type === 'bonus' && wageType === 'أساسي') {
                const bonusLegalStart = new Date('1984-04-01T00:00:00Z');
                if (calcEnd < bonusLegalStart) return;
                if (calcStart < bonusLegalStart) calcStart = new Date(bonusLegalStart);
            }
            // Adjust for Variable Wage before 1984
            if (isPre2020 && wageType === 'متغير') {
                const variableLegalStart = new Date('1984-04-01T00:00:00Z');
                if (calcEnd < variableLegalStart) return;
                if (calcStart < variableLegalStart) calcStart = new Date(variableLegalStart);
            }

            if (calcStart > calcEnd) return;

            // Get Rate
            const relevantRows = ratesTable.data.filter((row: string[]) => row[0] === currentWorkerLabel);
            const lookupWageType = wageType === 'دخل' ? 'أساسي' : wageType;
            const rateRow = isPre2020 ? relevantRows.find((r: string[]) => r[1] === lookupWageType) : relevantRows[0];

            if (!rateRow) return;

            let empRate = 0, ownerRate = 0;
            if (isPre2020) {
                 const mapping = { pension: { e: 2, w: 3 }, bonus: { e: 4, w: 5 }, illness: { e: 6, w: 7 }, unemployment: { e: 8, w: -1 }, injury: { e: 9, w: -1 } };
                 ownerRate = parseFloat(rateRow[mapping[type as keyof typeof mapping].e]) || 0;
                 empRate = parseFloat(rateRow[mapping[type as keyof typeof mapping].w]) || 0;
            } else {
                 const mapping = { pension: { e: 1, w: 2 }, bonus: { e: 3, w: 4 }, illness: { e: 5, w: 6 }, unemployment: { e: 7, w: -1 }, injury: { e: 8, w: -1 } };
                 ownerRate = parseFloat(rateRow[mapping[type as keyof typeof mapping].e]) || 0;
                 empRate = parseFloat(rateRow[mapping[type as keyof typeof mapping].w]) || 0;
            }
            
            if (empRate === 0 && ownerRate === 0) return;

            // Reductions
            if (isStandardWorker && reductionsTable?.data) {
                for(const reductionRow of reductionsTable.data) {
                    const [reductionLabel, mainType, reductionValueStr] = reductionRow;
                    const keyMap: Record<string, ReductionType> = { 'رعاية طبية (مرض)': 'illness_care', 'تعويض (مرض)': 'illness_comp', 'رعاية طبية (إصابة)': 'injury_care', 'تعويض (إصابة)': 'injury_comp' };
                    const reductionKey = keyMap[reductionLabel];
                    if (period.reductionSelections[reductionKey] && mainType === type) {
                        const reductionVal = parseFloat(reductionValueStr) || 0;
                        const deductionFromOwner = Math.min(ownerRate, reductionVal);
                        ownerRate -= deductionFromOwner;
                        const remainingReduction = reductionVal - deductionFromOwner;
                        const deductionFromEmp = Math.min(empRate, remainingReduction);
                        empRate -= deductionFromEmp;
                    }
                }
            }
            
            ownerRate = Math.max(0, ownerRate);
            empRate = Math.max(0, empRate);

            // Iteration Logic
            let currentDate = new Date(calcStart);
            currentDate.setUTCDate(1); 
            
            let currentWageGroup: { wage: number, months: number, startDate: string, endDate: string } | null = null;

            const pushGroup = () => {
                if (!currentWageGroup) return;
                const totalWageForPeriod = currentWageGroup.wage * currentWageGroup.months;
                let empAmount = 0, ownerAmount = 0;

                if (isBusinessOwner || period.workerType === 'abroad') {
                    const combinedRate = empRate + ownerRate;
                    ownerAmount = totalWageForPeriod * (combinedRate / 100);
                    empAmount = 0; 
                    ownerRate = combinedRate; // For display
                    empRate = 0;
                } else {
                    empAmount = totalWageForPeriod * (empRate / 100);
                    ownerAmount = totalWageForPeriod * (ownerRate / 100);
                }
                const totalAmount = empAmount + ownerAmount;
                totalContribution += totalAmount;

                breakdown.push({
                    insuranceType: insuranceLabel,
                    notes: `${currentWageGroup.startDate} إلى ${currentWageGroup.endDate}`,
                    wage: currentWageGroup.wage,
                    totalWageForPeriod: totalWageForPeriod,
                    months: currentWageGroup.months,
                    employeeRate: empRate,
                    employerRate: ownerRate,
                    employeeAmount: empAmount,
                    employerAmount: ownerAmount,
                    totalAmount: totalAmount,
                });
                currentWageGroup = null;
            };

            while (currentDate <= calcEnd) {
                // Determine wage
                let wageForMonth = 0;
                const wageFromList = getWageForDate(currentDate, codeType);
                
                if (wageFromList !== null) {
                    wageForMonth = wageFromList;
                } else {
                    // Fallback to legacy if still needed (shouldn't be reached if auto-wages works, but kept for safety)
                    if (codeType === 'basic') wageForMonth = parseFloat(period.basicSubscriptionWage) || 0;
                    else if (codeType === 'variable') wageForMonth = parseFloat(period.variableSubscriptionWage) || 0;
                    else if (codeType === 'unified') wageForMonth = parseFloat(period.subscriptionWage) || 0;
                    else if (codeType === 'income') wageForMonth = parseFloat(period.subscriptionIncomeCategory) || 0;
                }

                if (wageForMonth > 0) {
                    const monthStr = `${currentDate.getUTCFullYear()}-${(currentDate.getUTCMonth() + 1).toString().padStart(2, '0')}`;
                    
                    if (!currentWageGroup) {
                        currentWageGroup = { wage: wageForMonth, months: 1, startDate: monthStr, endDate: monthStr };
                    } else if (currentWageGroup.wage === wageForMonth) {
                        currentWageGroup.months += 1;
                        currentWageGroup.endDate = monthStr;
                    } else {
                        pushGroup();
                        currentWageGroup = { wage: wageForMonth, months: 1, startDate: monthStr, endDate: monthStr };
                    }
                } else {
                    pushGroup();
                }

                currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
            }
            pushGroup(); // Push last group
        }

        const periodStart = new Date(`${period.startDate}-01T00:00:00Z`);
        const periodEnd = new Date(parseInt(period.endDate.split('-')[0]), parseInt(period.endDate.split('-')[1]), 0);
        periodEnd.setUTCHours(23, 59, 59, 999);

        if (isPre2020) {
            const wageTypeLabel = (isBusinessOwner || period.workerType === 'abroad') ? 'دخل' : 'أساسي';
            const codeType = (isBusinessOwner || period.workerType === 'abroad') ? 'income' : 'basic'; // Note: Pre-2020 Biz Owner usually mapped to Basic in modal, standardizing here.
            // Actually, our modal sets 'basic' for Pre-2020 regardless of worker type. Let's stick to that.
            const actualCodeType = isBusinessOwner ? 'basic' : 'basic'; 

            calculateInsuranceType('pension', `تأمين الشيخوخة (${wageTypeLabel})`, wageTypeLabel, 'basic', periodStart, periodEnd);
            calculateInsuranceType('bonus', `مكافأة (${wageTypeLabel})`, wageTypeLabel, 'basic', periodStart, periodEnd);
            calculateInsuranceType('illness', `تأمين المرض (${wageTypeLabel})`, wageTypeLabel, 'basic', periodStart, periodEnd);
            calculateInsuranceType('unemployment', `تأمين البطالة (${wageTypeLabel})`, wageTypeLabel, 'basic', periodStart, periodEnd);
            calculateInsuranceType('injury', `تأمين إصابات العمل (${wageTypeLabel})`, wageTypeLabel, 'basic', periodStart, periodEnd);

            // Calculate Variable
            let varStart = periodStart;
            let varEnd = periodEnd;
            if (period.variableStartDate && period.variableEndDate) {
                 varStart = new Date(`${period.variableStartDate}-01T00:00:00Z`);
                 varEnd = new Date(parseInt(period.variableEndDate.split('-')[0]), parseInt(period.variableEndDate.split('-')[1]), 0);
                 varEnd.setUTCHours(23, 59, 59, 999);
            }

            calculateInsuranceType('pension', `تأمين الشيخوخة (متغير)`, 'متغير', 'variable', varStart, varEnd);
            calculateInsuranceType('bonus', `مكافأة (متغير)`, 'متغير', 'variable', varStart, varEnd);
            calculateInsuranceType('illness', `تأمين المرض (متغير)`, 'متغير', 'variable', varStart, varEnd);
            calculateInsuranceType('unemployment', `تأمين البطالة (متغير)`, 'متغير', 'variable', varStart, varEnd);
            calculateInsuranceType('injury', `تأمين إصابات العمل (متغير)`, 'متغير', 'variable', varStart, varEnd);

        } else {
            // Post 2020
            const wageTypeLabel = isBusinessOwner ? 'دخل' : 'موحد';
            const codeType = isBusinessOwner ? 'income' : 'unified';
            
            calculateInsuranceType('pension', `تأمين الشيخوخة`, 'موحد', codeType, periodStart, periodEnd);
            calculateInsuranceType('bonus', `مكافأة`, 'موحد', codeType, periodStart, periodEnd);
            calculateInsuranceType('illness', `تأمين المرض`, 'موحد', codeType, periodStart, periodEnd);
            calculateInsuranceType('unemployment', `تأمين البطالة`, 'موحد', codeType, periodStart, periodEnd);
            calculateInsuranceType('injury', `تأمين إصابات العمل`, 'موحد', codeType, periodStart, periodEnd);
        }

        return { totalContribution, breakdown };
    }, [dynamicTables]);
    
    const performCalculation = () => {
        setError(null);
        setResult(null);
        setExpandedPeriods(new Set()); // Keep details collapsed by default
        
        let grandTotal = 0;
        const periodResults: PeriodResult[] = [];
        const standardWorkerTypes: WorkerType[] = ['gov', 'public', 'private', 'business_owner', 'abroad'];
        const splitDateRestrictedSectors = ['1', '2', '3', '7', '8'];

        for (const period of periods) {
            const { id, workerType, startDate, endDate, workerGrade } = period;
            
            if (!workerType || !startDate || !endDate) {
                periodResults.push({ id, params: period, totalContribution: 0, breakdown: [], error: 'الرجاء إدخال فئة العامل وتواريخ البدء والنهاية.', displayType: 'grouped' });
                continue;
            }

            const start = new Date(`${startDate}-01T00:00:00Z`);
            const end = new Date(parseInt(endDate.split('-')[0], 10), parseInt(endDate.split('-')[1], 10), 0);
            end.setUTCHours(23, 59, 59, 999);
            const isPre2020 = start < new Date('2020-01-01T00:00:00Z');

            if (splitDateRestrictedSectors.includes(period.sectorCode) && isPre2020 && end >= new Date('2020-01-01T00:00:00Z')) {
                periodResults.push({ id, params: period, totalContribution: 0, breakdown: [], error: 'لا يمكن أن تعبر الفترة تاريخ 1/1/2020. يرجى تقسيمها إلى فترتين (فترة حتى 31/12/2019 وفترة تبدأ من 1/1/2020).', displayType: 'grouped' });
                continue;
            }
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
                periodResults.push({ id, params: period, totalContribution: 0, breakdown: [], error: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية.', displayType: 'grouped' });
                continue;
            }
            
            const hasWagePeriods = period.wagePeriods && period.wagePeriods.length > 0;

            // Check Variable Wage Rule for Pre-2020 Sectors 1,2,3
            // If user indicated variable wage period but didn't enter wages, stop.
            if (isPre2020 && ['gov', 'public', 'private'].includes(workerType)) {
                const hasVariablePeriodIndicated = period.variableStartDate && period.variableEndDate;
                const hasVariableWagesEntered = period.wagePeriods?.some(w => w.type === 'variable');
                
                if (hasVariablePeriodIndicated && !hasVariableWagesEntered) {
                     periodResults.push({ 
                         id, params: period, totalContribution: 0, breakdown: [], 
                         error: 'لقد قمت بتحديد مدة اشتراك للأجر المتغير، لذا يجب إدراج تدرج الأجر المتغير يدوياً بما لا يتجاوز الحدود القصوى.', 
                         displayType: 'detailed' 
                     });
                     continue;
                }
            }

            // If no wages entered for Basic/Unified, we will try auto-fill inside calculateStandardContribution
            // So we don't block here for those types if auto-fill applies.
            
            if (standardWorkerTypes.includes(workerType)) {
                const basicMonths = getMonthDiff(start, end);
                const variableMonths = (period.variableStartDate && period.variableEndDate) ? getMonthDiff(new Date(period.variableStartDate), new Date(period.variableEndDate)) : 0;
                
                // Calculate Bonus Months specifically (only useful for Legacy logic inside, but passed anyway)
                let bonusMonths = basicMonths;
                if (isPre2020 && ['gov', 'public', 'private'].includes(workerType)) {
                    const bonusLegalStart = new Date('1984-04-01T00:00:00Z');
                    if (end < bonusLegalStart) {
                        bonusMonths = 0;
                    } else if (start < bonusLegalStart) {
                        bonusMonths = getMonthDiff(bonusLegalStart, end);
                    }
                }

                const { totalContribution: periodTotal, breakdown: monthlyBreakdown, error: calcError } = calculateStandardContribution(period, basicMonths, variableMonths, bonusMonths);
                
                if (calcError || monthlyBreakdown.some(b => b.error)) {
                    periodResults.push({ id, params: period, totalContribution: 0, breakdown: [], error: calcError || monthlyBreakdown.find(b=>b.error)?.error, displayType: 'detailed' });
                    continue;
                }
                
                grandTotal += periodTotal;
                periodResults.push({
                    id, params: period, totalContribution: periodTotal, breakdown: monthlyBreakdown, displayType: 'detailed',
                    basicMonths, variableMonths
                });
                continue;
            }

            // Grouped Sectors Logic (Unchanged)
            const groupedBreakdown: any[] = [];
            let currentGroup: { startDate: string, wage: string, contrib: string, count: number } | null = null;
            let periodTotal = 0;
            let currentDate = new Date(start);
            let periodError: string | undefined = undefined;

            while (currentDate <= end) {
                const monthKey = `${currentDate.getUTCFullYear()}-${(currentDate.getUTCMonth() + 1).toString().padStart(2, '0')}`;
                const isLaw148 = currentDate >= new Date(Date.UTC(2020, 0, 1));
                let tableData;
                if (workerType === 'irregular') tableData = dynamicTables.structuredIrregularWorkerTable;
                else if (workerType === 'transport') tableData = isLaw148 ? dynamicTables.structuredTransportTable148 : dynamicTables.structuredTransportTable79;
                else if (workerType === 'construction') tableData = isLaw148 ? dynamicTables.structuredConstructionTable148 : dynamicTables.structuredConstructionTable79;
                else {
                    periodError = `لم يتم تنفيذ منطق الحساب لفئة '${workerCategories.find(c => c.type === workerType)?.label || workerType}' بعد.`; break;
                }

                const tableRow = tableData?.find((p: any) => {
                    const rowStartDate = parseDate(p.startDate);
                    const rowEndDate = parseDate(p.endDate);
                    rowEndDate.setUTCHours(23, 59, 59, 999);
                    return currentDate >= rowStartDate && currentDate <= rowEndDate;
                });

                if (!tableRow) { periodError = `لا توجد بيانات متاحة للتاريخ ${monthKey}.`; break; }

                let wage: string, contribution: string;
                if ((['transport', 'construction'].includes(workerType)) && !workerGrade) { periodError = 'الرجاء اختيار درجة العامل / المهارة لهذه الفئة.'; break; }

                if (workerType === 'irregular') {
                    wage = (tableRow as any).wage; contribution = (tableRow as any).contribution;
                } else {
                    const gradeData = (tableRow as any).grades[workerGrade];
                    if (!gradeData) { periodError = `درجة العامل المحددة '${workerGrade}' غير صالحة لهذا النوع من العمال في هذه الفترة.`; break; }
                    wage = gradeData.wage; contribution = gradeData.contribution;
                }

                if (!currentGroup) {
                    currentGroup = { startDate: monthKey, wage, contrib: contribution, count: 1 };
                } else if (currentGroup.wage === wage && currentGroup.contrib === contribution) {
                    currentGroup.count++;
                } else {
                    const prevMonth = new Date(currentDate); prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
                    const endDateKey = `${prevMonth.getUTCFullYear()}-${(prevMonth.getUTCMonth() + 1).toString().padStart(2, '0')}`;
                    groupedBreakdown.push({
                        startDate: currentGroup.startDate, endDate: endDateKey, numMonths: currentGroup.count,
                        monthlyWage: currentGroup.wage, totalWage: parseFloat(currentGroup.wage) * currentGroup.count,
                        monthlyContrib: currentGroup.contrib, totalContrib: parseFloat(currentGroup.contrib) * currentGroup.count,
                    });
                    currentGroup = { startDate: monthKey, wage, contrib: contribution, count: 1 };
                }
                periodTotal += parseFloat(contribution) || 0;
                currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
            }

            if (currentGroup) {
                 groupedBreakdown.push({
                    startDate: currentGroup.startDate, endDate: endDate, numMonths: currentGroup.count,
                    monthlyWage: currentGroup.wage, totalWage: parseFloat(currentGroup.wage) * currentGroup.count,
                    monthlyContrib: currentGroup.contrib, totalContrib: parseFloat(currentGroup.contrib) * currentGroup.count,
                });
            }
            if (periodError) {
                periodResults.push({ id, params: period, totalContribution: 0, breakdown: [], error: periodError, displayType: 'detailed-grouped' });
            } else if (groupedBreakdown.length > 0) {
                grandTotal += periodTotal;
                periodResults.push({ id, params: period, totalContribution: periodTotal, breakdown: groupedBreakdown, displayType: 'detailed-grouped' });
            }
        }
        
        if (periodResults.some(pr => pr.breakdown.length > 0)) {
            setResult({ grandTotal, periodResults });
        } else if (periodResults.length > 0 && periodResults.every(pr => !!pr.error)) {
             setError(periodResults.map(pr => pr.error).join('\n'));
        } else {
            setError('لم يتم العثور على أي فترات صالحة للحساب. يرجى مراجعة البيانات المدخلة.');
        }
    };

    const initiateCalculation = () => {
        const missingWages = periods.some(p => {
            if (!p.workerType || !p.startDate) return false;
            const isStandard = ['gov', 'public', 'private', 'business_owner', 'abroad'].includes(p.workerType);
            if (!isStandard) return false;

            const isPre2020 = parseInt(p.startDate.split('-')[0], 10) < 2020;
            // Check if main wage type exists manually
            if (isPre2020) {
                 // Sectors 1, 2, 3 usually require basic.
                 // Note: 'business_owner' and 'abroad' in pre-2020 are technically handled via income categories which we map to 'basic' type in the wage modal for simplicity in calculation logic, 
                 // but conceptually they are separate. However, for the purpose of this warning, checking for 'basic' is sufficient as the modal enforces type.
                 return !p.wagePeriods.some(w => w.type === 'basic');
            } else {
                 // Post-2020
                 return !p.wagePeriods.some(w => w.type === 'unified' || w.type === 'income');
            }
        });

        if (missingWages) {
            setIsAutoCalcConfirmationOpen(true);
        } else {
            performCalculation();
        }
    }

    const togglePeriodExpansion = (id: number) => {
        setExpandedPeriods(prev => {
            const newSet = new Set(prev);
            if(newSet.has(id)) newSet.delete(id); else newSet.add(id);
            return newSet;
        });
    };

    const handleCopyToClipboard = (periodResult: PeriodResult) => {
        const { breakdown, params, displayType } = periodResult;
        let tsv = '';
        if (displayType === 'detailed') {
            const headers = ['نوع التأمين', 'البيان', 'أجر الاشتراك الشهري', 'مدة الاشتراك (شهر)', 'إجمالي أجر الاشتراك للفترة', 'نسبة العامل', 'نسبة صاحب العمل', 'قيمة حصة العامل للفترة', 'قيمة حصة صاحب العمل للفترة', 'إجمالي الاشتراك للفترة'];
            const rows = breakdown.map(item => [item.insuranceType, item.notes, item.wage.toFixed(2), item.months, item.totalWageForPeriod.toFixed(2), item.employeeRate != null ? `${item.employeeRate.toFixed(2)}%` : '-', item.employerRate != null ? `${item.employerRate.toFixed(2)}%` : '-', item.employeeAmount != null ? item.employeeAmount.toFixed(2) : '-', item.employerAmount != null ? item.employerAmount.toFixed(2) : '-', item.totalAmount != null ? item.totalAmount.toFixed(2) : '-'].join('\t'));
            tsv = [headers.join('\t'), ...rows].join('\n');
        } else if (displayType === 'detailed-grouped') {
            const headers = ['بداية الاشتراك', 'نهاية الاشتراك', 'عدد الشهور', 'أجر الاشتراك الشهري', 'إجمالي أجر الاشتراك', 'قيمة الاشتراك الشهري', 'إجمالي قيمة الاشتراك'];
            const rows = breakdown.map(item => [item.startDate, item.endDate, item.numMonths, item.monthlyWage, item.totalWage.toFixed(2), item.monthlyContrib, item.totalContrib.toFixed(2)].join('\t'));
            tsv = [headers.join('\t'), ...rows].join('\n');
        } else {
            const headers = ['الشهر', 'أجر الاشتراك', 'قيمة الاشتراك'];
            const rows = breakdown.map(item => [item.month, item.wage, item.contribution].join('\t'));
            tsv = [headers.join('\t'), ...rows].join('\n');
        }
        navigator.clipboard.writeText(tsv).then(() => { setCopySuccessId(periodResult.id); setTimeout(() => setCopySuccessId(null), 2000); });
    };
    
    const aggregatedResults = useMemo<Record<string, AggregationRow> | null>(() => {
        if (!result) return null;
        const orderedCodes = ['1', '2', '3', '4', '5', '8', '7', '9'];
        const matrix: Record<string, AggregationRow> = {};
        orderedCodes.forEach(code => {
            let name = '';
            const cat = workerCategories.find(c => c.code === code);
            if (cat) name = cat.label; else return;
            matrix[code] = { label: { name: name, code: code }, preBasic: { m: 0, w: 0, c: 0 }, preVar: { m: 0, w: 0, c: 0 }, post: { m: 0, w: 0, c: 0 } };
        });

        result.periodResults.forEach(res => {
            const code = res.params.sectorCode;
            const target = matrix[code];
            if (!target) return;
            const startYear = parseInt(res.params.startDate.split('-')[0]);
            const isPre2020 = startYear < 2020;

            if (res.displayType === 'detailed') {
                if (isPre2020) {
                    const basicItems = res.breakdown.filter(b => !b.insuranceType.includes('متغير'));
                    const varItems = res.breakdown.filter(b => b.insuranceType.includes('متغير'));
                    
                    // Use helper to sum unique chunks for wage/months (complicated because breakdown splits by insurance type)
                    // Actually, standard table breakdown items are already grouped by wage period.
                    // BUT, we have separate items for Pension, Injury, etc. for the SAME wage period.
                    // We need to sum unique time-wage blocks.
                    
                    // Simplified aggregation for summary table:
                    // Total contribution is sum of all items.
                    // Total Wage/Months is tricky. We take the "Pension" (or first available) type as representative for the duration.
                    
                    const basicPensionItems = basicItems.filter(b => b.insuranceType.includes('الشيخوخة'));
                    if (basicPensionItems.length > 0) {
                        target.preBasic.m += basicPensionItems.reduce((sum, b) => sum + b.months, 0);
                        target.preBasic.w += basicPensionItems.reduce((sum, b) => sum + b.totalWageForPeriod, 0);
                    }
                    target.preBasic.c += basicItems.reduce((sum, b) => sum + b.totalAmount, 0);

                    const varPensionItems = varItems.filter(b => b.insuranceType.includes('الشيخوخة'));
                    if (varPensionItems.length > 0) {
                        target.preVar.m += varPensionItems.reduce((sum, b) => sum + b.months, 0);
                        target.preVar.w += varPensionItems.reduce((sum, b) => sum + b.totalWageForPeriod, 0);
                    }
                    target.preVar.c += varItems.reduce((sum, b) => sum + b.totalAmount, 0);

                } else {
                    // Post 2020
                    const pensionItems = res.breakdown.filter(b => b.insuranceType.includes('الشيخوخة'));
                    if (pensionItems.length > 0) {
                        target.post.m += pensionItems.reduce((sum, b) => sum + b.months, 0);
                        target.post.w += pensionItems.reduce((sum, b) => sum + b.totalWageForPeriod, 0);
                    }
                    target.post.c += res.totalContribution;
                }
            } else {
                res.breakdown.forEach((group: any) => {
                    const groupYear = parseInt(group.startDate.split('-')[0]);
                    const groupPre = groupYear < 2020;
                    if (groupPre) {
                        target.preBasic.m += group.numMonths; target.preBasic.w += group.totalWage; target.preBasic.c += group.totalContrib;
                    } else {
                        target.post.m += group.numMonths; target.post.w += group.totalWage; target.post.c += group.totalContrib;
                    }
                });
            }
        });
        return matrix;
    }, [result]);
    
    const workerTypeLabels = Object.fromEntries(workerCategories.map(c => [c.type, c.label])) as Record<WorkerType, string>;
    const editingPeriod = useMemo(() => periods.find(p => p.id === editingPeriodId), [editingPeriodId, periods]);
    const wageEditingPeriod = useMemo(() => periods.find(p => p.id === wageEditingPeriodId), [wageEditingPeriodId, periods]);

    return (
        <div className="bg-[var(--surface-container-low)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-1 p-4 sm:p-6 lg:p-8 transition-colors duration-300">
            <div className="space-y-6 max-w-7xl mx-auto">
                
                <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--outline-variant)]">
                    <h3 className="text-xl font-bold text-[var(--on-surface)] mb-4 border-b border-[var(--outline-variant)] pb-3">فترات الاشتراك</h3>
                     <div className="overflow-x-auto">
                        <div className="min-w-[1200px] space-y-2">
                            <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-x-2 px-2 pb-2 text-xs font-bold text-center text-[var(--on-surface-variant)] uppercase tracking-wider">
                                <div className="col-span-1">الفترة</div>
                                <div className="col-span-1">كود</div>
                                <div className="col-span-2">فئة العامل</div>
                                <div className="col-span-2">الدرجة/المهارة</div>
                                <div className="col-span-2">تاريخ البداية</div>
                                <div className="col-span-2">تاريخ النهاية</div>
                                <div className="col-span-2">أجر الاشتراك</div>
                                <div className="col-span-2">إجراءات</div>
                            </div>
                            {periods.map((period, index) => {
                                 const isStartDatePre2020 = period.startDate && parseInt(period.startDate.split('-')[0], 10) < 2020;
                                 const showPre2020GovInputs = isStartDatePre2020 && ['gov', 'public', 'private'].includes(period.workerType);
                                 const showPre2020BusinessInputs = isStartDatePre2020 && ['business_owner', 'abroad'].includes(period.workerType);
                                 const showPost2020GovInputs = !isStartDatePre2020 && ['gov', 'public', 'private'].includes(period.workerType);
                                 const showPost2020BusinessInputs = !isStartDatePre2020 && ['business_owner', 'abroad'].includes(period.workerType);
                                 const showCalculatedWage = ['construction', 'transport', 'irregular'].includes(period.workerType);
                                 const showInsuranceButton = (showPre2020GovInputs || showPre2020BusinessInputs || showPost2020GovInputs || showPost2020BusinessInputs) && period.startDate;
                                 
                                 // New Logic: Check if sector supports multi-wage
                                 const isMultiWageSector = ['gov', 'public', 'private', 'business_owner', 'abroad'].includes(period.workerType);
                                 const hasWagePeriods = period.wagePeriods && period.wagePeriods.length > 0;

                                return (
                                <div key={period.id} className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-x-2 items-start p-2 rounded-lg hover:bg-[var(--surface-container)]">
                                    <div className="col-span-1 flex items-center justify-center h-full text-center text-[var(--on-surface-variant)] font-medium">{index + 1}</div>
                                    <div className="col-span-1">
                                        <input type="text" value={period.sectorCode} onChange={e => handlePeriodChange(period.id, 'sectorCode', e.target.value)} className="input-style" maxLength={1}/>
                                    </div>
                                    <div className="col-span-2">
                                        <select value={period.workerType} onChange={e => handlePeriodChange(period.id, 'workerType', e.target.value)} className="input-style">
                                            <option value="">-- اختر --</option>
                                            {workerCategories.map(cat => <option key={cat.type} value={cat.type}>{cat.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        {['transport', 'construction'].includes(period.workerType) ? (
                                             <select value={period.workerGrade} onChange={e => handlePeriodChange(period.id, 'workerGrade', e.target.value)} className="input-style">
                                                <option value="">-- اختر الدرجة/المهارة --</option>
                                                {(workerGrades[period.workerType as keyof typeof workerGrades] || []).map(grade => <option key={grade} value={grade}>{grade}</option>)}
                                            </select>
                                        ) : (
                                            <input type="text" value="لا ينطبق" className="input-style text-center bg-[var(--surface-container)] text-[var(--on-surface-variant)]" disabled />
                                        )}
                                    </div>
                                    <div className="col-span-2 flex flex-col gap-2">
                                        <input 
                                            type="month" 
                                            value={period.startDate} 
                                            onChange={e => handlePeriodChange(period.id, 'startDate', e.target.value)} 
                                            className="input-style"
                                            placeholder="بداية الأساسي"
                                        />
                                        {/* Legacy Variable Date Input - Only show if using old method AND not using new multi-wage system */}
                                        {showPre2020GovInputs && !hasWagePeriods && (
                                            <input 
                                                type="month" 
                                                value={period.variableStartDate || ''} 
                                                onChange={e => handlePeriodChange(period.id, 'variableStartDate', e.target.value)} 
                                                className="input-style text-sm border-dashed border-[var(--primary)]/50"
                                                min="1984-04"
                                                max={period.endDate}
                                                placeholder="بداية المتغير"
                                                title="تاريخ بداية أجر الاشتراك المتغير (لا يسبق 1/4/1984)"
                                            />
                                        )}
                                    </div>
                                    <div className="col-span-2 flex flex-col gap-2">
                                        <input 
                                            type="month" 
                                            value={period.endDate} 
                                            onChange={e => handlePeriodChange(period.id, 'endDate', e.target.value)} 
                                            min={period.startDate} 
                                            max={isStartDatePre2020 ? '2019-12' : undefined} 
                                            disabled={!period.startDate} 
                                            className="input-style"
                                            placeholder="نهاية الأساسي"
                                        />
                                        {showPre2020GovInputs && !hasWagePeriods && (
                                            <input 
                                                type="month" 
                                                value={period.variableEndDate || ''} 
                                                onChange={e => handlePeriodChange(period.id, 'variableEndDate', e.target.value)} 
                                                className="input-style text-sm border-dashed border-[var(--primary)]/50"
                                                min={period.variableStartDate || '1984-04'}
                                                max={period.endDate}
                                                disabled={!period.variableStartDate}
                                                placeholder="نهاية المتغير"
                                                title="تاريخ نهاية أجر الاشتراك المتغير"
                                            />
                                        )}
                                    </div>
                                    <div className="col-span-2 grid grid-cols-1 gap-y-2 items-center">
                                        {isMultiWageSector ? (
                                            <button 
                                                onClick={() => period.startDate && period.endDate ? setWageEditingPeriodId(period.id) : alert('يرجى تحديد بداية ونهاية الفترة أولاً')}
                                                className={`input-style text-center font-semibold transition-colors ${hasWagePeriods ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)] border-[var(--primary)]' : 'bg-[var(--surface)] hover:bg-[var(--surface-container)]'}`}
                                            >
                                                {hasWagePeriods ? `تم إدراج ${period.wagePeriods.length} أجر` : 'إدراج الأجور'}
                                            </button>
                                        ) : (
                                            <>
                                                {showCalculatedWage && (
                                                     <input type="text" value="يُحسب تلقائياً" className="input-style text-center bg-[var(--surface-container)] text-[var(--on-surface-variant)]" disabled />
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="col-span-2 flex items-center justify-between">
                                         {showInsuranceButton ? (
                                            <button onClick={() => setEditingPeriodId(period.id)} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)] rounded-lg hover:opacity-90 transition">
                                                <CogIcon className="h-4 w-4" />
                                                <span>تحديد التأمين</span>
                                            </button>
                                        ) : <div className="w-full"></div> }
                                        <div className="flex-shrink-0 ml-auto">
                                            {periods.length > 1 && (
                                                <button onClick={() => setDeleteConfirmationId(period.id)} className="p-2 text-[var(--error)] hover:bg-[var(--error-container)] rounded-full transition-colors" title="إزالة الفترة">
                                                    <DeleteIcon className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <div className="flex gap-4">
                        <button
                            onClick={initiateCalculation}
                            className="px-10 py-3 bg-[var(--primary)] text-[var(--on-primary)] font-bold rounded-full shadow-elevation-1 hover:shadow-elevation-2 hover:bg-[color-mix(in_srgb,_var(--on-primary)_8%,_var(--primary))] active:bg-[color-mix(in_srgb,_var(--on-primary)_12%,_var(--primary))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--primary)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-elevation-1"
                        >
                            حساب الاشتراكات
                        </button>
                        <button
                            onClick={handleReset}
                            className="px-8 py-3 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] border border-[var(--outline)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--outline)] transition-all"
                        >
                            إعادة تعيين
                        </button>
                    </div>
                    <button onClick={handleAddPeriod} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] border border-[var(--outline)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--outline)] transition-all flex items-center gap-2">
                        <PlusIcon />
                        إضافة فترة اشتراك جديدة
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-[var(--error-container)] rounded-2xl text-[var(--on-error-container)] text-center whitespace-pre-wrap">
                        <p>{error}</p>
                    </div>
                )}
                
                {result && aggregatedResults && (
                    <section className="mt-6 animate-fade-in">
                        <div className="bg-[var(--secondary-container)] rounded-2xl mb-6 overflow-hidden">
                            <div 
                                className="p-6 cursor-pointer flex justify-between items-center hover:bg-[var(--on-secondary-container)]/5 transition-colors"
                                onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
                            >
                                <h3 className="text-lg font-bold text-[var(--on-secondary-container)]">ملخص الاشتراكات المستحقة</h3>
                                <div className="flex items-center gap-2 text-[var(--on-secondary-container)]">
                                    <span className="text-sm font-medium">{isSummaryCollapsed ? 'عرض التفاصيل' : 'إخفاء التفاصيل'}</span>
                                    {isSummaryCollapsed ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
                                </div>
                            </div>
                            
                            {!isSummaryCollapsed && (
                                <div className="p-6 pt-0 border-t border-[var(--on-secondary-container)]/10 animate-fade-in">
                                    <div className="overflow-x-auto bg-[var(--surface)] rounded-xl border border-[var(--outline-variant)] shadow-sm">
                                        <table className="w-full text-sm text-center">
                                            <thead className="bg-[var(--surface-container)] text-[var(--on-surface-variant)]">
                                                <tr>
                                                    <th className="p-3 border-b border-[var(--outline-variant)] w-1/4">فئة العامل</th>
                                                    <th className="p-3 border-b border-[var(--outline-variant)]">البيان (الفترة / نوع الأجر)</th>
                                                    <th className="p-3 border-b border-[var(--outline-variant)]">إجمالي مدد الاشتراك (شهر)</th>
                                                    <th className="p-3 border-b border-[var(--outline-variant)]">إجمالي أجر الاشتراك</th>
                                                    <th className="p-3 border-b border-[var(--outline-variant)]">إجمالي قيمة الاشتراكات</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.values(aggregatedResults).map((row: AggregationRow, index: number) => {
                                                    const hasPreBasic = row.preBasic.m > 0;
                                                    const hasPreVar = row.preVar.m > 0;
                                                    const hasPost = row.post.m > 0;
                                                    const totalRows = (hasPreBasic ? 1 : 0) + (hasPreVar ? 1 : 0) + (hasPost ? 1 : 0);
                                                    if (totalRows === 0) return null;
                                                    const renderSubRow = (label: string, data: AggregationData, isFirst: boolean) => (
                                                        <tr className="border-b border-[var(--outline-variant)] hover:bg-[var(--surface-container-high)]">
                                                            {isFirst && (
                                                                <td rowSpan={totalRows} className="p-3 align-middle bg-[var(--surface-container-low)] border-l border-[var(--outline-variant)] font-bold text-[var(--primary)] text-right">
                                                                    {row.label.name}
                                                                </td>
                                                            )}
                                                            <td className="p-3 text-[var(--on-surface)]">{label}</td>
                                                            <td className="p-3 font-mono">{data.m}</td>
                                                            <td className="p-3 font-mono">{data.w.toFixed(2)}</td>
                                                            <td className="p-3 font-mono font-semibold">{data.c.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                    let renderedRows = [];
                                                    let first = true;
                                                    if (hasPreBasic) { renderedRows.push(renderSubRow('قبل 2020 (أجر أساسي)', row.preBasic, first)); first = false; }
                                                    if (hasPreVar) { renderedRows.push(renderSubRow('قبل 2020 (أجر متغير)', row.preVar, first)); first = false; }
                                                    if (hasPost) { renderedRows.push(renderSubRow('بعد 2020 (أجر موحد)', row.post, first)); first = false; }
                                                    return <React.Fragment key={index}>{renderedRows}</React.Fragment>;
                                                })}
                                            </tbody>
                                            <tfoot className="bg-[var(--secondary)] text-[var(--on-secondary)] font-bold text-xs sm:text-sm">
                                                <tr className="border-b border-white/20">
                                                    <td colSpan={2} className="p-3 text-right">إجمالي (أجر أساسي - قبل 2020)</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.preBasic.m, 0)}</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.preBasic.w, 0).toFixed(2)}</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.preBasic.c, 0).toFixed(2)}</td>
                                                </tr>
                                                <tr className="border-b border-white/20">
                                                    <td colSpan={2} className="p-3 text-right">إجمالي (أجر متغير - قبل 2020)</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.preVar.m, 0)}</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.preVar.w, 0).toFixed(2)}</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.preVar.c, 0).toFixed(2)}</td>
                                                </tr>
                                                <tr className="border-b-2 border-white/40">
                                                    <td colSpan={2} className="p-3 text-right">إجمالي (أجر موحد - بعد 2020)</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.post.m, 0)}</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.post.w, 0).toFixed(2)}</td>
                                                    <td className="p-3 font-mono">{Object.values(aggregatedResults).reduce((acc: number, r: AggregationRow) => acc + r.post.c, 0).toFixed(2)}</td>
                                                </tr>
                                                <tr className="bg-black/20 text-lg">
                                                    <td colSpan={4} className="p-4 text-right">الإجمالي العام للمستحقات</td>
                                                    <td className="p-4 font-mono">{result.grandTotal.toFixed(2)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-6 mt-6">
                           <h3 className="text-lg font-bold text-[var(--on-surface)]">تفاصيل الفترات المحسوبة:</h3>
                            {result.periodResults.map((periodResult, index) => {
                                const isExpanded = expandedPeriods.has(periodResult.id);
                                const monthDiff = getMonthDiff(parseDate(periodResult.params.startDate), parseDate(periodResult.params.endDate));
                                return(
                                <div key={periodResult.id} className="p-4 bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)]">
                                    <div className="flex justify-between items-start cursor-pointer" onClick={() => togglePeriodExpansion(periodResult.id)}>
                                        <div>
                                            <h4 className="font-bold text-[var(--primary)] mb-1">الفترة {index + 1}: {workerTypeLabels[periodResult.params.workerType as keyof typeof workerTypeLabels]} {periodResult.params.workerGrade && ` - ${periodResult.params.workerGrade}`}</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                                                <div><span className="text-[var(--on-surface-variant)]">من:</span> <span className="font-mono font-semibold">{periodResult.params.startDate}</span></div>
                                                <div><span className="text-[var(--on-surface-variant)]">إلى:</span> <span className="font-mono font-semibold">{periodResult.params.endDate}</span></div>
                                                <div><span className="text-[var(--on-surface-variant)]">عدد الشهور:</span> <span className="font-mono font-semibold">{monthDiff}</span></div>
                                                <div><span className="text-[var(--on-surface-variant)]">إجمالي الفترة:</span> <span className="font-mono font-semibold">{periodResult.totalContribution.toFixed(2)} جنيه</span></div>
                                            </div>
                                        </div>
                                        <ChevronDownIcon className={`h-6 w-6 text-[var(--on-surface-variant)] transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                    {isExpanded && (
                                        <div className="mt-4 pt-4 border-t border-[var(--outline-variant)] space-y-3 animate-fade-in">
                                             <div className="text-left">
                                                <button onClick={() => handleCopyToClipboard(periodResult)} className="relative px-4 py-1 text-xs font-semibold bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)] rounded-md hover:opacity-90 transition flex items-center gap-2">
                                                    {copySuccessId === periodResult.id ? <CheckIcon className="h-4 w-4"/> : <ClipboardListIcon className="h-4 w-4" />}
                                                    <span>{copySuccessId === periodResult.id ? 'تم النسخ!' : 'نسخ التفاصيل (Excel)'}</span>
                                                </button>
                                            </div>
                                            {periodResult.error ? (
                                                <p className="text-center p-3 bg-[var(--error-container)] rounded-xl text-[var(--on-error-container)]">{periodResult.error}</p>
                                            ) : (
                                                 periodResult.displayType === 'detailed' ? (
                                                    <StandardResultTable 
                                                        breakdown={periodResult.breakdown} 
                                                        periodParams={periodResult.params} 
                                                        basicMonths={periodResult.basicMonths}
                                                        variableMonths={periodResult.variableMonths}
                                                    />
                                                 ) : periodResult.displayType === 'detailed-grouped' ? (
                                                     <DetailedGroupedResultTable breakdown={periodResult.breakdown} />
                                                 ) : (
                                                    <GroupedResultTable breakdown={periodResult.breakdown} />
                                                 )
                                            )}
                                        </div>
                                    )}
                                </div>
                            )})}
                        </div>
                    </section>
                )}
            </div>

            {editingPeriod && (
                <InsuranceSelectionModal 
                    period={editingPeriod}
                    onClose={() => setEditingPeriodId(null)}
                    onSave={handleInsuranceSelectionSave}
                    ratesTable={parseInt(editingPeriod.startDate.split('-')[0], 10) < 2020 ? dynamicTables.ratesTableBefore2020 : dynamicTables.ratesTableAfter2020}
                    reductionsTable={parseInt(editingPeriod.startDate.split('-')[0], 10) < 2020 ? dynamicTables.reductionsTableBefore2020 : dynamicTables.reductionsTableAfter2020}
                />
            )}

            {wageEditingPeriod && (
                <WageManagementModal 
                    period={wageEditingPeriod}
                    onClose={() => setWageEditingPeriodId(null)}
                    onSave={handleWagesSave}
                    dynamicTables={dynamicTables}
                />
            )}
            
            <DeleteConfirmationModal 
                isOpen={deleteConfirmationId !== null}
                onClose={() => setDeleteConfirmationId(null)}
                onConfirm={confirmDeletePeriod}
            />

            <AutoCalcConfirmationModal
                isOpen={isAutoCalcConfirmationOpen}
                onClose={() => setIsAutoCalcConfirmationOpen(false)}
                onConfirm={() => { setIsAutoCalcConfirmationOpen(false); performCalculation(); }}
            />

             <style>{`
                .input-style {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    border: 1px solid var(--outline);
                    border-radius: 0.5rem;
                    box-shadow: none;
                    transition: all 0.2s ease-in-out;
                    text-align: right;
                    background-color: var(--surface-container-high);
                    color: var(--on-surface);
                    caret-color: var(--primary);
                    font-size: 0.875rem;
                }
                .input-style:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px var(--focus-ring);
                }
                .input-style:disabled {
                    background-color: var(--surface-container);
                    cursor: not-allowed;
                    opacity: 0.7;
                }
                .input-style:read-only {
                    background-color: var(--surface-container);
                    cursor: default;
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
                    padding-left: 0.5rem;
                }
                .input-style[type="date"]:hover::-webkit-calendar-picker-indicator,
                .input-style[type="month"]:hover::-webkit-calendar-picker-indicator {
                    opacity: 1;
                }
                [data-color-scheme="dark"] .input-style[type="date"]::-webkit-calendar-picker-indicator,
                [data-color-scheme="dark"] .input-style[type="month"]::-webkit-calendar-picker-indicator {
                   filter: invert(1) brightness(0.8);
                }
                 @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
                 @keyframes fade-in-fast { from { opacity: 0; } to { opacity: 1; } }
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

export default SubscriptionCalculator;
