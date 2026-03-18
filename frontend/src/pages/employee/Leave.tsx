import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader, Clock, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { EmployeeSelfAPI, LeaveAPI } from '../../api/client';

const statusColor: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-700',
};

const statusIcon: Record<string, React.ReactNode> = {
  APPROVED: <CheckCircle2 size={12} />,
  REJECTED: <XCircle size={12} />,
  PENDING: <Clock size={12} />,
};

const EmployeeLeave: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'history' | 'apply'>('history');
  const [form, setForm] = useState({ startDate: '', endDate: '', days: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const load = () => {
    EmployeeSelfAPI.getLeave()
      .then((r) => {
        setRecords(r.data.records || []);
        setRequests(r.data.requests || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess(false);
    setSubmitting(true);
    try {
      await LeaveAPI.create({ ...form, days: parseFloat(form.days) });
      setSubmitSuccess(true);
      setForm({ startDate: '', endDate: '', days: '', reason: '' });
      setTab('history');
      load();
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const allItems = [...records, ...requests].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Leave</h1>
          <p className="text-slate-500 text-sm font-medium">View your leave history and submit requests</p>
        </div>
        <button
          onClick={() => setTab(tab === 'apply' ? 'history' : 'apply')}
          className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90"
        >
          <Plus size={16} /> {tab === 'apply' ? 'View History' : 'Apply for Leave'}
        </button>
      </div>

      {tab === 'apply' ? (
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-5">Leave Request</h3>
          {submitError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{submitError}</div>}
          {submitSuccess && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">Request submitted successfully</div>}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Start Date <span className="text-red-400">*</span></label>
                <input type="date" required value={form.startDate} onChange={set('startDate')}
                  className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">End Date <span className="text-red-400">*</span></label>
                <input type="date" required value={form.endDate} onChange={set('endDate')}
                  className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Number of Days <span className="text-red-400">*</span></label>
              <input type="number" required min="0.5" step="0.5" value={form.days} onChange={set('days')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Reason</label>
              <textarea value={form.reason} onChange={set('reason')} rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60 w-fit">
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : allItems.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-primary rounded-2xl border border-border">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No leave history found</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Type', 'Start Date', 'End Date', 'Days', 'Status', 'Notes'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allItems.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm font-medium capitalize">
                    {(r.type || 'Annual')?.toLowerCase().replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-sm">{new Date(r.startDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm">{new Date(r.endDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm font-bold">{r.totalDays ?? r.days}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${statusColor[r.status] || 'bg-slate-100 text-slate-600'}`}>
                      {statusIcon[r.status]} {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{r.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmployeeLeave;
