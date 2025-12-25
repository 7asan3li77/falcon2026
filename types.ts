
export type LawType =
  | '79-1975'
  | '108-1976'
  | '112-1980'
  | '148-2019'
  | 'sadat'
  | '';
export type DuesType =
  | 'inheritance'
  | 'severance'
  | 'beneficiary'
  | '';

export interface Deduction {
  nasserBankInstallments: { active: boolean; amount: number };
  governmentFund: { active: boolean; amount: number };
  privateFund: { active: boolean; amount: number };
  alimony: { active: boolean; amount: number };
  other: { active: boolean; amount: number };
}

export interface ArrearsPeriod {
  startDate: string;
  endDate: string;
  percentage: number;
}

export interface InsuranceDuesFormData {
  lawType: LawType;
  // Pensioner Info
  insuranceNumber: string;
  pensionerName: string;
  dateOfBirth: string;
  dateOfDeath: string;
  pensionEntitlementDate: string;
  // Pension Values
  normalBasicPension: number;
  injuryBasicPension: number;
  variablePension: number; // For Law 79
  specialBonuses: number; // For Law 79
  totalBasicBonuses: number; // For Law 108
  // Dues Type
  duesType: DuesType;
  // Inheritance Dues
  multiplePeriods: 'yes' | 'no';
  // Single Period
  arrearsStartDate: string;
  arrearsEndDate: string;
  entitlementPercentage: number;
  // Multiple Periods
  periods: ArrearsPeriod[];
  // Deductions
  hasDeductions: 'yes' | 'no';
  deductions: Deduction;
  // Severance Grant
  severanceDate: string;
  severancePercentage: number;
  // No Beneficiaries
  noBeneficiaries: boolean;
}

export type ColorScheme = 'light' | 'dark';

export type AppTheme =
  | 'default-blue'
  | 'emerald-garden'
  | 'crimson-night'
  | 'royal-purple'
  | 'sunset-orange'
  | 'graphite-gray'
  | 'oceanic-teal'
  | 'ruby-red'
  | 'golden-sands'
  | 'slate-blue';

export type ActiveView = 'calculator' | 'subscription-calculator' | 'additional-amounts-calculator' | 'legislations' | 'tables' | 'user-management' | 'settings';

export type UserRole = 'مدير النظام' | 'مستخدم' | 'مراجع';

// --- New Granular Permissions Structure ---

export type PermissionAction = 'read' | 'add' | 'modify' | 'delete';

export interface PermissionNode {
  read?: boolean;
  add?: boolean;
  modify?: boolean;
  delete?: boolean;
  children?: {
    [key: string]: PermissionNode;
  };
}

export interface UserPermissions {
  [key: string]: PermissionNode;
}

// --- New Restrictions and Policies ---

export type LockoutAction = 'disable_temporarily';

export interface UserRestrictions {
  idleTimeoutMinutes?: number; // 0 or undefined for no timeout
  accountExpiresOn?: string; // YYYY-MM-DD format
  deactivateAfterInactiveDays?: number; // 0 or undefined for no deactivation
  passwordExpiresDays?: number; // 0 or undefined for no expiry
  lockoutThreshold?: number; // 0 or undefined for no lockout
  maxLogins?: number; // 0 or undefined for unlimited
  lockoutAction?: LockoutAction;
  lockoutDurationMinutes?: number;
  lockoutMessage?: string;
}

export interface PasswordPolicy {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSymbols?: boolean;
}

export type Role = string;

export interface User {
  id: number;
  name: string;
  username: string;
  password?: string;
  status: 'نشط' | 'غير نشط';
  role: Role;
  
  permissions: UserPermissions;
  restrictions: UserRestrictions;
  passwordPolicy?: PasswordPolicy; // Optional for now
  
  // Internal tracking fields (optional)
  loginAttempts?: number;
  lastLogin?: string; // ISO date string
  passwordChangedOn?: string; // ISO date string
  currentLogins?: number;
  lockedOutUntil?: string; // ISO date string
}
