import React, { useState, useEffect } from 'react';
import { User, PermissionNode, PermissionAction, UserPermissions, UserRestrictions, PasswordPolicy, Role } from '../types';
import { APP_STRUCTURE, AppStructureNode, hasPermission } from '../permissions';
import { ROLES, initialRolePermissions, generateFullPermissions } from '../roles';
import { produce } from 'immer';
import { UserGroupIcon, EditIcon, DeleteIcon, PlusIcon, ChevronDownIcon } from './Icons';
import PasswordInput from './PasswordInput';


// --- Helper Components & Icons ---
const defaultPermissions: UserPermissions = {};
const defaultRestrictions: UserRestrictions = {
    lockoutAction: 'disable_temporarily',
    lockoutMessage: 'تم قفل الحساب مؤقتاً لكثرة المحاولات الخاطئة. حاول مرة أخرى لاحقاً.'
};
const defaultPasswordPolicy: PasswordPolicy = { minLength: 8 };

const emptyUser: Omit<User, 'id'> = {
  name: '',
  username: '',
  password: '',
  status: 'نشط',
  role: 'مخصص',
  permissions: defaultPermissions,
  restrictions: defaultRestrictions,
  passwordPolicy: defaultPasswordPolicy
};

// --- New Granular Permissions Component ---
const PermissionTree: React.FC<{
    nodes: AppStructureNode[];
    permissions: UserPermissions;
    onPermissionChange: (newPermissions: UserPermissions) => void;
    level?: number;
    disabled: boolean;
}> = ({ nodes, permissions, onPermissionChange, level = 0, disabled }) => {

    const toggleNodeAndChildren = (perms: UserPermissions, node: AppStructureNode, action: PermissionAction, value: boolean) => {
        return produce(perms, draft => {
            const setPermsRecursive = (currentNode: AppStructureNode, currentDraft: any) => {
                if (!currentDraft[currentNode.id]) {
                    currentDraft[currentNode.id] = {};
                }
                currentDraft[currentNode.id][action] = value;
                if(value && action !== 'read') { // If granting modify, also grant read
                    currentDraft[currentNode.id]['read'] = true;
                }
                if (!value && action === 'read') { // If revoking read, revoke all others
                    currentDraft[currentNode.id]['add'] = false;
                    currentDraft[currentNode.id]['modify'] = false;
                    currentDraft[currentNode.id]['delete'] = false;
                }
                if (currentNode.children) {
                    if (!currentDraft[currentNode.id].children) {
                        currentDraft[currentNode.id].children = {};
                    }
                    currentNode.children.forEach(child => {
                        setPermsRecursive(child, currentDraft[currentNode.id].children);
                    });
                }
            };
            setPermsRecursive(node, draft);
        });
    };
    
    const handleCheckboxChange = (node: AppStructureNode, action: PermissionAction, checked: boolean) => {
        const newPermissions = toggleNodeAndChildren(permissions, node, action, checked);
        onPermissionChange(newPermissions);
    };

    return (
        <div className="space-y-2">
            {nodes.map(node => (
                <div key={node.id} style={{ paddingRight: `${level * 24}px` }}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 bg-[var(--surface-container)] rounded-lg gap-2">
                        <span className="font-semibold text-sm text-[var(--on-surface)]">{node.label}</span>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            {(['read', 'add', 'modify', 'delete'] as PermissionAction[]).map(action => (
                                <label key={action} className="flex items-center gap-1 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--outline)] bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                        checked={!!permissions[node.id]?.[action]}
                                        onChange={(e) => handleCheckboxChange(node, action, e.target.checked)}
                                        disabled={disabled}
                                    />
                                    <span>{{read: 'قراءة', add: 'إضافة', modify: 'تعديل', delete: 'حذف'}[action]}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    {node.children && permissions[node.id]?.read && (
                        <div className="mt-2">
                           <PermissionTree 
                                nodes={node.children}
                                permissions={permissions[node.id]?.children || {}}
                                onPermissionChange={(childPerms) => {
                                    const newPermissions = produce(permissions, draft => {
                                        if(!draft[node.id]) draft[node.id] = {};
                                        draft[node.id].children = childPerms;
                                    });
                                    onPermissionChange(newPermissions);
                                }}
                                level={level + 1}
                                disabled={disabled}
                           />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// --- User Form Modal ---
const UserFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (user: Omit<User, 'id'> & { id?: number }) => void;
    user: User | null;
    currentUser: User;
    canModify: boolean;
    rolePermissions: Record<string, UserPermissions>;
}> = ({ isOpen, onClose, onSave, user, currentUser, canModify, rolePermissions }) => {
    const [formData, setFormData] = useState<Omit<User, 'id'>>({ ...emptyUser });
    const [activeTab, setActiveTab] = useState<'basic' | 'permissions' | 'restrictions'>('basic');
    const [selectedRole, setSelectedRole] = useState<Role>('مخصص');

    const deepEqual = (obj1: any, obj2: any): boolean => {
        if (obj1 === obj2) return true;
        if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
            return false;
        }
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) return false;
        for (const key of keys1) {
            if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
                return false;
            }
        }
        return true;
    }

    useEffect(() => {
        if (isOpen) {
            const initialData = user ? { ...user } : { ...emptyUser };
            // Ensure nested objects exist to avoid errors
            initialData.permissions = initialData.permissions || {};
            initialData.restrictions = { ...defaultRestrictions, ...(initialData.restrictions || {}) };
            initialData.passwordPolicy = initialData.passwordPolicy || { minLength: 8 };
            if (!user) initialData.password = ''; // Clear password for new user form
            
            const fullUserPerms = generateFullPermissions(initialData.permissions);
            let matchedRole: Role = 'مخصص';
            for (const roleName in rolePermissions) {
                if (deepEqual(fullUserPerms, rolePermissions[roleName])) {
                    matchedRole = roleName as Role;
                    break;
                }
            }
            
            setSelectedRole(matchedRole);
            setFormData({ ...initialData, role: matchedRole } as Omit<User, 'id'>);
            setActiveTab('basic'); // Reset to first tab
        }
    }, [isOpen, user, rolePermissions]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        if (name.startsWith('restrictions.')) {
             const key = name.split('.')[1] as keyof UserRestrictions;
             setFormData(produce(draft => {
                (draft.restrictions[key] as any) = type === 'number' ? (value ? parseInt(value, 10) : undefined) : value;
             }));
        } else if (name.startsWith('passwordPolicy.')) {
            const key = name.split('.')[1] as keyof PasswordPolicy;
            const isCheckbox = type === 'checkbox';
            setFormData(produce(draft => {
                 if (!draft.passwordPolicy) draft.passwordPolicy = {};
                (draft.passwordPolicy[key] as any) = isCheckbox ? (e.target as HTMLInputElement).checked : (value ? parseInt(value) : undefined);
            }));
        }
        else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleStatusToggle = () => {
        setFormData(prev => ({ ...prev, status: prev.status === 'نشط' ? 'غير نشط' : 'نشط' }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...formData, id: user?.id, role: selectedRole });
    };

    const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newRole = e.target.value as Role;
        setSelectedRole(newRole);
        if (newRole !== 'مخصص') {
            setFormData(produce(draft => {
                draft.permissions = rolePermissions[newRole];
                draft.role = newRole;
            }));
        } else {
             setFormData(produce(draft => {
                draft.role = 'مخصص';
            }));
        }
    };

    const isEditingSelf = user?.id === currentUser.id;
    
    const TabButton: React.FC<{label: string, id: typeof activeTab}> = ({label, id}) => (
        <button
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${activeTab === id ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container)]'}`}
        >
            {label}
        </button>
    )

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-5 w-full max-w-6xl m-4 flex flex-col max-h-[90vh] animate-modal-content-show" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="flex flex-col flex-grow min-h-0">
                    <div className="p-4 border-b border-[var(--outline-variant)]">
                        <h3 className="text-xl font-bold text-[var(--on-surface)] mb-3">
                            {user ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}
                        </h3>
                        <div className="flex items-center gap-2 p-1 bg-[var(--surface-container-low)] rounded-full w-fit">
                           <TabButton label="1. البيانات الأساسية" id="basic" />
                           <TabButton label="2. الصلاحيات الممنوحة" id="permissions" />
                           <TabButton label="3. قيود المستخدم" id="restrictions" />
                        </div>
                    </div>
                    
                    <div className="p-6 overflow-y-auto space-y-6 flex-grow min-h-0">
                        {/* Basic Data Tab */}
                        <div hidden={activeTab !== 'basic'} className="space-y-6 animate-fade-in-fast">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="name" className="form-label">الاسم الكامل</label>
                                    <input id="name" name="name" type="text" value={formData.name} onChange={handleChange} className="input-style" required disabled={!canModify} />
                                </div>
                                <div>
                                    <label htmlFor="username" className="form-label">اسم المستخدم</label>
                                    <input id="username" name="username" type="text" value={formData.username} onChange={handleChange} className="input-style" required disabled={!canModify} />
                                </div>
                            </div>
                             <div>
                                <label htmlFor="role" className="form-label">الدور الوظيفي</label>
                                <select id="role" name="role" value={selectedRole} onChange={handleRoleChange} className="input-style" disabled={!canModify}>
                                    <option value="مخصص">مخصص</option>
                                    {Object.keys(rolePermissions).map(roleName => <option key={roleName} value={roleName}>{roleName}</option>)}
                                </select>
                                <p className="text-xs text-[var(--on-surface-variant)] mt-1">
                                    {selectedRole === 'مخصص' 
                                        ? 'تم تعديل الصلاحيات يدوياً. سيتم حفظها كدور مخصص.' 
                                        : 'سيتم تطبيق مجموعة الصلاحيات المحددة مسبقاً لهذا الدور.'}
                                </p>
                            </div>
                            <div>
                                <label htmlFor="password">{user ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</label>
                                <PasswordInput id="password" name="password" value={formData.password || ''} onChange={handleChange} className="input-style" placeholder={user ? 'اتركه فارغاً للحفاظ على القديمة' : ''} required={!user} disabled={!canModify}/>
                            </div>
                            <div>
                                <label className="form-label">الحالة</label>
                                <div className="flex items-center gap-4">
                                    <span className={`text-sm font-medium ${formData.status === 'غير نشط' ? 'text-[var(--on-surface-variant)]' : 'text-[var(--primary)]'}`}>غير نشط</span>
                                    <label className={`relative inline-flex items-center ${isEditingSelf || !canModify ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                        <input type="checkbox" className="sr-only peer" checked={formData.status === 'نشط'} onChange={handleStatusToggle} disabled={isEditingSelf || !canModify}/>
                                        <div className="w-11 h-6 bg-[var(--surface-variant)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--primary)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--outline)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                                    </label>
                                    <span className={`text-sm font-medium ${formData.status === 'نشط' ? 'text-[var(--primary)]' : 'text-[var(--on-surface-variant)]'}`}>نشط</span>
                                </div>
                                {isEditingSelf && <p className="text-xs text-[var(--on-surface-variant)] mt-1">لا يمكنك تعطيل حسابك الخاص.</p>}
                            </div>
                        </div>

                        {/* Permissions Tab */}
                        <div hidden={activeTab !== 'permissions'} className="space-y-4 animate-fade-in-fast">
                             <PermissionTree 
                                nodes={APP_STRUCTURE} 
                                permissions={formData.permissions} 
                                onPermissionChange={(p) => {
                                    setFormData(produce(draft => {
                                        draft.permissions = p;
                                        draft.role = 'مخصص';
                                    }));
                                    setSelectedRole('مخصص');
                                }} 
                                disabled={!canModify}
                            />
                        </div>

                        {/* Restrictions Tab */}
                        <div hidden={activeTab !== 'restrictions'} className="space-y-6 animate-fade-in-fast">
                            <div className="p-4 bg-[var(--surface-container)] rounded-2xl">
                                <h4 className="font-semibold text-[var(--on-surface)] mb-3">صلاحية الحساب وكلمة المرور</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div>
                                        <label htmlFor="passwordExpiresDays" className="form-label">انتهاء صلاحية كلمة المرور (أيام)</label>
                                        <input id="passwordExpiresDays" name="restrictions.passwordExpiresDays" type="number" min="0" value={formData.restrictions.passwordExpiresDays || ''} onChange={handleChange} className="input-style" placeholder="0 لتعطيل" disabled={!canModify}/>
                                    </div>
                                    <div>
                                        <label htmlFor="accountExpiresOn" className="form-label">انتهاء صلاحية الحساب (تاريخ)</label>
                                        <input id="accountExpiresOn" name="restrictions.accountExpiresOn" type="date" value={formData.restrictions.accountExpiresOn || ''} onChange={handleChange} className="input-style" disabled={!canModify}/>
                                    </div>
                                </div>
                            </div>
                             <div className="p-4 bg-[var(--surface-container)] rounded-2xl">
                                <h4 className="font-semibold text-[var(--on-surface)] mb-3">سياسة قفل الحساب عند الخطأ</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label htmlFor="lockoutThreshold" className="form-label">القفل بعد محاولات فاشلة</label>
                                        <input id="lockoutThreshold" name="restrictions.lockoutThreshold" type="number" min="0" value={formData.restrictions.lockoutThreshold || ''} onChange={handleChange} className="input-style" placeholder="0 لتعطيل" disabled={!canModify}/>
                                    </div>
                                    <div>
                                        <label htmlFor="lockoutAction" className="form-label">الإجراء المتخذ</label>
                                        <select id="lockoutAction" name="restrictions.lockoutAction" value={formData.restrictions.lockoutAction || ''} onChange={handleChange} className="input-style" disabled={!canModify}>
                                            <option value="disable_temporarily">تعطيل مؤقت للحساب</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="lockoutDurationMinutes" className="form-label">مدة التعطيل (بالدقائق)</label>
                                        <input id="lockoutDurationMinutes" name="restrictions.lockoutDurationMinutes" type="number" min="0" value={formData.restrictions.lockoutDurationMinutes || ''} onChange={handleChange} className="input-style" placeholder="مثال: 15" disabled={!canModify}/>
                                    </div>
                                    <div className="lg:col-span-3">
                                        <label htmlFor="lockoutMessage" className="form-label">الرسالة التي تظهر للمستخدم عند القفل</label>
                                        <textarea id="lockoutMessage" name="restrictions.lockoutMessage" value={formData.restrictions.lockoutMessage || ''} onChange={handleChange} className="input-style" rows={2} disabled={!canModify}></textarea>
                                    </div>
                                </div>
                            </div>
                             <div className="p-4 bg-[var(--surface-container)] rounded-2xl">
                                <h4 className="font-semibold text-[var(--on-surface)] mb-3">قيود تسجيل الدخول والخمول</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="idleTimeoutMinutes" className="form-label">تسجيل الخروج بعد الخمول (دقائق)</label>
                                        <input id="idleTimeoutMinutes" name="restrictions.idleTimeoutMinutes" type="number" min="0" value={formData.restrictions.idleTimeoutMinutes || ''} onChange={handleChange} className="input-style" placeholder="0 لتعطيل" disabled={!canModify}/>
                                    </div>
                                     <div>
                                        <label htmlFor="deactivateAfterInactiveDays" className="form-label">تعطيل الحساب بعد عدم النشاط (أيام)</label>
                                        <input id="deactivateAfterInactiveDays" name="restrictions.deactivateAfterInactiveDays" type="number" min="0" value={formData.restrictions.deactivateAfterInactiveDays || ''} onChange={handleChange} className="input-style" placeholder="0 لتعطيل" disabled={!canModify}/>
                                    </div>
                                     <div>
                                        <label htmlFor="maxLogins" className="form-label">تحديد عدد مرات فتح البرنامج</label>
                                        <input id="maxLogins" name="restrictions.maxLogins" type="number" min="0" value={formData.restrictions.maxLogins || ''} onChange={handleChange} className="input-style" placeholder="0 لتعطيل" disabled={!canModify}/>
                                    </div>
                                </div>
                            </div>
                             <div className="p-4 bg-[var(--surface-container)] rounded-2xl">
                                <h4 className="font-semibold text-[var(--on-surface)] mb-3">سياسة تعقيد كلمة المرور</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                     <div>
                                        <label htmlFor="minLength" className="form-label">أقل طول</label>
                                        <input id="minLength" name="passwordPolicy.minLength" type="number" min="1" value={formData.passwordPolicy?.minLength || ''} onChange={handleChange} className="input-style" disabled={!canModify}/>
                                    </div>
                                    <label className="flex items-center gap-2 pt-6"><input type="checkbox" name="passwordPolicy.requireUppercase" checked={!!formData.passwordPolicy?.requireUppercase} onChange={handleChange} className="checkbox-style" disabled={!canModify}/> حروف كبيرة</label>
                                    <label className="flex items-center gap-2 pt-6"><input type="checkbox" name="passwordPolicy.requireLowercase" checked={!!formData.passwordPolicy?.requireLowercase} onChange={handleChange} className="checkbox-style" disabled={!canModify}/> حروف صغيرة</label>
                                    <label className="flex items-center gap-2"><input type="checkbox" name="passwordPolicy.requireNumbers" checked={!!formData.passwordPolicy?.requireNumbers} onChange={handleChange} className="checkbox-style" disabled={!canModify}/> أرقام</label>
                                    <label className="flex items-center gap-2"><input type="checkbox" name="passwordPolicy.requireSymbols" checked={!!formData.passwordPolicy?.requireSymbols} onChange={handleChange} className="checkbox-style" disabled={!canModify}/> رموز خاصة</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-[var(--surface-container)] rounded-b-3xl flex justify-end gap-4 border-t border-[var(--outline-variant)]">
                        <button type="button" onClick={onClose} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] transition">إلغاء</button>
                        <button type="submit" disabled={!canModify} className="px-6 py-2 bg-[var(--primary)] text-[var(--on-primary)] font-semibold rounded-full hover:bg-[color-mix(in_srgb,_var(--on-primary)_8%,_var(--primary))] transition disabled:opacity-50 disabled:cursor-not-allowed">حفظ التغييرات</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Confirmation Dialog ---
const ConfirmationDialog: React.FC<{
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    children: React.ReactNode;
}> = ({ isOpen, onConfirm, onCancel, title, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast" role="dialog" aria-modal="true">
            <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-5 p-6 w-full max-w-md m-4 transform transition-all animate-modal-content-show" role="document">
                <h3 className="text-xl font-bold text-[var(--on-surface)] mb-2">{title}</h3>
                <p className="text-[var(--on-surface-variant)] mb-6">{children}</p>
                <div className="flex justify-end gap-4">
                    <button onClick={onCancel} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-high)] focus:ring-[var(--primary)] transition">
                        إلغاء
                    </button>
                    <button onClick={onConfirm} className="px-6 py-2 bg-[var(--error)] text-[var(--on-error)] font-semibold rounded-full hover:bg-[color-mix(in_srgb,_var(--on-error)_8%,_var(--error))] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-high)] focus:ring-[var(--error)] transition">
                        تأكيد
                    </button>
                </div>
            </div>
        </div>
    );
};

const RoleManagementModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (newRolePermissions: Record<string, UserPermissions>) => void;
    currentRolePermissions: Record<string, UserPermissions>;
    users: User[];
}> = ({ isOpen, onClose, onSave, currentRolePermissions, users }) => {
    const [selectedRole, setSelectedRole] = useState<string>(ROLES[0]);
    const [tempPermissions, setTempPermissions] = useState<Record<string, UserPermissions>>({});
    const [newRoleName, setNewRoleName] = useState('');
    const [roleToDelete, setRoleToDelete] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setTempPermissions(JSON.parse(JSON.stringify(currentRolePermissions)));
            setSelectedRole(ROLES[0]);
            setNewRoleName('');
            setRoleToDelete(null);
        }
    }, [isOpen, currentRolePermissions]);

    if (!isOpen) return null;
    
    const handleSave = () => {
        onSave(tempPermissions);
        onClose();
    };

    const handlePermissionChange = (newPermissionsForRole: UserPermissions) => {
        setTempPermissions(produce(draft => {
            draft[selectedRole] = newPermissionsForRole;
        }));
    };

    const handleAddRole = () => {
        if (!newRoleName.trim() || tempPermissions[newRoleName.trim()]) {
            alert('اسم الدور غير صالح أو مستخدم بالفعل.');
            return;
        }
        setTempPermissions(produce(draft => {
            draft[newRoleName.trim()] = generateFullPermissions({}); // Add with no permissions
        }));
        setSelectedRole(newRoleName.trim());
        setNewRoleName('');
    };

    const handleDeleteRole = () => {
        if (!roleToDelete) return;

        if (roleToDelete === 'مدير') {
            alert('لا يمكن حذف دور "مدير".');
            setRoleToDelete(null);
            return;
        }

        const isRoleInUse = users.some(u => u.role === roleToDelete);
        if (isRoleInUse) {
            alert(`لا يمكن حذف الدور "${roleToDelete}" لأنه مخصص لواحد أو أكثر من المستخدمين.`);
            setRoleToDelete(null);
            return;
        }

        setTempPermissions(produce(draft => {
            delete draft[roleToDelete];
        }));

        if (selectedRole === roleToDelete) {
            setSelectedRole(Object.keys(tempPermissions)[0] || '');
        }
        setRoleToDelete(null);
    };

    const isManagerRole = selectedRole === 'مدير';

    return (
        <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
                <div className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-5 w-full max-w-6xl m-4 flex flex-col max-h-[90vh] animate-modal-content-show" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-[var(--outline-variant)]">
                        <h3 className="text-xl font-bold text-[var(--on-surface)]">إدارة صلاحيات الأدوار</h3>
                    </div>
                    <div className="flex flex-grow min-h-0">
                        <aside className="w-1/3 md:w-1/4 p-4 border-l border-[var(--outline-variant)] flex flex-col">
                            <div className="space-y-2 flex-grow overflow-y-auto">
                                {Object.keys(tempPermissions).map(role => (
                                    <div key={role} className="flex items-center gap-1">
                                        <button
                                            onClick={() => setSelectedRole(role)}
                                            className={`w-full text-right p-3 rounded-xl font-semibold transition-colors ${selectedRole === role ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)]' : 'hover:bg-[var(--surface-container)]'}`}
                                        >
                                            {role}
                                        </button>
                                        {role !== 'مدير' && (
                                            <button onClick={() => setRoleToDelete(role)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full flex-shrink-0" title={`حذف دور ${role}`}>
                                                <DeleteIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t border-[var(--outline)] space-y-2">
                                <input
                                    type="text"
                                    placeholder="اسم الدور الجديد..."
                                    value={newRoleName}
                                    onChange={(e) => setNewRoleName(e.target.value)}
                                    className="input-style"
                                />
                                <button onClick={handleAddRole} className="w-full px-4 py-2 bg-[var(--primary)] text-[var(--on-primary)] text-sm font-semibold rounded-full hover:bg-[var(--primary-hover)] transition">
                                    إضافة دور جديد
                                </button>
                            </div>
                        </aside>
                        <main className="flex-1 p-6 overflow-y-auto">
                            {isManagerRole && (
                                <div className="p-3 mb-4 bg-yellow-100/40 dark:bg-yellow-900/20 rounded-xl border border-yellow-500/30 text-sm text-yellow-800 dark:text-yellow-300">
                                    لا يمكن تعديل صلاحيات دور "المدير" لضمان وجود مستخدم لديه صلاحيات كاملة دائماً.
                                </div>
                            )}
                            <PermissionTree
                                nodes={APP_STRUCTURE}
                                permissions={tempPermissions[selectedRole] || {}}
                                onPermissionChange={handlePermissionChange}
                                disabled={isManagerRole}
                            />
                        </main>
                    </div>
                    <div className="p-4 bg-[var(--surface-container)] rounded-b-3xl flex justify-end gap-4 border-t border-[var(--outline-variant)]">
                        <button type="button" onClick={onClose} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)]">إلغاء</button>
                        <button type="button" onClick={handleSave} className="px-6 py-2 bg-[var(--primary)] text-[var(--on-primary)] font-semibold rounded-full hover:bg-[var(--primary-hover)]">حفظ التغييرات</button>
                    </div>
                </div>
            </div>
             <ConfirmationDialog
                isOpen={!!roleToDelete}
                onConfirm={handleDeleteRole}
                onCancel={() => setRoleToDelete(null)}
                title="تأكيد الحذف"
            >
                هل أنت متأكد من رغبتك في حذف الدور "{roleToDelete}"؟
            </ConfirmationDialog>
        </>
    );
};


interface UserManagementProps {
    currentUser: User;
    users: User[];
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    rolePermissions: Record<string, UserPermissions>;
    setRolePermissions: React.Dispatch<React.SetStateAction<Record<string, UserPermissions>>>;
}

const UserManagement: React.FC<UserManagementProps> = ({currentUser, users, setUsers, rolePermissions, setRolePermissions}) => {
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    
    const [isUserFormOpen, setUserFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const [isRoleModalOpen, setRoleModalOpen] = useState(false);

    const canAdd = hasPermission(currentUser, 'user-management', 'add');
    const canModify = hasPermission(currentUser, 'user-management', 'modify');
    const canDelete = hasPermission(currentUser, 'user-management', 'delete');
    const showActionsColumn = canModify || canDelete;

    const openDeleteModal = (user: User) => {
        setUserToDelete(user);
        setDeleteModalOpen(true);
    };

    const closeDeleteModal = () => {
        setUserToDelete(null);
        setDeleteModalOpen(false);
    };

    const handleDeleteUser = () => {
        if (userToDelete) {
            if (userToDelete.id === currentUser.id) {
                alert("لا يمكنك حذف حسابك الخاص.");
                closeDeleteModal();
                return;
            }
            setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDelete.id));
            closeDeleteModal();
        }
    };
    
    const handleOpenAddModal = () => {
        setEditingUser(null);
        setUserFormOpen(true);
    };
    
    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setUserFormOpen(true);
    };

    const handleSaveUser = (userData: Omit<User, 'id'> & { id?: number }) => {
        setUsers(prevUsers =>
            produce(prevUsers, draft => {
                if (userData.id !== undefined && userData.id !== null) { // Editing existing user
                    const userIndex = draft.findIndex(u => u.id === userData.id);
                    if (userIndex !== -1) {
                        const originalUser = draft[userIndex];
                        const { password, ...restOfUserData } = userData;
                        
                        // Replace the existing object with a new merged one, preserving existing fields
                        draft[userIndex] = {
                            ...originalUser,
                            ...restOfUserData,
                            password: password || originalUser.password,
                            passwordChangedOn: password ? new Date().toISOString() : originalUser.passwordChangedOn,
                        };
                    }
                } else { // Adding new user
                    const newId = draft.length > 0 ? Math.max(...draft.map(u => u.id)) + 1 : 1;
                    const newUser: User = {
                        ...emptyUser,
                        ...userData,
                        id: newId,
                        currentLogins: 0,
                        passwordChangedOn: new Date().toISOString(),
                    };
                     if (!newUser.password) {
                        newUser.password = 'DefaultPassword123!'; // A required field should have a value
                    }
                    draft.push(newUser);
                }
            })
        );
        setUserFormOpen(false);
    };

    return (
        <>
            <div className="space-y-6 flex flex-col flex-1">
                <div className="glassmorphism-header flex justify-between items-center flex-wrap gap-4 p-4 rounded-2xl">
                    <h2 className="text-xl font-bold text-[var(--on-surface)]">قائمة المستخدمين</h2>
                    <div className="flex items-center gap-2">
                        {canModify && (
                            <button onClick={() => setRoleModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--secondary-container)] text-[var(--on-secondary-container)] font-semibold rounded-full shadow-sm hover:shadow-md transition-all">
                                <UserGroupIcon className="h-5 w-5"/>
                                <span>إدارة صلاحيات الأدوار</span>
                            </button>
                        )}
                        {canAdd && (
                            <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--on-primary)] font-semibold rounded-full shadow-elevation-1 hover:shadow-elevation-2 hover:bg-[color-mix(in_srgb,_var(--on-primary)_8%,_var(--primary))] transition-all transform hover:scale-105 active:scale-100">
                                <PlusIcon className="h-5 w-5"/>
                                <span>إضافة مستخدم</span>
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="bg-[var(--surface-container-low)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-2 overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-y-auto flex-1">
                        <table className="w-full text-right">
                            <thead className="bg-[var(--surface-container)] sticky top-0">
                                <tr>
                                    <th className="p-4 font-semibold text-sm text-[var(--on-surface)]">الاسم</th>
                                    <th className="p-4 font-semibold text-sm text-[var(--on-surface)]">اسم المستخدم</th>
                                    <th className="p-4 font-semibold text-sm text-[var(--on-surface)]">الدور</th>
                                    <th className="p-4 font-semibold text-sm text-[var(--on-surface)]">الحالة</th>
                                    {showActionsColumn && (
                                        <th className="p-4 font-semibold text-sm text-[var(--on-surface)] text-center">إجراءات</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user, index) => (
                                    <tr key={user.id} className={`border-t border-[var(--outline-variant)] transition-colors ${index % 2 === 0 ? 'bg-transparent' : 'bg-[color-mix(in_srgb,_var(--surface)_50%,_transparent)]'} hover:bg-[var(--surface-container-high)]`}>
                                        <td className="p-4 font-medium text-[var(--on-surface-variant)]">{user.name}</td>
                                        <td className="p-4 text-[var(--on-surface-variant)] font-mono">{user.username}</td>
                                        <td className="p-4 text-[var(--on-surface-variant)]">{user.role}</td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${user.status === 'نشط' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300'}`}>
                                                <span className={`h-2 w-2 rounded-full ${user.status === 'نشط' ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                                {user.status}
                                            </span>
                                        </td>
                                        {showActionsColumn && (
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center items-center gap-2">
                                                    {canModify && (
                                                        <button onClick={() => handleOpenEditModal(user)} className="p-2 text-[var(--tertiary)] hover:bg-[var(--tertiary-container)] rounded-full transition-all hover:scale-110" title="تعديل">
                                                            <EditIcon />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button onClick={() => openDeleteModal(user)} disabled={user.id === currentUser.id} className="p-2 text-[var(--error)] hover:bg-[var(--error-container)] rounded-full transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent" title={user.id === currentUser.id ? 'لا يمكن حذف المستخدم الحالي' : 'حذف'}>
                                                            <DeleteIcon />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <ConfirmationDialog 
                isOpen={isDeleteModalOpen}
                onConfirm={handleDeleteUser}
                onCancel={closeDeleteModal}
                title="تأكيد الحذف"
            >
              هل أنت متأكد من رغبتك في حذف المستخدم <span className="font-bold text-[var(--on-surface)]">{userToDelete?.name || ''}</span>؟ لا يمكن التراجع عن هذا الإجراء.
            </ConfirmationDialog>

            <UserFormModal
                isOpen={isUserFormOpen}
                onClose={() => setUserFormOpen(false)}
                onSave={handleSaveUser}
                user={editingUser}
                currentUser={currentUser}
                canModify={canModify}
                rolePermissions={rolePermissions}
            />
            
            <RoleManagementModal 
                isOpen={isRoleModalOpen}
                onClose={() => setRoleModalOpen(false)}
                currentRolePermissions={rolePermissions}
                onSave={setRolePermissions}
                users={users}
            />

            <style>{`
                .glassmorphism-header {
                    background: color-mix(in srgb, var(--surface-container) 70%, transparent);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--outline-variant);
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
                
                .form-label {
                  display: block;
                  margin-bottom: 0.5rem;
                  font-weight: 500;
                  color: var(--on-surface-variant);
                  font-size: 0.875rem;
                }
                .input-style {
                    width: 100%;
                    padding: 0.65rem 1rem;
                    border: 1px solid var(--outline-variant);
                    border-radius: 0.75rem;
                    box-shadow: none;
                    transition: all 0.2s ease-in-out;
                    text-align: right;
                    background-color: var(--surface);
                    color: var(--on-surface);
                    caret-color: var(--primary);
                }
                .input-style:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 2px var(--focus-ring);
                }
                 .checkbox-style {
                    height: 1.125rem;
                    width: 1.125rem;
                    border-radius: 0.25rem;
                    text-align: var(--primary);
                    background-color: var(--surface-container-highest);
                    border-color: var(--outline);
                }
                .checkbox-style:focus {
                     ring: var(--primary);
                }
            `}</style>
        </>
    );
};

export default UserManagement;