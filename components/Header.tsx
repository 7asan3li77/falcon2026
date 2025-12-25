import React, { useState, useRef, useEffect } from 'react';
import { LogoIcon, KeyIcon, SunIcon, MoonIcon } from './Icons';
import { User } from '../types';
import ChangePasswordModal from './ChangePasswordModal';

const MenuIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
    </svg>
);

const MenuItem: React.FC<{ children: React.ReactNode, onClick?: () => void }> = ({ children, onClick }) => (
  <div onClick={onClick} className="px-4 py-2 text-sm text-blue-200/80 hover:text-white hover:bg-white/10 rounded-full cursor-pointer transition-colors">
    {children}
  </div>
);

const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};


interface UserMenuProps {
    currentUser: User;
    loginTime: Date | null;
    onLogout: () => void;
    onChangePassword: (newPassword: string) => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ currentUser, loginTime, onLogout, onChangePassword }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [sessionDuration, setSessionDuration] = useState('00:00:00');
    const [isChangePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!loginTime) return;

        const timer = setInterval(() => {
            const now = new Date();
            const seconds = Math.floor((now.getTime() - loginTime.getTime()) / 1000);
            setSessionDuration(formatDuration(seconds));
        }, 1000);

        return () => clearInterval(timer);
    }, [loginTime]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loginTimeString = loginTime ? loginTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';

    const handleSavePassword = (newPassword: string) => {
        onChangePassword(newPassword);
        setChangePasswordModalOpen(false);
    };

    return (
        <>
            <div className="relative" ref={menuRef}>
                <button 
                    onClick={() => setIsOpen(prev => !prev)}
                    className="flex items-center gap-3 text-right p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--primary-container)] focus:ring-white/50"
                >
                    <div className="hidden sm:block">
                        <div className="text-base font-semibold text-white">{currentUser.name}</div>
                        <div className="text-sm text-blue-200/80">وقت الدخول: {loginTimeString}</div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-400/50 text-white flex items-center justify-center font-bold text-lg border border-white/20">
                        {currentUser.name.charAt(0)}
                    </div>
                </button>
                {isOpen && (
                     <div className="absolute top-full left-0 mt-2 w-72 bg-slate-800/80 backdrop-blur-lg border border-slate-600 rounded-2xl shadow-elevation-4 animate-fade-in-fast z-50 p-4 space-y-4">
                        <div>
                            <div className="text-sm text-[var(--on-surface)] opacity-80">مدة استخدام البرنامج</div>
                            <div className="text-2xl font-mono font-bold text-[var(--on-surface)] tracking-widest">{sessionDuration}</div>
                        </div>

                        <button 
                            onClick={() => {
                                setChangePasswordModalOpen(true);
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center justify-start gap-2 px-4 py-2 text-[var(--on-surface)] opacity-90 font-medium rounded-full hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)] transition-colors"
                        >
                            <KeyIcon className="h-5 w-5" />
                            <span>تغيير كلمة المرور</span>
                        </button>
                        
                        <hr className="border-[var(--outline)]" />

                        <button 
                            onClick={onLogout}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--error-container)] text-[var(--on-error-container)] font-semibold rounded-full hover:bg-red-800/70 transition-colors"
                            title="تسجيل الخروج"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                            </svg>
                            <span>تسجيل الخروج</span>
                        </button>
                     </div>
                )}
            </div>
            <ChangePasswordModal 
                isOpen={isChangePasswordModalOpen}
                onClose={() => setChangePasswordModalOpen(false)}
                onSave={handleSavePassword}
                currentUser={currentUser}
            />
        </>
    );
};


interface HeaderProps {
  onMenuClick: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  currentUser: User;
  loginTime: Date | null;
  onLogout: () => void;
  onChangePassword: (newPassword: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, isSidebarCollapsed, toggleSidebarCollapsed, currentUser, loginTime, onLogout, onChangePassword, theme, toggleTheme }) => {

  return (
    <header style={{ background: 'var(--header-bg)' }} className="h-16 flex items-center px-4 shrink-0 z-20 shadow-lg">
       <button onClick={toggleSidebarCollapsed} className="hidden md:block p-2 text-white/80 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50 transition-transform duration-300"
        style={{ transform: isSidebarCollapsed ? 'rotate(90deg)' : 'rotate(0deg)' }}>
        <MenuIcon />
      </button>

      <div className="flex items-center mr-2">
        <LogoIcon className="h-10 w-10 text-white" />
        <span className="font-bold text-xl tracking-wide text-white">الصقر</span>
      </div>
      <div className="flex-grow"></div>
      
      <div className="flex items-center gap-2 ml-2">
        <button 
          onClick={toggleTheme}
          className="p-2 text-white/80 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
          title={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <UserMenu currentUser={currentUser} loginTime={loginTime} onLogout={onLogout} onChangePassword={onChangePassword} />
      </div>

      <button onClick={onMenuClick} className="md:hidden p-2 text-white/80 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50">
        <MenuIcon />
      </button>
      <style>{`
        @keyframes fade-in-fast {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-fast { animation: fade-in-fast 0.2s ease-out forwards; }
      `}</style>
    </header>
  );
};

export default Header;