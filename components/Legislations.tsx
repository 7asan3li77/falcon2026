
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    SearchIcon, PlusIcon, FileIcon, FileDownloadIcon, 
    EditIcon, DeleteIcon, EyeIcon, EyeOffIcon, CloseIcon, 
    ScaleIcon, SaveIcon
} from './Icons';
import { User } from '../types';
import { hasPermission } from '../permissions';
import { produce } from 'immer';
import { getAllLegislations, addLegislationToDB, deleteLegislationFromDB } from './indexedDB';

// --- Types & Constants ---

export const LegislationTypes = [
    'قانون',
    'قرار رئيس مجلس وزراء',
    'تعليمات',
    'قرار وزاري',
    'منشور وزاري',
    'قرار رئيس الهيئة',
    'كتاب دوري',
    'رسائل داخلية',
    'فتاوي اللجنة القانونية والتأمينية والفنية',
    'المرصد الفني',
    'أخرى'
] as const;

type LegislationType = typeof LegislationTypes[number];

interface Legislation {
    id: string; // UUID
    type: LegislationType;
    number: string;
    year: string;
    title: string; // Usually auto-generated or manually entered
    fileContent: string; // Base64 string
    fileName: string;
    fileType: string; // MIME type
    fileSize: number;
    uploadDate: string;
    isVisible: boolean;
}

const MAX_FILE_SIZE_MB = 50; // Limit increased to 50MB

// --- Helper Components ---

const ConfirmationDialog: React.FC<{
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    children: React.ReactNode;
}> = ({ isOpen, onConfirm, onCancel, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in-fast" onClick={onCancel}>
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-5 p-6 w-full max-w-md m-4 transform transition-all animate-modal-content-show" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-[var(--on-surface)] mb-2">{title}</h3>
                <div className="text-[var(--on-surface-variant)] mb-6">{children}</div>
                <div className="flex justify-end gap-4">
                    <button onClick={onCancel} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-high)] focus:ring-[var(--primary)] transition">
                        إلغاء
                    </button>
                    <button onClick={onConfirm} className="px-6 py-2 bg-[var(--error)] text-[var(--on-error)] font-semibold rounded-full hover:bg-[color-mix(in_srgb,_var(--on-error)_8%,_var(--error))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-high)] focus:ring-[var(--error)] transition">
                        حذف
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Component ---

interface LegislationsProps {
    currentUser: User;
}

const Legislations: React.FC<LegislationsProps> = ({ currentUser }) => {
    // --- State ---
    const [legislations, setLegislations] = useState<Legislation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Load from IndexedDB on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                const data = await getAllLegislations();
                setLegislations(data);
            } catch (error) {
                console.error("Failed to load legislations from DB", error);
                alert("حدث خطأ أثناء تحميل التشريعات.");
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<LegislationType | ''>('');
    const [filterYear, setFilterYear] = useState('');

    // Modal
    const [isModalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Legislation | null>(null);
    
    // Delete Confirmation State
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

    // Permissions
    const canAdd = hasPermission(currentUser, 'legislations', 'add');
    const canModify = hasPermission(currentUser, 'legislations', 'modify');
    const canDelete = hasPermission(currentUser, 'legislations', 'delete');

    // --- Handlers ---

    const requestDelete = (id: string) => {
        setDeleteConfirmation({ isOpen: true, id });
    };

    const confirmDelete = async () => {
        if (deleteConfirmation.id) {
            try {
                await deleteLegislationFromDB(deleteConfirmation.id);
                setLegislations(prev => prev.filter(item => item.id !== deleteConfirmation.id));
            } catch (error) {
                console.error("Failed to delete from DB", error);
                alert("فشل حذف التشريع من قاعدة البيانات.");
            }
        }
        setDeleteConfirmation({ isOpen: false, id: null });
    };

    const handleToggleVisibility = async (id: string) => {
        const itemToUpdate = legislations.find(i => i.id === id);
        if (itemToUpdate) {
            const updatedItem = { ...itemToUpdate, isVisible: !itemToUpdate.isVisible };
            try {
                await addLegislationToDB(updatedItem);
                setLegislations(produce(draft => {
                    const item = draft.find(i => i.id === id);
                    if (item) item.isVisible = !item.isVisible;
                }));
            } catch (error) {
                console.error("Failed to update visibility in DB", error);
                alert("فشل تحديث الحالة.");
            }
        }
    };

    const handleSaveLegislation = async (newItem: Legislation) => {
        try {
            await addLegislationToDB(newItem);
            if (editingItem) {
                setLegislations(prev => prev.map(i => i.id === editingItem.id ? newItem : i));
            } else {
                setLegislations(prev => [newItem, ...prev]);
            }
            setModalOpen(false);
        } catch (error) {
            console.error("Failed to save legislation", error);
            alert("حدث خطأ أثناء حفظ التشريع. يرجى المحاولة مرة أخرى.");
        }
    };

    const handleDownload = (item: Legislation) => {
        const link = document.createElement("a");
        link.href = item.fileContent;
        link.download = item.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredLegislations = useMemo(() => {
        return legislations.filter(item => {
            // Visibility check for non-admins
            if (!canModify && !item.isVisible) return false;

            const matchesSearch = 
                item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.number.includes(searchTerm) ||
                item.fileName.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesType = filterType ? item.type === filterType : true;
            const matchesYear = filterYear ? item.year === filterYear : true;

            return matchesSearch && matchesType && matchesYear;
        }).sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()); // Newest first
    }, [legislations, searchTerm, filterType, filterYear, canModify]);


    return (
        <div className="flex flex-col h-full space-y-6 animate-fade-in">
            {/* Header & Filters */}
            <div className="bg-[var(--surface-container-low)] p-4 rounded-3xl border border-[var(--outline-variant)] shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-3 w-full md:w-auto flex-grow">
                    <div className="relative w-full md:w-96">
                        <input 
                            type="text" 
                            placeholder="بحث برقم التشريع، السنة، أو العنوان..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--outline)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                        />
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)] w-5 h-5" />
                    </div>
                    
                    <select 
                        value={filterType} 
                        onChange={(e) => setFilterType(e.target.value as LegislationType)}
                        className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--outline)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
                    >
                        <option value="">كل الأنواع</option>
                        {LegislationTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <input 
                        type="number" 
                        placeholder="السنة" 
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        className="w-24 p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--outline)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm text-center"
                    />
                </div>

                {canAdd && (
                    <button 
                        onClick={() => { setEditingItem(null); setModalOpen(true); }}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-[var(--on-primary)] font-semibold rounded-full shadow-md hover:bg-[var(--primary-hover)] transition-transform transform hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
                    >
                        <PlusIcon className="w-5 h-5" />
                        إضافة تشريع
                    </button>
                )}
            </div>

            {/* Content Table */}
            <div className="bg-[var(--surface-container-low)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-1 overflow-hidden flex-grow flex flex-col relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-[var(--surface-container-low)]/80 backdrop-blur-sm flex items-center justify-center z-50">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-[var(--primary)] font-medium">جاري تحميل التشريعات...</p>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto flex-grow">
                    <table className="w-full text-right text-sm">
                        <thead className="bg-[var(--surface-container)] text-[var(--on-surface-variant)] sticky top-0 z-10">
                            <tr>
                                <th className="p-3 font-semibold border-b border-[var(--outline-variant)] w-32">النوع</th>
                                <th className="p-3 font-semibold border-b border-[var(--outline-variant)] w-24">السنة</th>
                                <th className="p-3 font-semibold border-b border-[var(--outline-variant)] w-24">الرقم</th>
                                <th className="p-3 font-semibold border-b border-[var(--outline-variant)]">موضوع التشريع</th>
                                <th className="p-3 font-semibold border-b border-[var(--outline-variant)] w-48">الملف المرفق</th>
                                {canModify && <th className="p-3 font-semibold border-b border-[var(--outline-variant)] w-24 text-center">الحالة</th>}
                                <th className="p-3 font-semibold border-b border-[var(--outline-variant)] w-32 text-center">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="bg-[var(--surface)]">
                            {!isLoading && filteredLegislations.length > 0 ? (
                                filteredLegislations.map((item) => (
                                    <tr key={item.id} className="border-b border-[var(--outline-variant)] last:border-b-0 hover:bg-[var(--surface-container-high)] transition-colors">
                                        <td className="p-3 align-middle font-medium text-[var(--primary)] whitespace-nowrap">{item.type}</td>
                                        <td className="p-3 align-middle font-mono text-[var(--on-surface-variant)]">{item.year}</td>
                                        <td className="p-3 align-middle font-mono font-bold text-[var(--on-surface)]">{item.number}</td>
                                        <td className="p-3 align-middle text-[var(--on-surface)]">
                                            <div className="line-clamp-2" title={item.title}>{item.title}</div>
                                        </td>
                                        <td className="p-3 align-middle">
                                            <div className="flex items-center gap-2 text-xs text-[var(--on-surface-variant)] bg-[var(--surface-container)] px-2 py-1 rounded-lg w-fit">
                                                <FileIcon className="w-4 h-4 text-[var(--tertiary)]" />
                                                <span className="max-w-[120px] truncate" title={item.fileName}>{item.fileName}</span>
                                            </div>
                                        </td>
                                        {canModify && (
                                            <td className="p-3 align-middle text-center">
                                                <button 
                                                    onClick={() => handleToggleVisibility(item.id)} 
                                                    className={`p-2 rounded-full transition-colors ${item.isVisible ? 'text-[var(--primary)] bg-[var(--primary-container)]' : 'text-[var(--on-surface-variant)] bg-[var(--surface-container)]'}`}
                                                    title={item.isVisible ? "مرئي للمستخدمين" : "مخفي"}
                                                >
                                                    {item.isVisible ? <EyeIcon className="w-4 h-4"/> : <EyeOffIcon className="w-4 h-4"/>}
                                                </button>
                                            </td>
                                        )}
                                        <td className="p-3 align-middle text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button 
                                                    onClick={() => handleDownload(item)} 
                                                    className="p-2 text-[var(--primary)] hover:bg-[var(--primary-container)] rounded-full transition-colors" 
                                                    title="تحميل"
                                                >
                                                    <FileDownloadIcon className="w-5 h-5" />
                                                </button>
                                                {canModify && (
                                                    <button 
                                                        onClick={() => { setEditingItem(item); setModalOpen(true); }} 
                                                        className="p-2 text-[var(--tertiary)] hover:bg-[var(--tertiary-container)] rounded-full transition-colors" 
                                                        title="تعديل"
                                                    >
                                                        <EditIcon className="w-5 h-5" />
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); requestDelete(item.id); }}
                                                        className="p-2 text-[var(--error)] hover:bg-[var(--error-container)] rounded-full transition-colors" 
                                                        title="حذف"
                                                    >
                                                        <DeleteIcon className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : !isLoading ? (
                                <tr>
                                    <td colSpan={canModify ? 7 : 6} className="p-12 text-center text-[var(--on-surface-variant)]">
                                        <div className="flex flex-col items-center justify-center opacity-60">
                                            <ScaleIcon className="w-16 h-16 mb-4 text-[var(--outline)]" />
                                            <p className="text-lg font-medium">لا توجد تشريعات مطابقة.</p>
                                            {canAdd && <p className="text-sm mt-1">اضغط على "إضافة تشريع" في الأعلى لإضافة ملف جديد.</p>}
                                        </div>
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <LegislationModal 
                    isOpen={isModalOpen} 
                    onClose={() => setModalOpen(false)} 
                    onSave={handleSaveLegislation}
                    initialData={editingItem}
                />
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmationDialog
                isOpen={deleteConfirmation.isOpen}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirmation({ isOpen: false, id: null })}
                title="تأكيد الحذف"
            >
                <p>هل أنت متأكد تماماً من حذف هذا التشريع؟</p>
                <p className="text-sm mt-2 text-[var(--error)]">لا يمكن التراجع عن هذا الإجراء.</p>
            </ConfirmationDialog>
        </div>
    );
};

// --- Modal Component ---

interface LegislationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Legislation) => void;
    initialData: Legislation | null;
}

const LegislationModal: React.FC<LegislationModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [formData, setFormData] = useState<Partial<Legislation>>({
        type: 'قانون',
        number: '',
        year: new Date().getFullYear().toString(),
        title: '',
        isVisible: true
    });
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false); // Add saving state
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                setError(`حجم الملف كبير جداً. الحد الأقصى ${MAX_FILE_SIZE_MB} ميجابايت لضمان استقرار البرنامج.`);
                return;
            }
            setFile(selectedFile);
            setError('');
            
            // Auto-generate title if empty
            if (!formData.title && formData.type && formData.number) {
                 setFormData(prev => ({ ...prev, title: `${formData.type} رقم ${formData.number} لسنة ${formData.year}` }));
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.type || !formData.number || !formData.year) {
            setError('الرجاء ملء جميع الحقول المطلوبة.');
            return;
        }
        if (!file && !initialData) {
            setError('الرجاء اختيار ملف للتحميل.');
            return;
        }

        setIsSaving(true); // Start loading

        const processSave = (fileContent: string, fileName: string, fileType: string, fileSize: number) => {
            const newItem: Legislation = {
                id: initialData?.id || crypto.randomUUID(),
                type: formData.type as LegislationType,
                number: formData.number!,
                year: formData.year!,
                title: formData.title || `${formData.type} رقم ${formData.number} لسنة ${formData.year}`,
                isVisible: formData.isVisible !== undefined ? formData.isVisible : true,
                fileContent: fileContent,
                fileName: fileName,
                fileType: fileType,
                fileSize: fileSize,
                uploadDate: new Date().toISOString()
            };
            onSave(newItem);
            // Note: Modal closing handled by parent on successful save
        };

        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result as string;
                processSave(result, file.name, file.type, file.size);
            };
            reader.readAsDataURL(file);
        } else if (initialData) {
            // Keep existing file
            processSave(initialData.fileContent, initialData.fileName, initialData.fileType, initialData.fileSize);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-5 w-full max-w-2xl flex flex-col animate-modal-content-show" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                    <h3 className="text-xl font-bold text-[var(--on-surface)]">
                        {initialData ? 'تعديل تشريع' : 'إضافة تشريع جديد'}
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--surface-container)]"><CloseIcon /></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">نوع التشريع</label>
                            <select 
                                value={formData.type} 
                                onChange={e => setFormData({...formData, type: e.target.value as LegislationType})}
                                className="input-style w-full"
                                disabled={isSaving}
                            >
                                {LegislationTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">سنة الإصدار</label>
                            <input 
                                type="number" 
                                value={formData.year} 
                                onChange={e => setFormData({...formData, year: e.target.value})}
                                className="input-style w-full"
                                placeholder="YYYY"
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">رقم التشريع</label>
                        <input 
                            type="text" 
                            value={formData.number} 
                            onChange={e => setFormData({...formData, number: e.target.value})}
                            className="input-style w-full"
                            placeholder="مثال: 148"
                            disabled={isSaving}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">عنوان/وصف التشريع (اختياري)</label>
                        <input 
                            type="text" 
                            value={formData.title} 
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            className="input-style w-full"
                            placeholder="سيتم إنشاؤه تلقائياً إذا ترك فارغاً"
                            disabled={isSaving}
                        />
                    </div>

                    <div className={`p-4 border-2 border-dashed border-[var(--outline)] rounded-xl bg-[var(--surface)] text-center cursor-pointer hover:bg-[var(--surface-container)] transition-colors ${isSaving ? 'opacity-50 pointer-events-none' : ''}`} onClick={() => fileInputRef.current?.click()}>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            className="hidden" 
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.html,.htm,.txt"
                        />
                        <FileIcon className="w-8 h-8 mx-auto text-[var(--primary)] mb-2" />
                        {file ? (
                            <p className="text-[var(--on-surface)] font-medium">{file.name}</p>
                        ) : (
                            <p className="text-[var(--on-surface-variant)]">
                                {initialData ? `الملف الحالي: ${initialData.fileName} (اضغط للتغيير)` : 'اضغط هنا لرفع ملف (PDF, Office, Images)'}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="isVisible" 
                            checked={formData.isVisible} 
                            onChange={e => setFormData({...formData, isVisible: e.target.checked})}
                            className="w-4 h-4 rounded text-[var(--primary)] focus:ring-[var(--primary)]"
                            disabled={isSaving}
                        />
                        <label htmlFor="isVisible" className="text-sm text-[var(--on-surface)]">متاح للمستخدمين العاديين</label>
                    </div>

                    {error && <p className="text-sm text-[var(--error)] bg-[var(--error-container)] p-2 rounded">{error}</p>}

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2 rounded-full text-[var(--primary)] hover:bg-[var(--primary-container)] font-medium" disabled={isSaving}>إلغاء</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-2 rounded-full bg-[var(--primary)] text-[var(--on-primary)] font-bold hover:bg-[var(--primary-hover)] shadow-md flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                            {isSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    جاري الحفظ...
                                </>
                            ) : (
                                <>
                                    <SaveIcon className="w-5 h-5"/>
                                    حفظ
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
            <style>{`
                .input-style {
                    padding: 0.6rem 1rem;
                    border: 1px solid var(--outline);
                    border-radius: 0.5rem;
                    background-color: var(--surface);
                    color: var(--on-surface);
                    transition: all 0.2s;
                }
                .input-style:focus {
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px var(--focus-ring);
                    outline: none;
                }
                @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default Legislations;
