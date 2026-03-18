import { invoke } from '@tauri-apps/api/core';
import { fetch } from '@tauri-apps/plugin-http';
import axios from 'axios';

export interface SyncStatus {
  last_synced: string | null;
  is_online: boolean;
  pending_changes: number;
}

export interface PendingChange {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  data: any;
  timestamp: string;
  retries: number;
}

export interface SyncConfig {
  apiUrl: string;
  syncInterval: number;
  batchSize: number;
}

class SyncService {
  private config: SyncConfig | null = null;
  private syncIntervalId: number | null = null;
  private pendingChanges: PendingChange[] = [];
  private isOnline: boolean = navigator.onLine;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  constructor() {
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  private async handleOnline() {
    this.isOnline = true;
    await invoke('set_online_status', { online: true });
    await this.sync();
    this.notifyListeners();
  }

  private handleOffline() {
    this.isOnline = false;
    invoke('set_online_status', { online: false });
    this.notifyListeners();
  }

  async initialize(config: SyncConfig) {
    this.config = config;
    await invoke('set_api_url', { url: config.apiUrl });
    await this.loadPendingChanges();
    
    if (config.syncInterval > 0) {
      this.startAutoSync(config.syncInterval);
    }
  }

  private startAutoSync(intervalMs: number) {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    this.syncIntervalId = window.setInterval(() => {
      if (this.isOnline) {
        this.sync();
      }
    }, intervalMs);
  }

  async getStatus(): Promise<SyncStatus> {
    return invoke<SyncStatus>('get_sync_status');
  }

  async trackChange(
    type: 'create' | 'update' | 'delete',
    entity: string,
    data: any
  ): Promise<void> {
    const change: PendingChange = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      entity,
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
    };

    this.pendingChanges.push(change);
    await this.savePendingChanges();
    await invoke('increment_pending_changes');
    this.notifyListeners();

    if (this.isOnline && this.config) {
      await this.sync();
    }
  }

  private async loadPendingChanges() {
    try {
      const stored = localStorage.getItem('pending_changes');
      if (stored) {
        this.pendingChanges = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load pending changes:', error);
      this.pendingChanges = [];
    }
  }

  private async savePendingChanges() {
    localStorage.setItem('pending_changes', JSON.stringify(this.pendingChanges));
  }

  async sync(): Promise<{ success: boolean; synced: number; failed: number }> {
    if (!this.config) {
      return { success: false, synced: 0, failed: 0 };
    }

    if (!this.isOnline || this.pendingChanges.length === 0) {
      return { success: true, synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;
    const failedChanges: PendingChange[] = [];

    for (const change of this.pendingChanges) {
      try {
        await this.syncChange(change);
        synced++;
      } catch (error) {
        failed++;
        change.retries++;
        if (change.retries < 3) {
          failedChanges.push(change);
        }
      }
    }

    this.pendingChanges = failedChanges;
    await this.savePendingChanges();
    
    if (synced > 0) {
      await invoke('set_last_synced', { timestamp: new Date().toISOString() });
    }
    
    if (failed === 0) {
      await invoke('clear_pending_changes');
    }

    this.notifyListeners();
    return { success: failed === 0, synced, failed };
  }

  private async syncChange(change: PendingChange): Promise<void> {
    if (!this.config) throw new Error('Sync not configured');

    const endpoint = this.getEndpoint(change.entity, change.type, change.data);
    const token = localStorage.getItem('token');
    const companyId = localStorage.getItem('activeCompanyId');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (companyId) headers['x-company-id'] = companyId;

    let response: Response;

    switch (change.type) {
      case 'create':
        response = await fetch(`${this.config.apiUrl}${endpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(change.data),
        });
        break;
      case 'update':
        response = await fetch(`${this.config.apiUrl}${endpoint}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(change.data),
        });
        break;
      case 'delete':
        response = await fetch(`${this.config.apiUrl}${endpoint}`, {
          method: 'DELETE',
          headers,
        });
        break;
      default:
        throw new Error(`Unknown change type: ${change.type}`);
    }

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }
  }

  private getEndpoint(entity: string, type: string, data: any): string {
    const base = '/api';
    
    switch (entity) {
      case 'employee':
        return type === 'create' || type === 'update' 
          ? `${base}/employees${type === 'update' ? `/${data.id}` : ''}`
          : `${base}/employees/${data.id}`;
      case 'payroll':
        return type === 'create' || type === 'update'
          ? `${base}/payroll${type === 'update' ? `/${data.id}` : ''}`
          : `${base}/payroll/${data.id}`;
      case 'leave':
        return type === 'create' || type === 'update'
          ? `${base}/leave${type === 'update' ? `/${data.id}` : ''}`
          : `${base}/leave/${data.id}`;
      case 'loan':
        return type === 'create' || type === 'update'
          ? `${base}/loans${type === 'update' ? `/${data.id}` : ''}`
          : `${base}/loans/${data.id}`;
      default:
        return `${base}/${entity}${type === 'update' || type === 'delete' ? `/${data.id}` : ''}`;
    }
  }

  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.getStatus().then(status => {
      this.listeners.forEach(callback => callback(status));
    });
  }

  isOnlineStatus(): boolean {
    return this.isOnline;
  }

  destroy() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}

export const syncService = new SyncService();
export default syncService;
