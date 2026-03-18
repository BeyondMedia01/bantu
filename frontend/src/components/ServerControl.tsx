import { useState } from 'react';
import { Save, Server, X, Play, Square, Loader2, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface ServerControlProps {
  onClose: () => void;
}

export function ServerControl({ onClose }: ServerControlProps) {
  const [status, setStatus] = useState<{ running: boolean; pid?: number; path?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const checkStatus = async () => {
    try {
      const result = await invoke<{ running: boolean; pid?: number; path?: string; error?: string }>('get_server_status');
      setStatus(result);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else if (!result.running) {
        setMessage({ type: 'info', text: 'Server is not running. Click Start to launch it.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Cannot connect to server control. Running in browser mode.' });
    }
  };

  const startServer = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await invoke<{ running: boolean; pid?: number; path?: string; error?: string }>('start_backend');
      setStatus(result);
      if (result.running) {
        setMessage({ type: 'success', text: 'Server started! Wait a few seconds for it to be ready.' });
      } else if (result.error) {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: String(error) });
    }
    setLoading(false);
  };

  const stopServer = async () => {
    setLoading(true);
    try {
      await invoke('stop_backend');
      setStatus({ running: false });
      setMessage({ type: 'success', text: 'Server stopped' });
    } catch (error) {
      setMessage({ type: 'error', text: String(error) });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold">Backend Server</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div>
              <p className="font-medium">Server Status</p>
              <p className="text-sm text-gray-500">
                {status === null ? 'Checking...' : status.running ? `Running (PID: ${status.pid})` : 'Stopped'}
              </p>
              {status?.path && (
                <p className="text-xs text-gray-400 mt-1 truncate max-w-[200px]">
                  Path: {status.path}
                </p>
              )}
            </div>
            <div className={`w-3 h-3 rounded-full ${status?.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          </div>

          {/* Messages */}
          {message && (
            <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
              message.type === 'success' ? 'bg-green-100 text-green-700' : 
              message.type === 'error' ? 'bg-red-100 text-red-700' : 
              'bg-blue-100 text-blue-700'
            }`}>
              {message.type === 'error' && <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={checkStatus}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Check Status
            </button>
            
            {!status?.running ? (
              <button
                onClick={startServer}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg
                           hover:bg-green-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start Server
              </button>
            ) : (
              <button
                onClick={stopServer}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg
                           hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                Stop Server
              </button>
            )}
          </div>

          {/* Help */}
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-300">Backend Not Found?</p>
            <p className="text-amber-600 dark:text-amber-400 mt-1">
              The app needs to be in the project folder next to the <code className="bg-amber-100 dark:bg-amber-800 px-1 rounded">backend</code> folder:
            </p>
            <div className="mt-2 text-xs font-mono bg-amber-100 dark:bg-amber-800 p-2 rounded">
              Bantu copy/<br/>
              ├── backend/    ← needs this<br/>
              └── bantu-payroll.app  ← or here
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ServerControl;
