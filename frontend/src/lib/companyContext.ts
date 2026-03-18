export function getActiveCompanyId(): string | null {
  return localStorage.getItem('activeCompanyId');
}

export function setActiveCompanyId(id: string): void {
  localStorage.setItem('activeCompanyId', id);
  window.dispatchEvent(new CustomEvent('activeCompanyChanged'));
}

export function clearActiveCompanyId(): void {
  localStorage.removeItem('activeCompanyId');
}

export function getActiveClientId(): string | null {
  return localStorage.getItem('activeClientId');
}

export function setActiveClientId(id: string): void {
  localStorage.setItem('activeClientId', id);
}
