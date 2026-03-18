import React, { useEffect, useState } from 'react';
import { Search, User, Hash, CheckCircle, ShieldCheck, Download, FileText, AlertCircle, Trash } from 'lucide-react';
import { NSSAContributionAPI } from '../api/client';

const NSSAContributions: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [contributions, setContributions] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const fetchContributions = async () => {
    try {
      const response = await NSSAContributionAPI.getAll();
      setContributions(response.data);
    } catch (error) {
      console.error('Failed to fetch NSSA contributions');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchContributions();
    }
  }, [activeCompanyId]);

  const handleToggleSubmission = async (id: string, currentStatus: boolean) => {
    try {
      await NSSAContributionAPI.update(id, { submittedToNSSA: !currentStatus });
      fetchContributions();
    } catch (error) {
      alert('Failed to update submission status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this NSSA record?')) return;
    try {
      await NSSAContributionAPI.delete(id);
      fetchContributions();
    } catch (error) {
      alert('Failed to delete NSSA record');
    }
  };

  const filteredContributions = contributions.filter(c => 
    c.employee?.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.employee?.employeeID.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">NSSA Contributions</h2>
          <p className="text-slate-500 font-medium">Monthly statutory pension tracking and compliance ledger.</p>
        </div>
        <div className="flex items-center gap-3">
           <button className="bg-slate-100 text-navy px-6 py-3 rounded-[9999px] font-bold hover:bg-slate-200 transition-colors flex items-center gap-2">
            <Download size={20} /> Export NSSA Return
          </button>
        </div>
      </header>

      {/* Info Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-navy rounded-2xl p-6 text-white flex gap-4 items-start shadow-xl border-t border-white/10">
          <div className="p-2 bg-white/10 rounded-xl">
            <ShieldCheck size={24} className="text-accent-blue" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1 tracking-tight">Capped Compliance</h3>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
              Pensionable earnings are automatically capped at regulatory thresholds (USD 5,010.83). All calculations follow the 4.5% + 4.5% split.
            </p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex gap-4 items-start">
          <div className="p-2 bg-white rounded-xl text-accent-green shadow-sm">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="font-bold text-navy mb-1">Audit Readiness</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Every entry captures the exact currency split used for payment, ensuring transparent audits during NSSA site visits or regulatory reviews.
            </p>
          </div>
        </div>
      </div>

      {/* Contribution Table */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-slate-50/50 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by Employee..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-sm focus:outline-none focus:border-blue-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee / Period</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Pensionable (USD)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Contribution (EE/ER)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Limit Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Submission</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredContributions.length > 0 ? filteredContributions.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy leading-none mb-1">{c.employee?.fullName}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date(c.payPeriod).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold font-mono text-navy">${c.pensionableEarningsUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">EE (4.5%)</p>
                        <p className="text-sm font-bold text-navy font-mono">${c.employeeContributionUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="h-8 w-px bg-slate-100" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">ER (4.5%)</p>
                        <p className="text-sm font-bold text-navy font-mono">${c.employerContributionUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {c.isWithinLimit ? (
                      <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-accent-green rounded-md uppercase">Normal</span>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <AlertCircle size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-tight">At Ceiling</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => handleToggleSubmission(c.id, c.submittedToNSSA)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${c.submittedToNSSA ? 'bg-emerald-500 text-white font-bold' : 'bg-slate-100 text-slate-400 font-bold hover:bg-slate-200'}`}
                    >
                      {c.submittedToNSSA ? <CheckCircle size={14} /> : <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-full" />}
                      <span className="text-[10px] uppercase tracking-wider">{c.submittedToNSSA ? 'Submitted' : 'Pending'}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(c.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-300 font-medium">
                    <Hash size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="italic">No pension contribution records found for this period.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default NSSAContributions;
