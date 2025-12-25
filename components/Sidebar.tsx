
import React from 'react';
import { CalculatorIcon, CogIcon, CloseIcon, TableIcon, SubscriptionIcon, UserShieldIcon, DollarCircleIcon, ScaleIcon } from './Icons';
import { ActiveView, User } from '../types';
import { hasPermission } from '../permissions';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, isActive, isCollapsed, onClick }) => {
  const itemClasses = `
    relative flex items-center p-3 my-1 cursor-pointer transition-all duration-300 group rounded-xl
    ${isActive
        ? 'bg-[var(--sidebar-item-active-bg)] text-[var(--sidebar-text-active)] font-bold'
        : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-item-hover-bg)] hover:text-[var(--sidebar-text-hover)]'
    }
  `;

  return (
    <li
      onClick={onClick}
      className={itemClasses}
      title={isCollapsed ? label : undefined}
    >
      {isActive && <div className="absolute right-0 top-2 bottom-2 w-1 bg-[var(--sidebar-active-indicator)] rounded-full shadow-[0_0_8px_var(--sidebar-active-indicator)]"></div>}
      <div className={`transition-all duration-300 group-hover:scale-110 ${isActive ? 'scale-110 text-[var(--sidebar-icon-active)]' : 'text-inherit'}`}>
        {icon}
      </div>
      <span className={`mr-4 font-semibold whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>{label}</span>
    </li>
  );
};

interface SidebarProps {
    isMobileOpen: boolean;
    isCollapsed: boolean;
    onClose: () => void;
    activeView: ActiveView;
    setActiveView: (view: ActiveView) => void;
    currentUser: User;
}

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, isCollapsed, onClose, activeView, setActiveView, currentUser }) => {
  
  const allItems: { view: ActiveView; icon: React.ReactNode; label: string }[] = [
      { view: 'calculator', icon: <CalculatorIcon />, label: 'برنامج حساب المعاشات' },
      { view: 'subscription-calculator', icon: <SubscriptionIcon />, label: 'برنامج حساب الاشتراكات' },
      { view: 'additional-amounts-calculator', icon: <DollarCircleIcon />, label: 'برنامج حساب المبالغ الإضافية' },
      { view: 'legislations', icon: <ScaleIcon />, label: 'التشريعات' },
      { view: 'tables', icon: <TableIcon />, label: 'جداول الهيئة' },
      { view: 'user-management', icon: <UserShieldIcon />, label: 'إدارة صلاحيات المستخدمين' },
      { view: 'settings', icon: <CogIcon />, label: 'الإعدادات' },
  ];

  const visibleItems = allItems.filter(item => hasPermission(currentUser, item.view, 'read'));

  return (
    <>
      {/* Backdrop for mobile */}
      <div 
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity md:hidden ${isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      ></div>

      {/* Sidebar */}
      <aside 
        style={{ background: 'var(--sidebar-bg)' }}
        className={`fixed md:relative top-0 right-0 h-full md:h-auto p-3 border-l border-white/10 backdrop-blur-lg shadow-2xl z-40
                   transition-all duration-300 ease-in-out md:shrink-0
                   ${isMobileOpen ? 'translate-x-0 w-72' : 'translate-x-full w-72'}
                   md:translate-x-0 ${isCollapsed ? 'md:w-20' : 'md:w-72'}`}
      >
        <div className="flex justify-between items-center md:hidden mb-4 px-2">
            <span className="font-bold text-white">القائمة</span>
            <button onClick={onClose} className="p-2 text-blue-200 rounded-full hover:bg-white/10">
                <CloseIcon />
            </button>
        </div>
        <nav>
          <ul>
            {visibleItems.map(item => (
                <SidebarItem
                    key={item.view}
                    icon={item.icon}
                    label={item.label}
                    isActive={activeView === item.view}
                    isCollapsed={isCollapsed}
                    onClick={() => {
                        setActiveView(item.view);
                        onClose(); // Closes mobile sidebar if open
                    }}
                />
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
