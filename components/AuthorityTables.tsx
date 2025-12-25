
import React, { useState, useMemo, useEffect } from 'react';
import { subscriptionTables, pensionTables } from './data';
import { 
    TableIcon as DefaultTableIcon, 
    MoneyIcon, TruckIcon, BuildingIcon, UsersIcon, 
    ScrollIcon, ChartIcon, CarIcon, BriefcaseIcon, BankIcon, UndoIcon,
    EditIcon, SaveIcon, CancelIcon, DeleteIcon, ClipboardListIcon, CheckIcon
} from './Icons';
import { User } from '../types';
import { hasPermission } from '../permissions';
import { produce } from 'immer';

// --- Types ---
type View = 'main' | 'query' | 'modify' | 'query-subscriptions' | 'query-pensions' | 'modify-subscriptions' | 'modify-pensions';
interface EditingState {
    rowIndex: number | null; // index being edited, -1 for new row, null for none
    data: string[];
}

interface SortConfig {
    key: number;
    direction: 'asc' | 'desc' | null;
}

// --- Icon Mapping ---
const getTableIcon = (tableName: string) => {
    const lowerName = tableName.toLowerCase();
    const iconProps = { className: "h-5 w-5 text-[var(--tertiary)]" };
    if (lowerName.includes('النقل البري')) return <TruckIcon {...iconProps} />;
    if (lowerName.includes('المقاولات')) return <BuildingIcon {...iconProps} />;
    if (lowerName.includes('سيارة')) return <CarIcon {...iconProps} />;
    if (lowerName.includes('المهن')) return <BriefcaseIcon {...iconProps} />;
    if (lowerName.includes('العجز')) return <ChartIcon {...iconProps} />;
    if (lowerName.includes('رأسمالية') || lowerName.includes('التعويض الإضافي')) return <BankIcon {...iconProps} />;
    if (lowerName.includes('أصحاب الأعمال') || lowerName.includes('العمالة غير المنتظمة')) return <UsersIcon {...iconProps} />;
    if (lowerName.includes('اشتراك')) return <MoneyIcon {...iconProps} />;
    if (lowerName.includes('قانون')) return <ScrollIcon {...iconProps} />;
    return <DefaultTableIcon {...iconProps} />;
};

const getTableEmoji = (tableName: string): string => {
    const lowerName = tableName.toLowerCase();
    if (lowerName.includes('النقل البري')) return '🚚';
    if (lowerName.includes('المقاولات')) return '🏗️';
    if (lowerName.includes('سيارة')) return '🚗';
    if (lowerName.includes('المهن')) return '💼';
    if (lowerName.includes('العجز')) return '📊';
    if (lowerName.includes('رأسمالية') || lowerName.includes('التعويض الإضافي')) return '🏦';
    if (lowerName.includes('أصحاب الأعمال') || lowerName.includes('العمالة غير المنتظمة')) return '👥';
    if (lowerName.includes('اشتراك')) return '💰';
    if (lowerName.includes('قانون')) return '📜';
    return '📄'; 
};


// --- Custom Confirmation Dialog Component ---
const ConfirmationDialog: React.FC<{
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    children: React.ReactNode;
}> = ({ isOpen, onConfirm, onCancel, title, children }) => {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-fade-in-fast"
            aria-labelledby="modal-title"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-[28px] shadow-elevation-4 p-6 w-full max-w-md m-4 transform transition-all" role="document">
                <h3 id="modal-title" className="text-lg font-bold text-[var(--on-surface)] mb-4">{title}</h3>
                <div className="text-[var(--on-surface-variant)] mb-6">
                    {children}
                </div>
                <div className="flex justify-end gap-4">
                    <button 
                        onClick={onCancel}
                        className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-high)] focus:ring-[var(--primary)] transition"
                    >
                        إلغاء
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2 bg-[var(--error)] text-[var(--on-error)] font-semibold rounded-full hover:bg-[color-mix(in_srgb,_var(--on-error)_8%,_var(--error))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-high)] focus:ring-[var(--error)] transition"
                    >
                        تأكيد الحذف
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Sub-components ---
const Breadcrumbs: React.FC<{ path: string[], setView: (index: number) => void }> = ({ path, setView }) => {
    return (
        <nav className="text-sm font-medium text-[var(--on-surface-variant)] flex items-center" aria-label="Breadcrumb">
            {path.map((p, i) => (
                <React.Fragment key={p}>
                    {i > 0 && <span className="mx-2">/</span>}
                    <button onClick={() => setView(i)} className={`transition-colors ${i === path.length - 1 ? 'text-[var(--on-surface)] font-bold cursor-default' : 'text-[var(--on-surface-variant)] hover:text-[var(--primary)]'}`} disabled={i === path.length - 1}>
                        {p}
                    </button>
                </React.Fragment>
            ))}
        </nav>
    );
};

const MenuCard: React.FC<{ title: string, description: string, onClick: () => void }> = ({ title, description, onClick }) => (
    <div onClick={onClick} className="bg-[var(--surface-container)] p-6 rounded-3xl shadow-elevation-1 hover:shadow-elevation-2 hover:bg-[var(--surface-container-high)] transition-all duration-300 cursor-pointer border border-[var(--outline-variant)]">
        <h3 className="text-xl font-bold text-[var(--primary)] mb-2">{title}</h3>
        <p className="text-[var(--on-surface-variant)]">{description}</p>
    </div>
);

const AccessDenied: React.FC = () => (
    <div className="bg-[var(--error-container)] border border-[var(--error)]/30 rounded-3xl shadow-elevation-1 p-8 text-center animate-fade-in">
        <h2 className="text-2xl font-bold text-[var(--on-error-container)] mb-2">الوصول مرفوض</h2>
        <p className="text-[var(--on-error-container)]/80">ليس لديك الصلاحية اللازمة للقيام بهذا الإجراء. هذه الوظيفة متاحة لمدير النظام فقط.</p>
    </div>
);


const TableViewer: React.FC<{ 
    tables: any[]; 
    isEditable?: boolean; 
    setTables?: (updater: (prevTables: any[]) => any[]) => void;
    setLastDeletedRow: (deleted: { rowData: string[], rowIndex: number, tableName: string } | null) => void;
    onToggleVisibility?: (tableName: string) => void;
}> = ({ tables, isEditable = false, setTables, setLastDeletedRow, onToggleVisibility }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTable, setSelectedTable] = useState<any | null>(null);
    const [editingState, setEditingState] = useState<EditingState>({ rowIndex: null, data: [] });
    const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null);
    
    // Sorting and Filtering State
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: -1, direction: null });
    const [columnFilters, setColumnFilters] = useState<Record<number, string>>({});
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        setEditingState({ rowIndex: null, data: [] });
        setSortConfig({ key: -1, direction: null });
        setColumnFilters({});
    }, [selectedTable?.name]);

    useEffect(() => {
        if (selectedTable) {
            const currentTableName = selectedTable.name;
            const updatedTableInProp = tables.find(t => t.name === currentTableName);
            if (updatedTableInProp) {
                setSelectedTable(updatedTableInProp);
            } else {
                setSelectedTable(null);
            }
        }
    }, [tables]);
    
    const handleEditRow = (originalIndex: number) => {
        setLastDeletedRow(null);
        if (!selectedTable) return;
        
        // Find current data based on original Index
        const rowData = selectedTable.data[originalIndex];
        
        setEditingState({
            rowIndex: originalIndex,
            data: [...rowData]
        });
    };

    const handleCancelEdit = () => {
        setEditingState({ rowIndex: null, data: [] });
    };

    const handleSaveRow = () => {
        if (!setTables || !selectedTable || editingState.rowIndex === null) return;
        setLastDeletedRow(null);
    
        setTables(prevTables =>
            produce(prevTables, draft => {
                const tableIndex = draft.findIndex(t => t.name === selectedTable.name);
                if (tableIndex === -1) return;
    
                if (editingState.rowIndex === -1) { // New row
                    draft[tableIndex].data.push(editingState.data);
                } else { // Existing row
                    draft[tableIndex].data[editingState.rowIndex] = editingState.data;
                }
            })
        );
    
        handleCancelEdit();
    };

    const handleEditingDataChange = (value: string, cellIndex: number) => {
        setEditingState(prev => {
            const newData = [...prev.data];
            newData[cellIndex] = value;
            return { ...prev, data: newData };
        });
    };

    const handleDeleteRow = (originalIndex: number) => {
        if (!setTables || !selectedTable) return;
    
        const tableIndex = tables.findIndex(t => t.name === selectedTable.name);
        if (tableIndex === -1) return;
    
        const deletedRowData = [...tables[tableIndex].data[originalIndex]];
        setLastDeletedRow({
            rowData: deletedRowData,
            rowIndex: originalIndex,
            tableName: selectedTable.name,
        });
    
        if (editingState.rowIndex === originalIndex) {
            handleCancelEdit();
        }
    
        setTables(prevTables =>
            produce(prevTables, draft => {
                const tableIndex = draft.findIndex(t => t.name === selectedTable.name);
                if (tableIndex === -1) return;
                draft[tableIndex].data.splice(originalIndex, 1);
            })
        );
    };
    
    const requestDeleteConfirmation = (originalIndex: number) => {
        setDeleteTargetIndex(originalIndex);
    };

    const confirmDeletion = () => {
        if (deleteTargetIndex !== null) {
            handleDeleteRow(deleteTargetIndex);
        }
        setDeleteTargetIndex(null);
    };

    const cancelDeletion = () => {
        setDeleteTargetIndex(null);
    };

    const handleAddNewRow = () => {
        if (!selectedTable) return;
        if (editingState.rowIndex === -1) return; // Already adding
        setLastDeletedRow(null);
        setEditingState({
            rowIndex: -1,
            data: Array(selectedTable.headers.length).fill('')
        });
    };

    const handleSort = (columnIndex: number) => {
        let direction: 'asc' | 'desc' | null = 'asc';
        if (sortConfig.key === columnIndex && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig.key === columnIndex && sortConfig.direction === 'desc') {
            direction = null;
        }
        setSortConfig({ key: columnIndex, direction });
    };

    const handleFilterChange = (columnIndex: number, value: string) => {
        setColumnFilters(prev => ({
            ...prev,
            [columnIndex]: value
        }));
    };

    // --- Copy to Excel Function ---
    const copyTableToClipboard = () => {
        if (!selectedTable || processedData.length === 0) return;

        // Construct HTML Table for Excel clipboard support
        let htmlContent = `<table border="1" style="direction:rtl; text-align:center;"><thead><tr>`;
        selectedTable.headers.forEach((h: string) => {
            htmlContent += `<th style="background-color:#f0f0f0; font-weight:bold;">${h}</th>`;
        });
        htmlContent += `</tr></thead><tbody>`;

        processedData.forEach(({ row }) => {
            htmlContent += `<tr>`;
            row.forEach((cell: string) => {
                htmlContent += `<td>${cell}</td>`;
            });
            htmlContent += `</tr>`;
        });
        htmlContent += `</tbody></table>`;

        // Use Clipboard API
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([processedData.map(d => d.row.join('\t')).join('\n')], { type: 'text/plain' });
        
        const data = [new ClipboardItem({ 
            "text/html": blob,
            "text/plain": textBlob 
        })];

        navigator.clipboard.write(data).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback
            const tsv = [
                selectedTable.headers.join('\t'),
                ...processedData.map(d => d.row.join('\t'))
            ].join('\n');
            navigator.clipboard.writeText(tsv).then(() => {
                 setCopySuccess(true);
                 setTimeout(() => setCopySuccess(false), 2000);
            });
        });
    };

    // --- Derived Data with Filtering & Sorting ---
    const processedData = useMemo(() => {
        if (!selectedTable) return [];

        // 1. Map to include original index
        let data = selectedTable.data.map((row: string[], index: number) => ({ row, originalIndex: index }));

        // 2. Filter (Global Search Term) - Disabled if column filters are active to avoid confusion, or combined?
        // Let's keep table name search for selection, but column filter for data.
        // Actually, the search box above handles Table Selection search.
        
        // 3. Filter (Column Specific)
        Object.keys(columnFilters).forEach(key => {
            const colIndex = parseInt(key);
            const filterValue = columnFilters[colIndex].toLowerCase();
            if (filterValue) {
                data = data.filter((item: any) => 
                    String(item.row[colIndex]).toLowerCase().includes(filterValue)
                );
            }
        });

        // 4. Sort
        if (sortConfig.key !== -1 && sortConfig.direction) {
            data.sort((a: any, b: any) => {
                const valA = a.row[sortConfig.key];
                const valB = b.row[sortConfig.key];

                // Try numeric sort
                const numA = parseFloat(valA.replace(/,/g, ''));
                const numB = parseFloat(valB.replace(/,/g, ''));

                if (!isNaN(numA) && !isNaN(numB)) {
                    return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
                }

                // Fallback to string sort
                return sortConfig.direction === 'asc' 
                    ? String(valA).localeCompare(String(valB), 'ar') 
                    : String(valB).localeCompare(String(valA), 'ar');
            });
        }

        return data;
    }, [selectedTable, columnFilters, sortConfig]);


    const filteredTables = useMemo(() => 
        tables.filter(table => 
            (isEditable || table.isVisible !== false) && table.name.toLowerCase().includes(searchTerm.toLowerCase())
        ), [searchTerm, tables, isEditable]);
    
    const tablesForDropdown = useMemo(() => 
        isEditable ? tables : tables.filter(t => t.isVisible !== false), 
    [tables, isEditable]);
    
    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLastDeletedRow(null);
        const tableName = e.target.value;
        if (tableName) {
            const table = tables.find(t => t.name === tableName) || null;
            setSelectedTable(table);
            setSearchTerm(table?.name || '');
        } else {
            setSelectedTable(null);
            setSearchTerm('');
        }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        if (e.target.value === '') {
          setSelectedTable(null);
        }
    };

    const handleResultClick = (table: any) => {
        setLastDeletedRow(null);
        setSelectedTable(table);
        setSearchTerm(table.name);
    };
    
    const inputStyle = "w-full p-2.5 rounded-xl text-right transition-all duration-300 bg-[var(--surface-container-high)] text-[var(--on-surface)] caret-[var(--primary)] border border-[var(--outline)] shadow-sm placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:bg-[var(--surface-container-high)] focus:border-[var(--primary)] focus:shadow-md focus:ring-2 focus:ring-[var(--focus-ring)]";
    const tableInputStyle = "w-full p-2 rounded-md transition-all duration-200 bg-[var(--surface-container-highest)] text-[var(--on-surface)] border border-[var(--outline)] focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)] text-center";

    return (
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-2">اختر جدولاً لعرضه من القائمة أو ابحث بالاسم:</label>
                <div className="flex flex-col sm:flex-row gap-4">
                    <input type="text" id="table-search" value={searchTerm} onChange={handleSearchChange} placeholder="ابحث هنا..." className={`${inputStyle} flex-grow`} />
                    <select value={selectedTable?.name || ''} onChange={handleSelectChange} className={`${inputStyle} sm:w-80`} aria-label="اختر جدولاً">
                        <option value="">-- اختر من القائمة --</option>
                        {tablesForDropdown.map(table => <option key={table.name} value={table.name}>{`${getTableEmoji(table.name)} ${table.name}`}</option>)}
                    </select>
                </div>
            </div>

            {searchTerm && !selectedTable && filteredTables.length > 0 && (
                 <div className="border rounded-2xl bg-[var(--surface-container-high)] border-[var(--outline-variant)] max-h-60 overflow-y-auto shadow-elevation-2">
                    {filteredTables.map(table => (
                        <div key={table.name} onClick={() => handleResultClick(table)} className="p-3 cursor-pointer hover:bg-[var(--surface-container-highest)] border-b border-[var(--outline-variant)] last:border-b-0 text-right flex justify-end items-center gap-2 text-[var(--on-surface)]">
                           <span>{table.name}</span>
                           {getTableIcon(table.name)}
                        </div>
                    ))}
                 </div>
            )}
            
            {selectedTable && (
                <div className="mt-6 animate-fade-in">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <h4 className="text-lg font-semibold text-[var(--on-surface)] flex items-center gap-2">
                            <span>{selectedTable.name}</span>
                            {getTableIcon(selectedTable.name)}
                        </h4>
                        
                        <div className="flex items-center gap-2">
                            <button
                                onClick={copyTableToClipboard}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--secondary-container)] text-[var(--on-secondary-container)] text-sm font-semibold rounded-full hover:shadow-md transition-all active:scale-95"
                            >
                                {copySuccess ? <CheckIcon className="w-4 h-4"/> : <ClipboardListIcon className="w-4 h-4"/>}
                                {copySuccess ? 'تم النسخ' : 'نسخ إلى Excel'}
                            </button>
                        </div>
                    </div>

                    {isEditable && onToggleVisibility && (
                        <div className="flex items-center justify-between gap-4 mb-4 p-3 bg-[var(--surface-container)] rounded-2xl border border-[var(--outline-variant)]">
                            <label htmlFor="visibility-toggle" className="text-sm font-medium text-[var(--on-surface-variant)] cursor-pointer">
                                إظهار الجدول في صفحة الاستعلام
                            </label>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    id="visibility-toggle"
                                    checked={selectedTable.isVisible !== false} // Default to true if undefined
                                    onChange={() => onToggleVisibility(selectedTable.name)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-[var(--surface-variant)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--primary)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--outline)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                            </label>
                        </div>
                    )}

                    {selectedTable.notes && Array.isArray(selectedTable.notes) && selectedTable.notes.length > 0 && (
                        <div className="mb-4 p-4 bg-[var(--secondary-container)] rounded-2xl text-sm text-[var(--on-secondary-container)] space-y-2">
                            {selectedTable.notes.map((note: string, index: number) => (
                                <p key={index}>
                                    <span className="font-bold">ملحوظة {index + 1}: </span>
                                    {note}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="overflow-x-auto bg-[var(--surface)] rounded-2xl border border-[var(--outline-variant)] shadow-md">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-[var(--surface-container)]">
                                {/* Header Row with Sort Icons */}
                                <tr>
                                    {selectedTable.headers.map((header: string, index: number) => (
                                        <th 
                                            key={header} 
                                            className="p-4 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider text-center border-b border-[var(--outline-variant)] cursor-pointer hover:bg-[var(--surface-container-high)] select-none"
                                            onClick={() => handleSort(index)}
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                {header}
                                                <span className="text-[var(--primary)] text-[10px]">
                                                    {sortConfig.key === index ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
                                                </span>
                                            </div>
                                        </th>
                                    ))}
                                    {isEditable && <th className="p-4 font-semibold text-xs text-[var(--on-surface-variant)] uppercase tracking-wider text-center border-b border-[var(--outline-variant)] w-32">إجراء</th>}
                                </tr>
                                {/* Filter Row */}
                                <tr>
                                    {selectedTable.headers.map((_: string, index: number) => (
                                        <th key={`filter-${index}`} className="p-1 border-b-2 border-[var(--outline-variant)]">
                                            <input 
                                                type="text" 
                                                placeholder="بحث..." 
                                                value={columnFilters[index] || ''}
                                                onChange={(e) => handleFilterChange(index, e.target.value)}
                                                className="w-full text-center text-xs p-1 rounded border border-[var(--outline)] bg-[var(--surface)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
                                            />
                                        </th>
                                    ))}
                                    {isEditable && <th className="border-b-2 border-[var(--outline-variant)]"></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {processedData.map((item: any) => {
                                    const { row, originalIndex } = item;
                                    const isEditing = isEditable && editingState.rowIndex === originalIndex;

                                    return (
                                        <tr key={originalIndex} className={`transition-colors duration-200 hover:bg-[var(--surface-container-high)] ${isEditing ? 'bg-[var(--primary-container)]' : ''}`}>
                                            {row.map((cell: string, cellIndex: number) => (
                                              <td key={cellIndex} className="p-1 align-middle text-[var(--on-surface-variant)] border-b border-[var(--outline-variant)] text-center">
                                                {isEditing ? (
                                                  <input type="text" value={editingState.data[cellIndex] ?? ''} onChange={(e) => handleEditingDataChange(e.target.value, cellIndex)} className={tableInputStyle} />
                                                ) : (
                                                  <div className="px-4 py-3">{cell}</div>
                                                )}
                                              </td>
                                            ))}
                                            {isEditable && (
                                                <td className="p-2 align-middle text-center border-b border-[var(--outline-variant)]">
                                                    <div className="flex justify-center items-center gap-2">
                                                    {isEditing ? (
                                                        <>
                                                            <button onClick={handleSaveRow} className="text-[var(--primary)] p-1 hover:bg-[var(--primary-container)] rounded-full transition-all hover:scale-110" title="حفظ"><SaveIcon /></button>
                                                            <button onClick={handleCancelEdit} className="text-[var(--on-surface-variant)] p-1 hover:bg-[var(--surface-container)] rounded-full transition-all hover:scale-110" title="إلغاء"><CancelIcon /></button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => handleEditRow(originalIndex)} className="text-[var(--tertiary)] p-1 hover:bg-[var(--tertiary-container)] rounded-full transition-all hover:scale-110" title="تعديل"><EditIcon /></button>
                                                            <button onClick={() => requestDeleteConfirmation(originalIndex)} className="text-[var(--error)] p-1 hover:bg-[var(--error-container)] rounded-full transition-all hover:scale-110" title="حذف"><DeleteIcon /></button>
                                                        </>
                                                    )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}

                                {isEditable && selectedTable && editingState.rowIndex === -1 && (
                                    <tr className="transition-colors duration-200 bg-[var(--primary-container)]">
                                        {editingState.data.map((cell, cellIndex) => (
                                            <td key={cellIndex} className="p-1 align-middle border-b border-[var(--outline-variant)] text-center">
                                                <input type="text" value={cell} onChange={(e) => handleEditingDataChange(e.target.value, cellIndex)} className={tableInputStyle} />
                                            </td>
                                        ))}
                                        <td className="p-2 align-middle text-center border-b border-[var(--outline-variant)]">
                                            <div className="flex justify-center items-center gap-2">
                                                <button onClick={handleSaveRow} className="text-[var(--primary)] p-1 hover:bg-[var(--primary-container)] rounded-full transition-all hover:scale-110" title="حفظ"><SaveIcon /></button>
                                                <button onClick={handleCancelEdit} className="text-[var(--on-surface-variant)] p-1 hover:bg-[var(--surface-container)] rounded-full transition-all hover:scale-110" title="إلغاء"><CancelIcon /></button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                     {isEditable && selectedTable && (
                        <div className="mt-4 text-right">
                            <button onClick={handleAddNewRow} disabled={editingState.rowIndex === -1} className="px-6 py-2 bg-[var(--primary)] text-[var(--on-primary)] text-sm font-semibold rounded-full hover:bg-[color-mix(in_srgb,_var(--on-primary)_8%,_var(--primary))] shadow-elevation-1 hover:shadow-elevation-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                + إضافة صف جديد
                            </button>
                        </div>
                    )}
                </div>
            )}
            
            <ConfirmationDialog
                isOpen={deleteTargetIndex !== null}
                onConfirm={confirmDeletion}
                onCancel={cancelDeletion}
                title="تأكيد الحذف"
            >
                <p>هل أنت متأكد من رغبتك في حذف هذا الصف؟</p>
            </ConfirmationDialog>
        </div>
    );
};


// --- Main Component ---
interface AuthorityTablesProps {
  currentUser: User;
}

const AuthorityTables: React.FC<AuthorityTablesProps> = ({ currentUser }) => {
    const [viewStack, setViewStack] = useState<View[]>(['main']);
    const [tablesData, setTablesData] = useState(() => {
        try {
            const ensureVisibility = (table: any) => ({
                ...table,
                // If isVisible is explicitly false, keep it. Otherwise default to true.
                isVisible: table.isVisible !== false 
            });

            const savedSubscriptions = localStorage.getItem('authorityTables_subscriptions');
            const savedPensions = localStorage.getItem('authorityTables_pensions');

            // Map over the default data to add isVisible if it's missing, then merge with saved data
            const defaultSubscriptionsWithVisibility = subscriptionTables.map(ensureVisibility);
            const defaultPensionsWithVisibility = pensionTables.map(ensureVisibility);

            const subscriptions = savedSubscriptions 
                ? JSON.parse(savedSubscriptions).map(ensureVisibility) 
                : defaultSubscriptionsWithVisibility;
            const pensions = savedPensions 
                ? JSON.parse(savedPensions).map(ensureVisibility) 
                : defaultPensionsWithVisibility;

            return { subscriptions, pensions };
        } catch (error) {
            console.error("Failed to load tables from localStorage", error);
            // Fallback ensures isVisible is present
            return {
                subscriptions: subscriptionTables.map(t => ({...t, isVisible: t.isVisible !== false })),
                pensions: pensionTables.map(t => ({...t, isVisible: t.isVisible !== false }))
            };
        }
    });
    
    useEffect(() => {
        try {
            localStorage.setItem('authorityTables_subscriptions', JSON.stringify(tablesData.subscriptions));
            localStorage.setItem('authorityTables_pensions', JSON.stringify(tablesData.pensions));
        } catch (error) {
            console.error("Failed to save tables to localStorage", error);
        }
    }, [tablesData]);

    const [lastDeletedRow, setLastDeletedRow] = useState<{ rowData: string[], rowIndex: number, tableName: string } | null>(null);
    
    const currentView = viewStack[viewStack.length - 1];
    const canModify = hasPermission(currentUser, 'tables', 'modify');

    const navigateTo = (view: View) => {
        setViewStack(prev => [...prev, view]);
    };
    
    const navigateBack = (index: number) => {
        setLastDeletedRow(null);
        setViewStack(prev => prev.slice(0, index + 1));
    };

    const breadcrumbPath = useMemo(() => {
        const pathMap: { [key in View]: string } = { 'main': 'جداول الهيئة', 'query': 'وظائف الاستعلام', 'modify': 'وظائف التعديل', 'query-subscriptions': 'جداول الاشتراكات', 'query-pensions': 'جداول المعاشات', 'modify-subscriptions': 'تعديل جداول الاشتراكات', 'modify-pensions': 'تعديل جداول المعاشات' };
        return viewStack.map(v => pathMap[v]);
    }, [viewStack]);

    const handleSetTables = (updater: (prev: any[]) => any[], tableType: 'subscriptions' | 'pensions') => {
        setTablesData(prev => ({ ...prev, [tableType]: updater(prev[tableType]) }));
    };

    const handleToggleTableVisibility = (tableName: string, tableType: 'subscriptions' | 'pensions') => {
        setTablesData(prev => {
            const newTablesData = JSON.parse(JSON.stringify(prev));
            const tableSet = newTablesData[tableType];
            const table = tableSet.find((t: any) => t.name === tableName);
            if (table) {
                // Ensure isVisible is a boolean before toggling
                table.isVisible = !(table.isVisible === true); 
            }
            return newTablesData;
        });
        setLastDeletedRow(null);
    };

    const handleUndoDelete = () => {
        if (!lastDeletedRow) return;
    
        const { tableName, rowIndex, rowData } = lastDeletedRow;
    
        setTablesData(prevTablesData =>
            produce(prevTablesData, draft => {
                const tableTypeToUpdate = draft.subscriptions.some((t: any) => t.name === tableName)
                    ? 'subscriptions'
                    : 'pensions';
                const tableSet = draft[tableTypeToUpdate as 'subscriptions' | 'pensions'];
                const tableIndex = tableSet.findIndex((t: any) => t.name === tableName);
    
                if (tableIndex !== -1) {
                    tableSet[tableIndex].data.splice(rowIndex, 0, rowData);
                }
            })
        );
    
        setLastDeletedRow(null);
    };

    const UndoToast: React.FC<{ onUndo: () => void; onDismiss: () => void }> = ({ onUndo, onDismiss }) => {
        useEffect(() => {
            const timer = setTimeout(onDismiss, 5000);
            return () => clearTimeout(timer);
        }, [onDismiss]);

        return (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[var(--surface-container-highest)] text-[var(--on-surface)] px-6 py-3 rounded-xl shadow-elevation-3 flex items-center justify-between gap-4 animate-slide-up-fast border border-[var(--outline-variant)]">
                <span className="font-medium">تم حذف الصف.</span>
                <div className="flex items-center gap-2">
                    <button onClick={onUndo} className="font-bold text-[var(--primary)] hover:text-[color-mix(in_srgb,_black_20%,_var(--primary))] transition-colors flex items-center gap-1">
                        <UndoIcon className="h-4 w-4" />
                        تراجع
                    </button>
                    <div className="w-px h-4 bg-[var(--outline)]"></div>
                    <button onClick={onDismiss} className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors">
                        <CancelIcon />
                    </button>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (currentView.startsWith('modify') && !canModify) {
            return <AccessDenied />;
        }

        switch (currentView) {
            case 'main':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                        <MenuCard title="وظائف الاستعلام" description="عرض واستعلام عن جداول الهيئة المختلفة بدون تعديل." onClick={() => navigateTo('query')} />
                         <div title={!canModify ? 'هذه الوظيفة متاحة لمن يملك صلاحية التعديل فقط' : ''} className={!canModify ? 'opacity-60 cursor-not-allowed' : ''}>
                            <MenuCard title="وظائف التعديل" description="تعديل وإضافة وحذف بيانات جداول الهيئة." onClick={canModify ? () => navigateTo('modify') : () => {}} />
                        </div>
                    </div>
                );
            case 'query':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                        <MenuCard title="جداول الاشتراكات" description="استعلام عن جداول اشتراكات العمالة النمطية والغير منتظمة." onClick={() => navigateTo('query-subscriptions')} />
                        <MenuCard title="جداول المعاشات" description="استعلام عن جداول القيمة الرأسمالية ومعدلات التضخم." onClick={() => navigateTo('query-pensions')} />
                    </div>
                );
            case 'modify':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                        <MenuCard title="تعديل جداول الاشتراكات" description="تعديل قيم أجور وفئات الاشتراكات المختلفة." onClick={() => navigateTo('modify-subscriptions')} />
                        <MenuCard title="تعديل جداول المعاشات" description="تعديل قيم معدلات التضخم والعائد وغيرها." onClick={() => navigateTo('modify-pensions')} />
                    </div>
                );
            case 'query-subscriptions':
                return <TableViewer tables={tablesData.subscriptions} setLastDeletedRow={setLastDeletedRow} />;
            case 'query-pensions':
                return <TableViewer tables={tablesData.pensions} setLastDeletedRow={setLastDeletedRow} />;
            case 'modify-subscriptions':
                return <TableViewer tables={tablesData.subscriptions} isEditable setTables={(updater) => handleSetTables(updater, 'subscriptions')} setLastDeletedRow={setLastDeletedRow} onToggleVisibility={(tableName) => handleToggleTableVisibility(tableName, 'subscriptions')} />;
            case 'modify-pensions':
                return <TableViewer tables={tablesData.pensions} isEditable setTables={(updater) => handleSetTables(updater, 'pensions')} setLastDeletedRow={setLastDeletedRow} onToggleVisibility={(tableName) => handleToggleTableVisibility(tableName, 'pensions')} />;
            default:
                return <p>عرض غير معروف.</p>;
        }
    };
    
    return (
        <div className="bg-[var(--surface-container-low)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-1 p-6 sm:p-8 space-y-6 transition-colors duration-300">
            <Breadcrumbs path={breadcrumbPath} setView={navigateBack} />
            <div>
                {renderContent()}
            </div>
            {lastDeletedRow && (
                <UndoToast onUndo={handleUndoDelete} onDismiss={() => setLastDeletedRow(null)} />
            )}
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
    
                 @keyframes fade-in-fast {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in-fast { animation: fade-in-fast 0.2s ease-out forwards; }
                
                @keyframes slide-up-fast {
                    from { opacity: 0; transform: translate(-50%, 20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                .animate-slide-up-fast { animation: slide-up-fast 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default AuthorityTables;
