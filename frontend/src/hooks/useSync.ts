import { useState, useEffect, useCallback } from 'react';
import syncService from '../lib/sync';
import type { SyncStatus } from '../lib/sync';

interface UseSyncOptions {
  autoSync?: boolean;
  syncInterval?: number;
}

export function useSync(options: UseSyncOptions = {}) {
  const [status, setStatus] = useState<SyncStatus>({
    last_synced: null,
    is_online: true,
    pending_changes: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const initSync = async () => {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';
      await syncService.initialize({
        apiUrl: `${apiUrl}/sync`,
        syncInterval: options.syncInterval || 30000,
        batchSize: 50,
      });
      
      const currentStatus = await syncService.getStatus();
      setStatus(currentStatus);
    };

    if (options.autoSync !== false) {
      initSync();
    }
  }, [options.autoSync, options.syncInterval]);

  useEffect(() => {
    const unsubscribe = syncService.subscribe(setStatus);
    return unsubscribe;
  }, []);

  const sync = useCallback(async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    try {
      await syncService.sync();
      const newStatus = await syncService.getStatus();
      setStatus(newStatus);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  const trackChange = useCallback(async (
    type: 'create' | 'update' | 'delete',
    entity: string,
    data: any
  ) => {
    await syncService.trackChange(type, entity, data);
    const newStatus = await syncService.getStatus();
    setStatus(newStatus);
  }, []);

  return {
    status,
    isSyncing,
    isOnline: status.is_online,
    hasPendingChanges: status.pending_changes > 0,
    lastSynced: status.last_synced,
    sync,
    trackChange,
  };
}

export default useSync;
