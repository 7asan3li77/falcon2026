
import React, { useState, useEffect } from 'react';
import { LogoIcon } from './Icons';
import { User } from '../types';
import PasswordInput from './PasswordInput';
import { produce } from 'immer';

interface LoginScreenProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onLoginSuccess: (user: User) => void;
}

const LockIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
    </svg>
);

const REMEMBER_ME_KEY = 'FALCON_REMEMBERED_USER';

// Helper function for hashing
const sha256 = async (message: string) => {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const LoginScreen: React.FC<LoginScreenProps> = ({ users, setUsers, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFormDisabled, setFormDisabled] = useState(false);

  useEffect(() => {
    // On component mount, check for a remembered username
    const rememberedUsername = localStorage.getItem(REMEMBER_ME_KEY);
    if (rememberedUsername) {
        setUsername(rememberedUsername);
        setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    // Re-enable the form if the user tries a different username
    setFormDisabled(false);
    setError('');
  }, [username]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormDisabled) return;
    setError('');
    setIsLoading(true);

    // Artificial delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));

    const user = users.find(u => u.username === username);

    if (!user) {
        setIsLoading(false);
        setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
        return;
    }
    
    const generalAccessDeniedMsg = 'لم يعد لك صلاحية للدخول إلى البرنامج. ';

    // --- 1. Permanent lockout check ---
    if (user.lockedOutUntil && new Date() < new Date(user.lockedOutUntil)) {
        setIsLoading(false);
        setError(generalAccessDeniedMsg + (user.restrictions?.lockoutMessage || 'الحساب مقفل مؤقتاً.'));
        setFormDisabled(true);
        return;
    }

    // --- 2. Password Verification (Smart Migration) ---
    let isPasswordCorrect = false;
    let needsMigration = false;

    // A. Check Plain Text (Legacy Support)
    if (user.password === password) {
        isPasswordCorrect = true;
        // Only migrate if it's not already a hash (simple heuristic: length 64 for SHA-256)
        if (!user.password || user.password.length !== 64) {
            needsMigration = true;
        }
    } 
    // B. Check Hash (Secure Support)
    else {
        const inputHash = await sha256(password);
        if (user.password === inputHash) {
            isPasswordCorrect = true;
        }
    }

    if (!isPasswordCorrect) {
        setIsLoading(false);
        // Update attempts and check if it triggers a lockout
        const updatedUsers = produce(users, draft => {
            const userToUpdate = draft.find(u => u.id === user.id);
            if (userToUpdate) {
                userToUpdate.loginAttempts = (userToUpdate.loginAttempts || 0) + 1;
                const threshold = userToUpdate.restrictions?.lockoutThreshold;
                if (threshold && threshold > 0 && userToUpdate.loginAttempts >= threshold) {
                        const lockoutMinutes = userToUpdate.restrictions.lockoutDurationMinutes || 15;
                        const lockoutUntil = new Date(new Date().getTime() + lockoutMinutes * 60000);
                        userToUpdate.lockedOutUntil = lockoutUntil.toISOString();
                        setError(generalAccessDeniedMsg + (userToUpdate.restrictions.lockoutMessage || `تم قفل الحساب مؤقتاً.`));
                        setFormDisabled(true);
                } else {
                    setError('اسم المستخدم أو كلمة المرور غير صحيحة.');
                }
            }
        });
        setUsers(updatedUsers);
        return;
    }
    
    // --- Password is correct, now check other restrictions ---

    if (user.status === 'غير نشط') {
        setIsLoading(false);
        setError(generalAccessDeniedMsg + 'هذا الحساب غير نشط.');
        setFormDisabled(true);
        return;
    }

    if (user.restrictions?.accountExpiresOn && new Date() > new Date(user.restrictions.accountExpiresOn)) {
        setIsLoading(false);
        setError(generalAccessDeniedMsg + 'لقد انتهت صلاحية هذا الحساب.');
        setFormDisabled(true);
        return;
    }
    
    if (user.restrictions?.passwordExpiresDays && user.restrictions.passwordExpiresDays > 0) {
        const passwordChangedDate = user.passwordChangedOn ? new Date(user.passwordChangedOn) : new Date(0);
        const expirationDate = new Date(passwordChangedDate);
        expirationDate.setDate(expirationDate.getDate() + user.restrictions.passwordExpiresDays);
        if (new Date() > expirationDate) {
            setIsLoading(false);
            setError(generalAccessDeniedMsg + 'انتهت صلاحية كلمة المرور.');
            setFormDisabled(true);
            return;
        }
    }
    
    if (user.restrictions?.maxLogins && (user.currentLogins || 0) >= user.restrictions.maxLogins) {
        setIsLoading(false);
        setError(generalAccessDeniedMsg + 'لقد استنفذت عدد مرات الدخول المسموح بها.');
        setFormDisabled(true);
        return;
    }

    // --- Success & Migration Logic ---
    if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, username);
    } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
    }

    // If migration is needed, update the user's password to hash BEFORE logging in
    if (needsMigration) {
        const secureHash = await sha256(password);
        const migratedUser = { ...user, password: secureHash };
        
        // Update global state to persist the hash
        setUsers(currentUsers => currentUsers.map(u => u.id === user.id ? migratedUser : u));
        
        // Proceed with the migrated user object
        onLoginSuccess(migratedUser);
    } else {
        onLoginSuccess(user);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center p-6 transition-all duration-300" style={{ background: 'var(--login-bg)' }}>
        <div className="w-full max-w-md animate-fade-in-slow">
            <div className="glass-card p-8 sm:p-12 space-y-8 rounded-[28px] border border-white/10 shadow-2xl">
                <div className="text-center space-y-4">
                    <div className="inline-block relative">
                        <LogoIcon className="h-24 w-24 mx-auto text-[var(--primary)]" />
                        <div className="logo-glow absolute inset-0 -z-10 bg-[var(--primary)] rounded-full blur-2xl opacity-50"></div>
                    </div>
                    <h1 className="text-5xl font-bold text-[var(--on-background)] tracking-wider">الصقر</h1>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <input
                            type="text"
                            placeholder="اسم المستخدم"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="login-input"
                            required
                            disabled={isLoading || isFormDisabled}
                        />
                    </div>
                    <div>
                        <PasswordInput
                            placeholder="كلمة المرور"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="login-input"
                            required
                            disabled={isLoading || isFormDisabled}
                        />
                    </div>
                    
                    <div className="flex items-center justify-start">
                        <label className="flex items-center gap-2 text-sm text-[var(--on-surface-variant)] cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="h-4 w-4 rounded border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--primary)] focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-container-low)] focus:ring-[var(--primary)] transition"
                                disabled={isLoading || isFormDisabled}
                            />
                            <span>حفظ بيانات الدخول</span>
                        </label>
                    </div>

                    {error && <p className="text-sm text-center text-[var(--on-error-container)] bg-[var(--error-container)] p-3 rounded-lg border border-[var(--error)]/30">{error}</p>}

                    <div>
                        <button type="submit" className="login-button" disabled={isLoading || isFormDisabled}>
                            {isLoading ? (
                                <div className="loader"></div>
                            ) : (
                                <span>تسجيل الدخول</span>
                            )}
                        </button>
                    </div>
                </form>

                <div className="text-center">
                    <p className="text-xs text-[var(--on-surface-variant)] flex items-center justify-center gap-2">
                        <LockIcon className="h-4 w-4" />
                        يرجى عدم مشاركة بيانات الدخول الخاصة بك
                    </p>
                </div>
            </div>
        </div>

        <style>{`
            .glass-card {
                background: var(--glass-card-bg);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
            }
            .login-input {
                width: 100%;
                padding: 0.85rem 1.2rem;
                border: 1px solid var(--outline);
                border-radius: 12px;
                background: var(--surface-container-low);
                color: var(--on-surface);
                font-size: 1rem;
                transition: all 0.3s ease;
                outline: none;
            }
            .login-input::placeholder {
                color: var(--on-surface-variant);
            }
            .login-input:focus {
                border-color: var(--primary);
                box-shadow: 0 0 0 3px var(--focus-ring);
            }
            .login-input:disabled {
                background-color: var(--surface-container);
                opacity: 0.6;
                cursor: not-allowed;
            }
            .login-button {
                width: 100%;
                padding: 0.85rem;
                border: none;
                border-radius: 12px;
                background-image: linear-gradient(to right, var(--secondary), var(--primary));
                color: var(--on-primary);
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            .login-button:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px -5px color-mix(in srgb, var(--primary) 30%, transparent);
            }
            .login-button:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }
            .loader {
                width: 20px;
                height: 20px;
                border: 2px solid var(--on-primary);
                border-bottom-color: transparent;
                border-radius: 50%;
                display: inline-block;
                box-sizing: border-box;
                animation: rotation 1s linear infinite;
                margin: 0 auto;
            }
            @keyframes rotation {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes fade-in-slow {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in-slow {
                animation: fade-in-slow 0.6s ease-out forwards;
            }
        `}</style>
    </div>
  );
};

export default LoginScreen;
