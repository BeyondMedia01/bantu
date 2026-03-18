import React, { useState } from 'react';
import { FileText, Download, Clock, ShieldCheck, FileSpreadsheet, Scale, BarChart2, Users, BookOpen } from 'lucide-react';
import { ReportsAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

const MONTHS = [
  { id: 1, name: 'January' }, { id: 2, name: 'February' }, { id: 3, name: 'March' },
  { id: 4, name: 'April' }, { id: 5, name: 'May' }, { id: 6, name: 'June' },
  { id: 7, name: 'July' }, { id: 8, name: 'August' }, { id: 9, name: 'September' },
  { id: 10, name: 'October' }, { id: 11, name: 'November' }, { id: 12, name: 'December' },
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

const Reports: React.FC = () => {
  const companyId = getActiveCompanyId();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (type: string, fn: () => Promise<any>, filename: string) => {
    setDownloading(type);
    try {
      const res = await fn();
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to generate report.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadTax = () =>
    download('tax', () => ReportsAPI.tax({ year: String(selectedYear), format: 'pdf' }), `P16_${selectedYear}.pdf`);

  const downloadNssa = () =>
    download('nssa', () => ReportsAPI.tax({ year: String(selectedYear), month: String(selectedMonth), format: 'nssa' }), `NSSA_P4A_${selectedYear}_${selectedMonth}.csv`);

  const downloadPayslips = () =>
    download('payslips', () => ReportsAPI.payslips({ format: 'csv' }), `Payslips_Export.csv`);

  const downloadLeave = () =>
    download('leave', () => ReportsAPI.leave({ format: 'csv' }), `Leave_Report.csv`);

  const downloadLoans = () =>
    download('loans', () => ReportsAPI.loans({ format: 'csv' }), `Loans_Report.csv`);

  const downloadDepartments = () =>
    download('departments', () => ReportsAPI.departments(), `Departments_Headcount.csv`);

  const downloadJournals = () =>
    download('journals', () => ReportsAPI.journals({ format: 'csv' }), `Payroll_Journals.csv`);

  const disabled = !companyId;
  const isDownloading = (type: string) => downloading === type;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Reports</h2>
          <p className="text-slate-500 font-medium text-sm">Generate and export ZIMRA & NSSA-compliant documentation.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-slate-50 border border-border rounded-xl px-3 py-2 text-sm font-bold text-navy focus:outline-none"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Statutory Returns */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Statutory Returns</h3>
            <div className="flex flex-col gap-3">

              {/* ZIMRA P16 */}
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-blue-50 text-accent-blue rounded-xl flex items-center justify-center shrink-0">
                    <FileText size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">ZIMRA P16 Annual Summary</p>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Tax Year {selectedYear}</p>
                  </div>
                </div>
                <button
                  disabled={disabled || isDownloading('tax')}
                  onClick={downloadTax}
                  className="bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 flex items-center gap-2 disabled:opacity-40 shrink-0"
                >
                  <Download size={15} /> {isDownloading('tax') ? 'Generating…' : 'Export PDF'}
                </button>
              </div>

              {/* NSSA P4A */}
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                    <Scale size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">NSSA P4A Monthly Return</p>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Social Security Remittance</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-slate-50 border border-border rounded-xl px-3 py-2 text-sm font-bold text-navy focus:outline-none"
                  >
                    {MONTHS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button
                    disabled={disabled || isDownloading('nssa')}
                    onClick={downloadNssa}
                    className="bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 flex items-center gap-2 disabled:opacity-40"
                  >
                    <Download size={15} /> {isDownloading('nssa') ? '…' : 'Export'}
                  </button>
                </div>
              </div>

              {/* ITF16 — Coming soon */}
              <div className="bg-slate-50 rounded-2xl border border-dashed border-border p-5 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-slate-200 text-slate-400 rounded-xl flex items-center justify-center shrink-0">
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-500">ITF16 Return (CSV)</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider italic">Coming soon</p>
                  </div>
                </div>
                <span className="text-xs bg-slate-200 text-slate-500 font-bold px-3 py-1 rounded-full uppercase tracking-wider">Scheduled</span>
              </div>
            </div>
          </div>

          {/* Operational Reports */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Operational Reports</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'payslips', icon: <FileText size={20} />, color: 'bg-purple-50 text-purple-600', label: 'Payslips Export', sub: 'All payslips CSV', fn: downloadPayslips },
                { key: 'leave', icon: <BookOpen size={20} />, color: 'bg-amber-50 text-amber-600', label: 'Leave Report', sub: 'Leave balances & history', fn: downloadLeave },
                { key: 'loans', icon: <BarChart2 size={20} />, color: 'bg-rose-50 text-rose-600', label: 'Loans Report', sub: 'Active & settled loans', fn: downloadLoans },
                { key: 'departments', icon: <Users size={20} />, color: 'bg-teal-50 text-teal-600', label: 'Headcount Report', sub: 'Employees by department', fn: downloadDepartments },
                { key: 'journals', icon: <FileSpreadsheet size={20} />, color: 'bg-indigo-50 text-indigo-600', label: 'Payroll Journals', sub: 'Transaction-level export', fn: downloadJournals },
              ].map(({ key, icon, color, label, sub, fn }) => (
                <button
                  key={key}
                  disabled={disabled || isDownloading(key)}
                  onClick={fn}
                  className="bg-primary rounded-2xl border border-border shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{isDownloading(key) ? 'Generating…' : label}</p>
                    <p className="text-xs text-slate-400 font-medium truncate">{sub}</p>
                  </div>
                  <Download size={15} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <div className="bg-navy rounded-2xl text-white p-6 relative overflow-hidden shadow-xl">
            <ShieldCheck size={100} className="absolute -right-8 -bottom-8 text-white/5" />
            <h3 className="text-lg font-bold mb-3 relative z-10">Statutory Guard</h3>
            <p className="text-blue-100 font-medium leading-relaxed mb-5 opacity-80 relative z-10 text-sm">
              Export ZIMRA and NSSA compliant forms generated from your validated payroll runs.
            </p>
            <div className="flex flex-col gap-3 relative z-10">
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold">ZIMRA</div>
                <span className="text-sm font-semibold text-blue-50">Authorized P16 Layout</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold">NSSA</div>
                <span className="text-sm font-semibold text-blue-50">Accurate P4A Calculation</span>
              </div>
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-4">Filing Deadlines</h3>
            <div className="flex flex-col gap-3">
              <DeadlineItem month="Jan" day="15" label="ZIMRA PAYE" sub="Monthly return" critical />
              <DeadlineItem month="Jan" day="15" label="NSSA Contributions" sub="Monthly remittance" critical />
              <DeadlineItem month="Jan" day="15" label="ZIMDEF Levy" sub="Skills levy" />
              <DeadlineItem month="Mar" day="31" label="P16 Annual" sub="Annual tax certificate" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DeadlineItem: React.FC<{ month: string; day: string; label: string; sub: string; critical?: boolean }> = ({ month, day, label, sub, critical }) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 ${critical ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'} rounded-xl flex flex-col items-center justify-center font-bold shrink-0`}>
      <span className="text-[9px] leading-none uppercase">{month}</span>
      <span className="text-base leading-none">{day}</span>
    </div>
    <div>
      <p className="text-sm font-bold">{label}</p>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${critical ? 'text-red-400' : 'text-slate-400'}`}>{sub}</p>
    </div>
    <Clock size={14} className="text-slate-200 ml-auto shrink-0" />
  </div>
);

export default Reports;
