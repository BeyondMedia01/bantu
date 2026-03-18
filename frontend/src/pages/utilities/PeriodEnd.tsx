import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, AlertTriangle, Loader } from 'lucide-react';
import { UtilitiesAPI, PayrollCalendarAPI } from '../../api/client';

const PeriodEnd: React.FC = () => {
  const navigate = useNavigate();
  const [calendars, setCalendars] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    PayrollCalendarAPI.getAll({ isClosed: 'false' }).then((r) => setCalendars(r.data)).catch(() => {});
  }, []);

  const checkStatus = async (id: string) => {
    setSelectedId(id);
    setStatus(null);
    if (!id) return;
    setStatusLoading(true);
    try {
      const res = await UtilitiesAPI.periodEndStatus(id);
      setStatus(res.data);
    } catch {}
    setStatusLoading(false);
  };

  const handleClose = async () => {
    if (!selectedId) return;
    if (!confirm('Close this period? This cannot be undone.')) return;
    setLoading(true);
    setError('');
    try {
      const res = await UtilitiesAPI.periodEnd(selectedId);
      setResult(res.data);
      PayrollCalendarAPI.getAll({ isClosed: 'false' }).then((r) => setCalendars(r.data)).catch(() => {});
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to close period');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold">Period End Processing</h1>
          <p className="text-slate-500 font-medium text-sm">Close a payroll period and finalise all runs</p>
        </div>
      </div>

      {result ? (
        <div className="bg-primary rounded-2xl border border-emerald-200 p-8 shadow-sm">
          <CheckCircle2 size={32} className="text-emerald-500 mb-4" />
          <h3 className="font-bold text-lg mb-2">Period Closed Successfully</h3>
          <div className="text-sm text-slate-600 space-y-1">
            <p>Runs completed: <strong>{result.runsCompleted}</strong></p>
            <p>Repayments marked DUE: <strong>{result.repaymentsMarked}</strong></p>
          </div>
          <button onClick={() => { setResult(null); setStatus(null); setSelectedId(''); }} className="mt-4 text-sm font-bold text-accent-blue hover:underline">
            Close Another Period
          </button>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-6">
          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Select Payroll Period *</label>
            <select
              value={selectedId}
              onChange={(e) => checkStatus(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm"
            >
              <option value="">Choose an open period…</option>
              {calendars.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.periodType} — {new Date(c.startDate).toLocaleDateString()} to {new Date(c.endDate).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {statusLoading && (
            <div className="flex items-center gap-2 text-slate-400"><Loader size={16} className="animate-spin" /> Checking status…</div>
          )}

          {status && (
            <div className={`p-4 rounded-xl border ${status.readyToClose ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {status.readyToClose ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-500" />
                )}
                <p className="font-bold text-sm">
                  {status.readyToClose ? 'Ready to close' : 'Not ready to close'}
                </p>
              </div>
              <div className="text-sm space-y-0.5 text-slate-600">
                <p>Runs in progress: <strong>{status.runsInProgress}</strong></p>
                <p>Unprocessed inputs: <strong>{status.pendingInputs}</strong></p>
              </div>
              {!status.readyToClose && (
                <p className="text-xs text-amber-700 font-medium mt-2">
                  Complete all payroll runs before closing this period.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              disabled={!selectedId || loading || !status?.readyToClose}
              className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-40"
            >
              <Calendar size={16} /> {loading ? 'Closing…' : 'Close Period'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodEnd;
