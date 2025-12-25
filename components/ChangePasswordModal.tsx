
import React, { useState } from 'react';
import { User } from '../types';
import PasswordInput from './PasswordInput';
import { CloseIcon } from './Icons';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newPassword: string) => void;
    currentUser: User;
}

// Helper function for hashing
const sha256 = async (message: string) => {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose, onSave, currentUser }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        // Verify current password (handle both plain text and hash)
        let isCurrentCorrect = false;
        if (currentPassword === currentUser.password) {
            isCurrentCorrect = true;
        } else {
            // Check if stored password is a hash of the input
            const inputHash = await sha256(currentPassword);
            if (inputHash === currentUser.password) {
                isCurrentCorrect = true;
            }
        }

        if (!isCurrentCorrect) {
            setError('كلمة المرور الحالية غير صحيحة.');
            return;
        }

        if (newPassword.length < (currentUser.passwordPolicy?.minLength || 8)) {
            setError(`كلمة المرور الجديدة يجب أن تكون على الأقل ${currentUser.passwordPolicy?.minLength || 8} حروف.`);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('كلمتا المرور الجديدتان غير متطابقتين.');
            return;
        }
        
        // Hash the new password before saving
        const hashedNewPassword = await sha256(newPassword);
        
        onSave(hashedNewPassword);
        setSuccessMessage('تم تغيير كلمة المرور بنجاح!');
        
        // Reset fields and close after a delay
        setTimeout(() => {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
            setSuccessMessage('');
            onClose();
        }, 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast" onClick={onClose}>
            <div 
                className="bg-[var(--surface-container-high)] border border-[var(--outline-variant)] rounded-3xl shadow-elevation-5 w-full max-w-md m-4 flex flex-col max-h-[90vh] animate-modal-content-show" 
                onClick={e => e.stopPropagation()}
            >
                <form onSubmit={handleSave}>
                    <div className="flex items-center justify-between p-4 border-b border-[var(--outline-variant)]">
                        <h3 className="text-lg font-bold text-[var(--on-surface)]">تغيير كلمة المرور</h3>
                        <button type="button" onClick={onClose} className="p-2 text-[var(--on-surface-variant)] rounded-full hover:bg-[var(--surface-container-highest)]">
                            <CloseIcon />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        {error && <p className="text-sm text-center text-[var(--on-error-container)] bg-[var(--error-container)] p-3 rounded-lg">{error}</p>}
                        {successMessage && <p className="text-sm text-center text-green-300 bg-green-900/40 p-3 rounded-lg">{successMessage}</p>}
                        
                        <div>
                            <label className="form-label" htmlFor="currentPassword">كلمة المرور الحالية</label>
                            <PasswordInput id="currentPassword" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="input-style" required />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="newPassword">كلمة المرور الجديدة</label>
                            <PasswordInput id="newPassword" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-style" required />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="confirmPassword">تأكيد كلمة المرور الجديدة</label>
                            <PasswordInput id="confirmPassword" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-style" required />
                        </div>
                    </div>

                    <div className="p-4 bg-[var(--surface-container)] rounded-b-3xl flex justify-end gap-4 border-t border-[var(--outline-variant)]">
                        <button type="button" onClick={onClose} className="px-6 py-2 bg-transparent text-[var(--primary)] font-semibold rounded-full hover:bg-[var(--primary-container)] active:bg-[color-mix(in_srgb,_var(--primary)_20%,_transparent)] transition">إلغاء</button>
                        <button type="submit" disabled={!!successMessage} className="px-6 py-2 bg-[var(--primary)] text-[var(--on-primary)] font-semibold rounded-full hover:bg-[var(--primary-hover)] transition disabled:opacity-50">حفظ</button>
                    </div>
                </form>
            </div>
            <style>{`
                .form-label {
                  display: block;
                  margin-bottom: 0.5rem;
                  font-weight: 500;
                  color: var(--on-surface-variant);
                  font-size: 0.875rem;
                }
                .input-style {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    border: 1px solid var(--outline);
                    border-radius: 0.75rem;
                    background-color: var(--surface-container);
                    color: var(--on-surface);
                    caret-color: var(--primary);
                    transition: all 0.2s;
                }
                .input-style:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px var(--focus-ring);
                }
                 .animate-fade-in-fast { animation: fade-in-fast 0.2s ease-out forwards; }
                .animate-modal-content-show { animation: modal-content-show 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                 @keyframes fade-in-fast { from { opacity: 0; } to { opacity: 1; } }
                @keyframes modal-content-show { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
};

export default ChangePasswordModal;
