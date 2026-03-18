import React, { useEffect, useState } from 'react';
import { Plus, FileText, ChevronRight, Loader, Play, Check, SendHorizonal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PayrollAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

const Payroll: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const loadRuns = () => {
    PayrollAPI.getAll()
      .then((r: any) => {
        const data = r.data;
        setRuns(data.data || data);
        setTotal(data.total || (data.data || data).length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRuns(); }, [getActiveCompanyId()]);

  const handleAction = async (e: React.MouseEvent, action: 'submit' | 'approve' | 'process', runId: string) => {
    e.stopPropagation();
    setActionLoading(runId + action);
    try {
      if (action === 'submit') await PayrollAPI.submit(runId);
      else if (action === 'approve') await PayrollAPI.approve(runId);
      else await PayrollAPI.process(runId);
      setActionError('');
      loadRuns();
    } catch (err: any) {
      setActionError(err.response?.data?.message || `Failed to ${action} payroll run`);
    } finally { setActionLoading(null); }
  };

  const statusColor: Record<string, string> = {
    COMPLETED: 'bg-emerald-50 text-emerald-700',
    PROCESSING: 'bg-blue-50 text-blue-700',
    DRAFT: 'bg-slate-100 text-slate-600',
    ERROR: 'bg-red-50 text-red-700',
    PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
    APPROVED: 'bg-teal-50 text-teal-700',
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Payroll</h2>
          <p className="text-slate-500 font-medium text-sm">{total} payroll runs</p>
        </div>
        <button
          onClick={() => navigate('/payroll/new')}
          className="bg-btn-primary text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-2"
        >
          <Plus size={18} /> New Payroll Run
        </button>
      </header>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{actionError}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 bg-primary rounded-2xl border border-border shadow-sm">
          <FileText size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="font-bold text-slate-500 mb-2">No payroll runs yet</p>
          <p className="text-sm text-slate-400 mb-6">Create your first payroll run to get started</p>
          <button onClick={() => navigate('/payroll/new')} className="bg-btn-primary text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 inline-flex items-center gap-2">
            <Plus size={16} /> Create Payroll Run
          </button>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Period', 'Run Date', 'Currency', 'Employees', 'Status', ''].map((h) => (
                  <th key={h} className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run: any) => (
                <tr
                  key={run.id}
                  className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/payroll/${run.id}/payslips`)}
                >
                  <td className="px-5 py-4">
                    <p className="font-bold text-sm">{new Date(run.startDate).toLocaleDateString()}</p>
                    <p className="text-xs text-slate-400">to {new Date(run.endDate).toLocaleDateString()}</p>
                  </td>
                  <td className="px-5 py-4 text-sm">{new Date(run.runDate).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-sm font-bold">
                    {run.dualCurrency ? (
                      <span className="text-blue-600">USD + ZiG</span>
                    ) : run.currency}
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {run.status === 'COMPLETED'
                      ? (run._count?.payslips ?? run.payslipCount ?? '—')
                      : (run.employeeCount ?? run._count?.payslips ?? '—')}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusColor[run.status] || 'bg-slate-100 text-slate-600'}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {run.status === 'DRAFT' && (
                        <button
                          onClick={(e) => handleAction(e, 'submit', run.id)}
                          disabled={actionLoading === run.id + 'submit'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-50 text-amber-700 rounded-full hover:bg-amber-100 disabled:opacity-50"
                          title="Submit for Approval"
                        >
                          <SendHorizonal size={12} /> Submit
                        </button>
                      )}
                      {run.status === 'PENDING_APPROVAL' && (
                        <button
                          onClick={(e) => handleAction(e, 'approve', run.id)}
                          disabled={actionLoading === run.id + 'approve'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 disabled:opacity-50"
                          title="Approve"
                        >
                          <Check size={12} /> Approve
                        </button>
                      )}
                      {(run.status === 'DRAFT' || run.status === 'APPROVED' || run.status === 'ERROR') && (
                        <button
                          onClick={(e) => handleAction(e, 'process', run.id)}
                          disabled={actionLoading === run.id + 'process'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 disabled:opacity-50"
                          title="Process Payroll"
                        >
                          <Play size={12} /> Process
                        </button>
                      )}
                      <ChevronRight size={16} className="text-slate-400 ml-1" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Payroll;
