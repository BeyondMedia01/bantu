export interface AuthUser {
  userId: string;
  name: string;
  email: string;
  role: 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'EMPLOYEE';
  clientId?: string;
  companyId?: string;
  employeeId?: string;
  exp?: number;
}

function parseJwt(token: string): AuthUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as AuthUser;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function getUser(): AuthUser | null {
  const token = getToken();
  if (!token) return null;
  const user = parseJwt(token);
  if (!user) return null;
  // Check expiry
  if (user.exp && user.exp * 1000 < Date.now()) {
    logout();
    return null;
  }
  return user;
}

export function isAuthenticated(): boolean {
  return getUser() !== null;
}

export function getUserRole(): AuthUser['role'] | null {
  return getUser()?.role ?? null;
}

export function logout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('activeCompanyId');
  localStorage.removeItem('activeClientId');
}

export function saveAuthData(token: string, companyId?: string): void {
  localStorage.setItem('token', token);
  if (companyId) localStorage.setItem('activeCompanyId', companyId);
}
