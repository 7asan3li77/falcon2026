
import React from 'react';
import InsuranceDuesCalculator from './InsuranceDuesCalculator';
import AuthorityTables from './AuthorityTables';
import { ActiveView, User, UserPermissions } from '../types';
import SubscriptionCalculator from './SubscriptionCalculator';
import UserManagement from './UserManagement';
import AdditionalAmountsCalculator from './AdditionalAmountsCalculator';
import Legislations from './Legislations';
import { hasPermission } from '../permissions';


const AccessDenied: React.FC = () => (
    <div className="bg-[var(--error-container)] border border-[var(--error)]/30 rounded-3xl shadow-elevation-1 p-8 text-center animate-fade-in">
        <h2 className="text-2xl font-bold text-[var(--on-error-container)] mb-2">الوصول مرفوض</h2>
        <p className="text-[var(--on-error-container)]/80">ليس لديك الصلاحية لعرض هذه الصفحة. يرجى الاتصال بمدير النظام.</p>
    </div>
);

interface MainContentProps {
  activeView: ActiveView;
  currentUser: User;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  rolePermissions: Record<string, UserPermissions>;
  setRolePermissions: React.Dispatch<React.SetStateAction<Record<string, UserPermissions>>>;
}

const MainContent: React.FC<MainContentProps> = ({ activeView, currentUser, users, setUsers, rolePermissions, setRolePermissions }) => {
  const getTitle = () => {
    switch (activeView) {
      case 'calculator':
        return 'برنامج حساب المعاشات';
      case 'subscription-calculator':
        return 'برنامج حساب الاشتراكات';
      case 'additional-amounts-calculator':
        return 'برنامج حساب المبالغ الإضافية';
      case 'legislations':
        return 'التشريعات';
      case 'tables':
        return 'جداول الهيئة';
      case 'user-management':
        return 'إدارة صلاحيات المستخدمين';
      case 'settings':
        return 'الإعدادات';
      default:
        return 'الصقر';
    }
  };

  const renderContent = () => {
    if (!hasPermission(currentUser, activeView, 'read')) {
        return <AccessDenied />;
    }

    switch (activeView) {
      case 'calculator':
        return <InsuranceDuesCalculator />;
      case 'subscription-calculator':
        return <SubscriptionCalculator />;
      case 'additional-amounts-calculator':
        return <AdditionalAmountsCalculator currentUser={currentUser} />;
      case 'legislations':
        return <Legislations currentUser={currentUser} />;
      case 'tables':
        return <AuthorityTables currentUser={currentUser} />;
      case 'user-management':
        return <UserManagement 
                  currentUser={currentUser} 
                  users={users} 
                  setUsers={setUsers} 
                  rolePermissions={rolePermissions}
                  setRolePermissions={setRolePermissions}
                />;
      case 'settings':
        return (
          <div className="bg-[var(--surface)] border border-[var(--outline)] rounded-3xl shadow-elevation-1 p-8">
            <p className="text-[var(--on-surface)]">سيتم إضافة صفحة الإعدادات قريباً.</p>
          </div>
        );
      default:
        return <InsuranceDuesCalculator />;
    }
  };
  
  return (
    <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto bg-[var(--background)]">
      <div className="max-w-screen-2xl mx-auto w-full flex-1 flex flex-col">
        <h1 
          className="text-3xl font-bold text-[var(--on-background)] mb-6 animate-fade-in"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)'}}
        >
          {getTitle()}
        </h1>
        <div className="animate-fade-in flex-1 flex flex-col" style={{animationDelay: '100ms'}}>
          {renderContent()}
        </div>
      </div>
    </main>
  );
};

export default MainContent;
