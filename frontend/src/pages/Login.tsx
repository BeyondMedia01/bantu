import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Settings, Server, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AuthAPI } from '../api/client';
import { saveAuthData } from '../lib/auth';
import ApiSettings from '../components/ApiSettings';
import ServerControl from '../components/ServerControl';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showServerControl, setShowServerControl] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ running: boolean; pid?: number } | null>(null);
  const [checkingServer, setCheckingServer] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const deviceId = localStorage.getItem('deviceId');
      const res = await AuthAPI.login({ email, password, deviceId: deviceId || undefined });
      const { token, companyId, role } = res.data;
      saveAuthData(token, companyId);

      if (role === 'PLATFORM_ADMIN') navigate('/admin');
      else if (role === 'EMPLOYEE') navigate('/employee');
      else navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkServer = async () => {
      try {
        const result = await invoke<{ running: boolean; pid?: number }>('get_server_status');
        setServerStatus(result);
        
        // Auto-start server if not running
        if (!result.running) {
          await invoke('start_backend');
          const newStatus = await invoke<{ running: boolean; pid?: number }>('get_server_status');
          setServerStatus(newStatus);
        }
      } catch (error) {
        console.log('Server control not available (running in browser)');
      }
      setCheckingServer(false);
    };
    
    checkServer();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 bg-accent-blue rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">B</div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Bantu Payroll</h1>
      </div>

      {/* Server Status Indicator */}
      <div className="mb-6 flex items-center gap-3">
        {checkingServer ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Starting server...</span>
          </div>
        ) : serverStatus?.running ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-600 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">Server running</span>
            <button
              onClick={() => setShowServerControl(true)}
              className="p-1 hover:bg-green-100 rounded"
            >
              <Server size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-sm font-medium">Server not running</span>
            <button
              onClick={() => setShowServerControl(true)}
              className="p-1 hover:bg-red-100 rounded"
            >
              <Server size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="w-full max-w-[440px] bg-primary rounded-2xl border border-border shadow-sm p-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Welcome back</h2>
            <p className="text-slate-500 font-medium">Please enter your details to continue</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Server Settings"
          >
            <Settings size={20} className="text-slate-400" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-btn-primary text-navy py-4 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In To Dashboard'}
            <ArrowRight size={18} />
          </button>

          <div className="flex items-center justify-between text-sm mt-1">
            <p className="font-medium text-slate-500">
              Don't have an account?
              <Link to="/register" className="ml-2 font-bold text-accent-blue hover:underline">Register</Link>
            </p>
            <Link to="/forgot-password" className="font-bold text-slate-400 hover:text-navy transition-colors">
              Forgot password?
            </Link>
          </div>
          <p className="text-center text-xs text-slate-400">
            First time? <Link to="/setup" className="font-bold text-accent-blue hover:underline">Platform Setup</Link>
          </p>
        </form>
      </div>

      <div className="mt-10 flex items-center gap-8 text-slate-400 font-bold text-xs uppercase tracking-[0.2em]">
        <span>Contact</span>
        <span>Privacy</span>
        <span>Terms</span>
      </div>

      {showSettings && <ApiSettings onClose={() => setShowSettings(false)} />}
      {showServerControl && <ServerControl onClose={() => setShowServerControl(false)} />}
    </div>
  );
};

export default Login;
