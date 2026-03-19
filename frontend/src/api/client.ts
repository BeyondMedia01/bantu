import axios from 'axios';
import type { PaginatedResponse, Branch, Department } from '../types/common';

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const stored = localStorage.getItem('apiUrl');
  if (stored) return stored;
  return `http://${window.location.hostname}:5005/api`;
};

const API_BASE_URL = getApiUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export default api;

// ─── Request Interceptor — attach token and companyId ─────────────────────────

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const companyId = localStorage.getItem('activeCompanyId');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (companyId) config.headers['x-company-id'] = companyId;
  return config;
});

// ─── Response Interceptor — handle 401 ────────────────────────────────────────

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('activeCompanyId');
      localStorage.removeItem('activeClientId');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const AuthAPI = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: { name: string; email: string; password: string; licenseToken: string }) =>
    api.post('/auth/register', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
};

export const SetupAPI = {
  check: () => api.get('/setup'),
  init: (data: { name: string; email: string; password: string; clientName: string }) =>
    api.post('/setup', data),
};

export const LicenseValidateAPI = {
  validate: (token: string) => api.post('/license/validate', { token }),
};

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserAPI = {
  me: () => api.get('/user/me'),
  companies: () => api.get('/user/companies'),
};

export const DashboardAPI = {
  reminders: () => api.get<{ birthdays: any[]; anniversaries: any[] }>('/dashboard/reminders'),
};

// ─── Platform — Clients ───────────────────────────────────────────────────────
export interface Client {
  id: string;
  name: string;
  taxId?: string;
  isActive: boolean;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export const ClientAPI = {
  getAll: (params?: Record<string, string>) => api.get<Client[]>('/clients', { params }),
  getById: (id: string) => api.get<Client>(`/clients/${id}`),
  create: (data: Partial<Client>) => api.post<Client>('/clients', data),
  update: (id: string, data: Partial<Client>) => api.put<Client>(`/clients/${id}`, data),
  delete: (id: string) => api.delete(`/clients/${id}`),
};

// ─── Org Structure ────────────────────────────────────────────────────────────
export interface Company {
  id: string;
  clientId: string;
  name: string;
  registrationNumber?: string;
  taxId?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  wcifRate?: number | null;
  sdfRate?: number | null;
  createdAt: string;
  updatedAt: string;
}

export const CompanyAPI = {
  getAll: (params?: Record<string, string>) => api.get<Company[]>('/companies', { params }),
  getById: (id: string) => api.get<Company>(`/companies/${id}`),
  create: (data: Partial<Company>) => api.post<Company>('/companies', data),
  update: (id: string, data: Partial<Company>) => api.put<Company>(`/companies/${id}`, data),
  delete: (id: string) => api.delete(`/companies/${id}`),
};

export const BranchAPI = {
  getAll: (params?: Record<string, string>) => api.get<Branch[]>('/branches', { params }),
  getById: (id: string) => api.get<Branch>(`/branches/${id}`),
  create: (data: Partial<Branch>) => api.post<Branch>('/branches', data),
  update: (id: string, data: Partial<Branch>) => api.put<Branch>(`/branches/${id}`, data),
  delete: (id: string) => api.delete(`/branches/${id}`),
};

export const DepartmentAPI = {
  getAll: (params?: Record<string, string>) => api.get<Department[]>('/departments', { params }),
  getById: (id: string) => api.get<Department>(`/departments/${id}`),
  create: (data: Partial<Department>) => api.post<Department>('/departments', data),
  update: (id: string, data: Partial<Department>) => api.put<Department>(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
};

export const SubCompanyAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/sub-companies', { params }),
  create: (data: any) => api.post('/sub-companies', data),
  update: (id: string, data: any) => api.put(`/sub-companies/${id}`, data),
  delete: (id: string) => api.delete(`/sub-companies/${id}`),
};

import type { Employee } from '../types/employee';

export const EmployeeAPI = {
  getAll: (params?: Record<string, string>) => api.get<PaginatedResponse<Employee>>('/employees', { params }),
  getById: (id: string) => api.get<Employee>(`/employees/${id}`),
  create: (data: Partial<Employee>) => api.post<Employee>('/employees', data),
  update: (id: string, data: Partial<Employee>) => api.put<Employee>(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
  downloadTemplate: (format: 'csv' | 'xlsx') =>
    api.get(`/employees/import/template?format=${format}`, { responseType: 'blob' }),
  importBulk: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ message: string; created: number; failed: { row: number; name: string; reason: string }[] }>(
      '/employees/import', form,
    );
  },
};

export const EmployeeSelfAPI = {
  getProfile: () => api.get('/employee/profile'),
  updateProfile: (data: any) => api.put('/employee/profile', data),
  getPayslips: () => api.get('/employee/payslips'),
  getLeave: () => api.get('/employee/leave'),
};

// ─── Payroll ──────────────────────────────────────────────────────────────────

export const PayrollAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/payroll', { params }), // Backend returns plain array
  getById: (id: string) => api.get<any>(`/payroll/${id}`),
  create: (data: any) => api.post('/payroll', data),
  update: (id: string, data: any) => api.put(`/payroll/${id}`, data),
  delete: (id: string) => api.delete(`/payroll/${id}`),
  submit: (runId: string) => api.post(`/payroll/${runId}/submit`),
  approve: (runId: string) => api.post(`/payroll/${runId}/approve`),
  process: (runId: string) => api.post(`/payroll/${runId}/process`),
  getPayslips: (runId: string) => api.get<any[]>(`/payroll/${runId}/payslips`),
  exportCsv: (runId: string) =>
    api.get(`/payroll/${runId}/export`, { responseType: 'blob' }),
  getPayslipPdfUrl: (runId: string, payslipId: string) =>
    `${API_BASE_URL}/payroll/${runId}/payslips/${payslipId}/pdf`,
};

export const PayslipAPI = {
  getAll: (params?: Record<string, string>) => api.get<PaginatedResponse<any>>('/payslips', { params }), // Paginated
  getById: (id: string) => api.get<any>(`/payslips/${id}`),
};

export const PayrollCalendarAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/payroll-calendar', { params }),
  getById: (id: string) => api.get(`/payroll-calendar/${id}`),
  create: (data: any) => api.post('/payroll-calendar', data),
  update: (id: string, data: any) => api.put(`/payroll-calendar/${id}`, data),
  close: (id: string) => api.post(`/payroll-calendar/${id}/close`),
  delete: (id: string) => api.delete(`/payroll-calendar/${id}`),
};

export const PayrollInputAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/payroll-inputs', { params }),
  create: (data: any) => api.post('/payroll-inputs', data),
  update: (id: string, data: any) => api.put(`/payroll-inputs/${id}`, data),
  delete: (id: string) => api.delete(`/payroll-inputs/${id}`),
};

export const TransactionCodeAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/transactions', { params }),
  getById: (id: string) => api.get(`/transactions/${id}`),
  create: (data: any) => api.post('/transactions', data),
  update: (id: string, data: any) => api.put(`/transactions/${id}`, data),
  delete: (id: string) => api.delete(`/transactions/${id}`),
  import: (rows: any[]) => api.post('/transactions/import', { rows }),
  getEmployeeTransactions: (employeeId: string) => api.get(`/transactions/employee/${employeeId}`),
  addEmployeeTransaction: (employeeId: string, data: any) => api.post(`/transactions/employee/${employeeId}`, data),
  updateEmployeeTransaction: (id: string, data: any) => api.put(`/transactions/employee/${id}`, data),
  deleteEmployeeTransaction: (id: string) => api.delete(`/transactions/employee/${id}`),
  addRule: (codeId: string, data: any) => api.post(`/transactions/${codeId}/rules`, data),
  updateRule: (codeId: string, ruleId: string, data: any) => api.put(`/transactions/${codeId}/rules/${ruleId}`, data),
  deleteRule: (codeId: string, ruleId: string) => api.delete(`/transactions/${codeId}/rules/${ruleId}`),
};

export const RetroactivePayAPI = {
  getEmployees: () => api.get<any[]>('/retroactive/employees'),
  calculate: (data: any) => api.post('/retroactive/calculate', data),
  apply: (data: any) => api.post('/retroactive/apply', data),
  getHistory: () => api.get<any[]>('/retroactive/history'),
};

export const PortalExportAPI = {
  downloadZimra: (params?: Record<string, string>) => 
    api.get('/portals/zimra', { params, responseType: 'blob' }),
  downloadNssa: (params?: Record<string, string>) => 
    api.get('/portals/nssa', { params, responseType: 'blob' }),
  downloadP4A: (year: number) => 
    api.get(`/portals/nssa/p4a`, { params: { year: String(year) }, responseType: 'blob' }),
  downloadPSL8: (employeeId: string) => 
    api.get(`/portals/psl8/${employeeId}`, { responseType: 'blob' }),
};

export const TaxTableAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/tax-tables', { params }),
  getById: (id: string) => api.get(`/tax-tables/${id}`),
  create: (data: any) => api.post('/tax-tables', data),
  update: (id: string, data: any) => api.put(`/tax-tables/${id}`, data),
  delete: (id: string) => api.delete(`/tax-tables/${id}`),
  getBrackets: (id: string) => api.get(`/tax-tables/${id}/brackets`),
  createBracket: (id: string, data: any) => api.post(`/tax-tables/${id}/brackets`, data),
  updateBracket: (tableId: string, bracketId: string, data: any) =>
    api.put(`/tax-tables/${tableId}/brackets/${bracketId}`, data),
  deleteBracket: (tableId: string, bracketId: string) =>
    api.delete(`/tax-tables/${tableId}/brackets/${bracketId}`),
  replaceBrackets: (id: string, brackets: any[]) =>
    api.post(`/tax-tables/${id}/brackets/replace`, { brackets }),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/tax-tables/${id}/upload`, form);
  },
};

export const GradeAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/grades', { params }),
  getById: (id: string) => api.get(`/grades/${id}`),
  create: (data: any) => api.post('/grades', data),
  update: (id: string, data: any) => api.put(`/grades/${id}`, data),
  delete: (id: string) => api.delete(`/grades/${id}`),
};

// ─── Leave ────────────────────────────────────────────────────────────────────

export const LeaveAPI = {
  getAll: (params?: Record<string, string>) => api.get<{ records: any[]; requests: any[] }>('/leave', { params }),
  getById: (id: string) => api.get(`/leave/${id}`),
  create: (data: any) => api.post('/leave', data),
  update: (id: string, data: any) => api.put(`/leave/${id}`, data),
  delete: (id: string) => api.delete(`/leave/${id}`),
  approve: (id: string, note?: string) => api.put(`/leave/request/${id}/approve`, { note }),
  reject: (id: string, note?: string) => api.put(`/leave/request/${id}/reject`, { note }),
};

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  accrualRate: number;
  accrualPeriod: string;
  maxCarryOver: number;
  maxAccumulation: number;
  encashable: boolean;
  encashmentRate: number | null;
  requiresApproval: boolean;
  isActive: boolean;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  accruedDays: number;
  broughtForward: number;
  usedDays: number;
  encashedDays: number;
  carriedOver: number;
  leaveType: LeaveType;
}

export interface LeaveEncashment {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  days: number;
  dailyRate: number;
  totalAmount: number;
  status: 'PENDING' | 'APPROVED' | 'PROCESSED' | 'REJECTED';
  requestDate: string;
  processedAt?: string;
  notes?: string;
  employee?: { firstName: string; lastName: string; employeeCode: string };
  leaveType?: LeaveType;
}

export const LeaveManagementAPI = {
  getLeaveTypes: () => api.get<LeaveType[]>('/leave/types'),
  createLeaveType: (data: Partial<LeaveType>) => api.post<LeaveType>('/leave/types', data),
  updateLeaveType: (id: string, data: Partial<LeaveType>) => api.put<LeaveType>(`/leave/types/${id}`, data),
  getEmployeeBalances: (employeeId: string) => api.get<LeaveBalance[]>(`/leave/balances/${employeeId}`),
  runAccrual: (year?: number, month?: number) => api.post('/leave/accrue', { year, month }),
  requestEncashment: (data: { employeeId: string; leaveTypeId: string; days: number; notes?: string }) =>
    api.post<LeaveEncashment>('/leave/encash', data),
  getEncashments: (params?: { status?: string; employeeId?: string }) =>
    api.get<LeaveEncashment[]>('/leave/encashments', { params }),
  approveEncashment: (id: string) => api.post(`/leave/encash/${id}/approve`),
  processEncashment: (id: string) => api.post(`/leave/encash/${id}/process`),
  runYearEnd: (fromYear?: number, toYear?: number) => api.post('/leave/year-end', { fromYear, toYear }),
};

// ─── Loans ────────────────────────────────────────────────────────────────────

export const LoanAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/loans', { params }),
  getById: (id: string) => api.get(`/loans/${id}`),
  create: (data: any) => api.post('/loans', data),
  update: (id: string, data: any) => api.put(`/loans/${id}`, data),
  delete: (id: string) => api.delete(`/loans/${id}`),
  getRepayments: (id: string) => api.get(`/loans/${id}/repayments`),
  markRepaymentPaid: (repaymentId: string) =>
    api.patch(`/loans/repayments/${repaymentId}`),
};

// ─── License Management ───────────────────────────────────────────────────────

export interface LicenseStatus {
  valid: boolean;
  expiresAt: string;
  active: boolean;
  employeeCap: number;
  employeeCount: number;
  clientName: string;
}

export const LicenseAPI = {
  getStatus: () => api.get<LicenseStatus>('/license/status'),
  getAll: () => api.get('/license'),
  issue: (clientId: string, expiryMonths?: number) =>
    api.post('/license/issue', { clientId, expiryMonths }),
  revoke: (clientId: string) => api.post('/license/revoke', { clientId }),
  reactivate: (clientId: string, expiryMonths?: number) =>
    api.post('/license/reactivate', { clientId, expiryMonths }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const AdminAPI = {
  getUsers: (params?: Record<string, string>) => api.get('/admin/users', { params }),
  getUserById: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (data: any) => api.post('/admin/users', data),
  updateUser: (id: string, data: any) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  changeRole: (id: string, role: string) => api.post(`/admin/users/${id}/role`, { role }),
  getSettings: () => api.get('/admin/settings'),
  updateSetting: (settingName: string, settingValue: string) =>
    api.put('/admin/settings', { settingName, settingValue }),
  getStats: () => api.get('/admin/stats'),
  getLogs: (params?: Record<string, string>) =>
    api.get<{ logs: AuditLog[]; total: number; page: number; limit: number }>('/admin/logs', { params }),
};

export interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export const ReportsAPI = {
  payslips: (params: Record<string, string>) => api.get('/reports/payslips', { params }),
  tax: (params: Record<string, string>) => api.get('/reports/tax', { params }),
  leave: (params?: Record<string, string>) => api.get('/reports/leave', { params }),
  loans: (params?: Record<string, string>) => api.get('/reports/loans', { params }),
  departments: () => api.get('/reports/departments'),
  journals: (params: Record<string, string>) => api.get('/reports/journals', { params }),
  summary: () => api.get('/reports/summary'),
  payrollTrend: () => api.get<{ name: string; netPay: number; grossPay: number; headcount: number }[]>('/reports/payroll-trend'),
};

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const SubscriptionAPI = {
  get: () => api.get('/subscription'),
  usage: () => api.get('/subscription/usage'),
  create: (plan: string, billingCycle?: string) =>
    api.post('/subscription/create', { plan, billingCycle }),
  upgrade: (plan: string) => api.post('/subscription/upgrade', { plan }),
  portal: () => api.get('/subscription/portal'),
};

// ─── NSSA Settings ────────────────────────────────────────────────────────────

export interface NSSASettings {
  employeeRate: number;
  employerRate: number;
  ceilingUSD: number;
}

export const NSSASettingsAPI = {
  get: () => api.get<NSSASettings>('/nssa-settings'),
  update: (data: NSSASettings) => api.put<{ message: string }>('/nssa-settings', data),
};

// ─── Currency Rates ───────────────────────────────────────────────────────────

export const CurrencyRateAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/currency-rates', { params }),
  create: (data: any) => api.post('/currency-rates', data),
  update: (id: string, data: any) => api.put(`/currency-rates/${id}`, data),
  delete: (id: string) => api.delete(`/currency-rates/${id}`),
};

// ─── NEC Tables ───────────────────────────────────────────────────────────────

export const NecTableAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/nec-tables', { params }),
  create: (data: any) => api.post('/nec-tables', data),
  getById: (id: string) => api.get<any>(`/nec-tables/${id}`),
  update: (id: string, data: any) => api.put(`/nec-tables/${id}`, data),
  delete: (id: string) => api.delete(`/nec-tables/${id}`),
  getGrades: (tableId: string) => api.get<any[]>(`/nec-tables/${tableId}/grades`),
  createGrade: (tableId: string, data: any) => api.post(`/nec-tables/${tableId}/grades`, data),
  updateGrade: (tableId: string, gradeId: string, data: any) =>
    api.put(`/nec-tables/${tableId}/grades/${gradeId}`, data),
  deleteGrade: (tableId: string, gradeId: string) =>
    api.delete(`/nec-tables/${tableId}/grades/${gradeId}`),
};

// ─── Utilities ────────────────────────────────────────────────────────────────

export const UtilitiesAPI = {
  payIncrease: (data: any) => api.post('/payincrease', data),
  backPay: (data: any) => api.post('/backpay', data),
  periodEndStatus: (payrollCalendarId: string) =>
    api.get('/period-end/status', { params: { payrollCalendarId } }),
  periodEnd: (payrollCalendarId: string) =>
    api.post('/period-end', { payrollCalendarId }),
};

// ─── Intelligence ─────────────────────────────────────────────────────────────

export const IntelligenceAPI = {
  getAlerts: (companyId: string) => api.get('/intelligence/alerts', { params: { companyId } }),
  getFraud: (companyId: string) => api.get('/intelligence/fraud', { params: { companyId } }),
};
