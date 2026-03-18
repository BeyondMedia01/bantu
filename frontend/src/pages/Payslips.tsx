import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Loader } from 'lucide-react';
import { PayrollAPI, api } from '../api/client';

const fmt = (n: number | null | undefined, decimals = 2) =>
  n != null ? n.toFixed(decimals) : '—';

const Payslips: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    Promise.all([PayrollAPI.getById(runId), PayrollAPI.getPayslips(runId)])
      .then(([r, p]) => { setRun(r.data); setPayslips(p.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  const handleExport = async () => {
    if (!runId) return;
    try {
      const res = await PayrollAPI.exportCsv(runId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${runId}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleDownloadPdf = async (payslipId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/payroll/${runId}/payslips/${payslipId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${payslipId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      alert('Failed to download PDF');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader size={24} className="animate-spin" />
    </div>
  );

  const isDual = run?.dualCurrency;
  const ccy = run?.currency || 'USD';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/payroll')} className="p-2 hover:bg-slate-100 rounded-xl">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Payslips</h1>
            {run && (
              <p className="text-slate-500 font-medium text-sm">
                {new Date(run.startDate).toLocaleDateString()} – {new Date(run.endDate).toLocaleDateString()}
                {' · '}
                {isDual ? (
                  <span className="font-bold text-blue-600">USD + ZiG (Dual Currency)</span>
                ) : ccy}
                {' · '}{run.status}
              </p>
            )}
          </div>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-border rounded-full text-sm font-bold hover:bg-slate-50">
          <Download size={16} /> Export CSV
        </button>
      </div>

      {payslips.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No payslips found for this run</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {run && (() => {
            const cards = isDual ? [
              { label: 'Total Employees', value: String(payslips.length) },
              { label: 'Total Gross (USD)', value: `USD ${payslips.reduce((s: number, p: any) => s + (p.grossUSD ?? p.gross), 0).toFixed(2)}` },
              { label: 'Total Gross (ZiG)', value: `ZiG ${payslips.reduce((s: number, p: any) => s + (p.grossZIG ?? 0), 0).toFixed(2)}` },
              { label: 'Net Pay (USD)', value: `USD ${payslips.reduce((s: number, p: any) => s + (p.netPayUSD ?? p.netPay), 0).toFixed(2)}` },
            ] : [
              { label: 'Total Employees', value: String(payslips.length) },
              { label: 'Total Gross', value: `${ccy} ${payslips.reduce((s: number, p: any) => s + p.gross, 0).toFixed(2)}` },
              { label: 'Total PAYE', value: `${ccy} ${payslips.reduce((s: number, p: any) => s + p.paye, 0).toFixed(2)}` },
              { label: 'Total Net', value: `${ccy} ${payslips.reduce((s: number, p: any) => s + p.netPay, 0).toFixed(2)}` },
            ];
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {cards.map((s) => (
                  <div key={s.label} className="bg-primary rounded-2xl border border-border p-4 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-x-auto">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  {isDual ? (
                    <>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Position</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Gross USD</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Gross ZiG</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">PAYE USD</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">PAYE ZiG</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">NSSA USD</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">NSSA ZiG</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Loans</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Net USD</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Net ZiG</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                    </>
                  ) : (
                    ['Employee', 'Position', 'Gross', 'PAYE', 'AIDS Levy', 'NSSA', 'Loan Deductions', 'Net Pay', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payslips.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-sm">{p.employee?.firstName} {p.employee?.lastName}</p>
                      <p className="text-xs text-slate-400">{p.employee?.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.employee?.position}</td>
                    {isDual ? (
                      <>
                        <td className="px-4 py-3 text-sm font-bold">{fmt(p.grossUSD ?? p.gross)}</td>
                        <td className="px-4 py-3 text-sm font-bold">{fmt(p.grossZIG)}</td>
                        <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(p.payeUSD ?? p.paye)}</td>
                        <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(p.payeZIG)}</td>
                        <td className="px-4 py-3 text-sm text-yellow-600 font-medium">{fmt(p.nssaUSD ?? p.nssaEmployee)}</td>
                        <td className="px-4 py-3 text-sm text-yellow-600 font-medium">{fmt(p.nssaZIG)}</td>
                        <td className="px-4 py-3 text-sm text-purple-600 font-medium">{fmt(p.loanDeductions)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(p.netPayUSD ?? p.netPay)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(p.netPayZIG)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-bold">{fmt(p.gross)}</td>
                        <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(p.paye)}</td>
                        <td className="px-4 py-3 text-sm text-orange-500 font-medium">{fmt(p.aidsLevy)}</td>
                        <td className="px-4 py-3 text-sm text-yellow-600 font-medium">{fmt(p.nssaEmployee)}</td>
                        <td className="px-4 py-3 text-sm text-purple-600 font-medium">{fmt(p.loanDeductions)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(p.netPay)}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDownloadPdf(p.id)}
                        className="flex items-center gap-1 text-xs font-bold text-accent-blue hover:underline"
                      >
                        <FileText size={14} /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default Payslips;
