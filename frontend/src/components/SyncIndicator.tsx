import { useState } from 'react';
import { CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { useSync } from '../hooks/useSync';

interface SyncIndicatorProps {
  className?: string;
  showDetails?: boolean;
  position?: 'fixed' | 'static';
}

export function SyncIndicator({ 
  className = '', 
  showDetails = false,
  position = 'fixed'
}: SyncIndicatorProps) {
  const { status, isSyncing, sync } = useSync();
  const [showDropdown, setShowDropdown] = useState(false);

  const formatLastSynced = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const handleSync = async () => {
    if (!isSyncing) {
      await sync();
    }
  };

  const statusColor = !status.is_online 
    ? 'text-gray-500' 
    : status.pending_changes > 0 
      ? 'text-amber-500' 
      : 'text-emerald-500';

  const StatusIcon = !status.is_online 
    ? CloudOff 
    : status.pending_changes > 0 
      ? AlertCircle 
      : Check;

  const statusText = !status.is_online 
    ? 'Offline' 
    : status.pending_changes > 0 
      ? `${status.pending_changes} pending` 
      : 'Synced';

  return (
    <div className={`${position} top-4 right-4 z-50 ${className}`}>
      <div className="relative">
        <button
          onClick={() => showDetails && setShowDropdown(!showDropdown)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 
            shadow-lg border border-gray-200 dark:border-gray-700
            transition-all duration-200 hover:shadow-xl
            ${isSyncing ? 'animate-pulse' : ''}
          `}
        >
          <div className={`${statusColor} transition-colors`}>
            {isSyncing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <StatusIcon className="w-4 h-4" />
            )}
          </div>
          
          <span className={`text-sm font-medium ${statusColor}`}>
            {isSyncing ? 'Syncing...' : statusText}
          </span>
          
          {showDetails && (
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          )}
        </button>

        {showDetails && showDropdown && (
          <div className="absolute right-0 mt-2 w-64 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
                <span className={`text-sm font-medium ${statusColor}`}>{statusText}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Last Synced</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {formatLastSynced(status.last_synced)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Pending Changes</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {status.pending_changes}
                </span>
              </div>
              
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleSync}
                  disabled={isSyncing || !status.is_online}
                  className={`
                    w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md
                    transition-colors
                    ${isSyncing || !status.is_online
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                    }
                  `}
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default SyncIndicator;
