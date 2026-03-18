import { useState } from 'react';
import { Save, Server, X } from 'lucide-react';

interface ApiSettingsProps {
  onClose: () => void;
}

export function ApiSettings({ onClose }: ApiSettingsProps) {
  const [apiUrl, setApiUrl] = useState(() => {
    return localStorage.getItem('apiUrl') || 'http://localhost:5005/api';
  });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = () => {
    localStorage.setItem('apiUrl', apiUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(apiUrl.replace('/api', ''));
      if (response.ok) {
        setTestResult({ success: true, message: 'Connection successful!' });
      } else {
        setTestResult({ success: false, message: `Server returned ${response.status}` });
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Cannot connect to server. Is it running?' });
    }
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold">Server Configuration</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Backend API URL
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:5005/api"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                         dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500">
              Include /api at the end (e.g., http://localhost:5005/api)
            </p>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {testResult.message}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg
                         hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saved ? 'Saved!' : 'Save'}
            </button>
          </div>

          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
            <p className="font-medium text-gray-700 dark:text-gray-300">For Desktop App:</p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Make sure the backend server is running before logging in.
            </p>
            <code className="block mt-2 text-xs bg-gray-200 dark:bg-gray-600 p-2 rounded">
              cd backend && npm run dev
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiSettings;
