import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import StatusBar from './components/StatusBar';
import LoginScreen from './components/LoginScreen';
import { ActiveView, User, UserPermissions } from './types';
import { hasPermission } from './permissions';
import { initialMockUsers } from './components/data';
import { initialRolePermissions } from './roles';

const USERS_STORAGE_KEY = 'falcon_app_users';
const ROLE_PERMISSIONS_STORAGE_KEY = 'falcon_app_role_permissions';
const THEME_STORAGE_KEY = 'falcon_app_theme';
const SESSION_STORAGE_KEY = 'falcon_app_session';

type Theme = 'light' | 'dark';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>(() => {
    try {
        const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
        return storedUsers ? JSON.parse(storedUsers) : initialMockUsers;
    } catch (error) {
        console.error("Failed to load users from localStorage:", error);
        return initialMockUsers;
    }
  });

  useEffect(() => {
      try {
          localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
      } catch (error) {
          console.error("Failed to save users to localStorage:", error);
      }
  }, [users]);


  const [rolePermissions, setRolePermissions] = useState<Record<string, UserPermissions>>(() => {
    try {
      const stored = localStorage.getItem(ROLE_PERMISSIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : initialRolePermissions;
    } catch (error) {
      console.error("Failed to load role permissions from localStorage:", error);
      return initialRolePermissions;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ROLE_PERMISSIONS_STORAGE_KEY, JSON.stringify(rolePermissions));
    } catch (error) {
      console.error("Failed to save role permissions to localStorage:", error);
    }
  }, [rolePermissions]);

  const getInitialSession = (): { user: User | null, time: Date | null } => {
    try {
        const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!storedSession) return { user: null, time: null };

        const { userId, loginTimestamp } = JSON.parse(storedSession);
        if (!userId || !loginTimestamp) {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            return { user: null, time: null };
        }

        const loginDate = new Date(loginTimestamp);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        if (loginDate < threeDaysAgo) {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            return { user: null, time: null };
        }

        const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
        const allUsers: User[] = storedUsers ? JSON.parse(storedUsers) : initialMockUsers;
        const user = allUsers.find((u) => u.id === userId);

        if (user) {
            return { user: user, time: loginDate };
        } else {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            return { user: null, time: null };
        }
    } catch (error) {
        console.error("Failed to load session from localStorage:", error);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return { user: null, time: null };
    }
  };

  const initialSession = getInitialSession();

  const [currentUser, setCurrentUser] = useState<User | null>(initialSession.user);
  const [loginTime, setLoginTime] = useState<Date | null>(initialSession.time);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('calculator');
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
    return savedTheme || 'dark'; // Default to dark theme
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (currentUser) {
      if (!hasPermission(currentUser, activeView, 'read')) {
        setActiveView('calculator'); // Reset to default view if not allowed
      }
    }
  }, [currentUser, activeView]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  const handleLoginSuccess = (user: User) => {
    const now = new Date();
    const updatedUser = {
      ...user,
      currentLogins: (user.currentLogins || 0) + 1,
      lastLogin: now.toISOString(),
      loginAttempts: 0, // Reset login attempts on success
      lockedOutUntil: undefined, // Clear any lockout
    };
    
    setUsers(currentUsers => currentUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
    setCurrentUser(updatedUser);
    setLoginTime(now);

    try {
        const sessionData = {
            userId: updatedUser.id,
            loginTimestamp: now.toISOString(),
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
        console.error("Failed to save session to localStorage:", error);
    }
  };

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setLoginTime(null);
    setActiveView('calculator');
    try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
        console.error("Failed to clear session from localStorage:", error);
    }
  }, []);

  useEffect(() => {
    const idleTimeoutMinutes = currentUser?.restrictions?.idleTimeoutMinutes;

    if (!currentUser || !idleTimeoutMinutes || idleTimeoutMinutes <= 0) {
      return; // No timeout configured, so do nothing.
    }

    let timeoutId: number;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleLogout, idleTimeoutMinutes * 60 * 1000);
    };

    const activityEvents: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];

    // Add event listeners to reset the timer on user activity
    activityEvents.forEach(event => window.addEventListener(event, resetTimer));

    // Start the initial timer
    resetTimer();

    // Cleanup function to run when the component unmounts or dependencies change
    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [currentUser, handleLogout]);

  const handleChangePassword = (newPassword: string): void => {
    if (!currentUser) return;
    const updatedUser = {
      ...currentUser,
      password: newPassword,
      passwordChangedOn: new Date().toISOString(),
    };
    setUsers(currentUsers => currentUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
    setCurrentUser(updatedUser); // Update current user in state as well
  };

  if (!currentUser) {
    return <LoginScreen users={users} setUsers={setUsers} onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="h-screen w-screen bg-transparent flex flex-col text-[var(--on-background)]">
      <Header 
        onMenuClick={() => setMobileSidebarOpen(true)} 
        isSidebarCollapsed={isSidebarCollapsed}
        toggleSidebarCollapsed={() => setSidebarCollapsed(prev => !prev)}
        currentUser={currentUser}
        loginTime={loginTime}
        onLogout={handleLogout}
        onChangePassword={handleChangePassword}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          isMobileOpen={isMobileSidebarOpen} 
          isCollapsed={isSidebarCollapsed}
          onClose={() => setMobileSidebarOpen(false)} 
          activeView={activeView}
          setActiveView={setActiveView}
          currentUser={currentUser}
        />
        <div className="flex-1 flex flex-col transition-all duration-300 ease-in-out">
          <MainContent 
            activeView={activeView} 
            currentUser={currentUser} 
            users={users} 
            setUsers={setUsers}
            rolePermissions={rolePermissions}
            setRolePermissions={setRolePermissions} 
          />
          <StatusBar />
        </div>
      </div>
    </div>
  );
};

export default App;