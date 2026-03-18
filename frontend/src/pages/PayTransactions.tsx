import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { PayTransactionAPI } from '../api/client';

const PayTransactions: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const fetchTransactions = async () => {
    try {
      const response = await PayTransactionAPI.getAll();
      setTransactions(response.data);
    } catch (error) {
      console.error('Failed to fetch PayTransaction entries');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchTransactions();
    }
  }, [activeCompanyId]);

  const filteredTransactions = transactions.filter(t => 
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Earnings & Deductions</h2>
          <p className="text-slate-500 font-medium">Define transaction codes and calculation logic for payslip line items.</p>
        </div>
        <button className="bg-btn-primary text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2">
          <Plus size={20} /> Add Transaction
        </button>
      </header>

      {/* Table Section */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-slate-50/50 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by Code or Description..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-sm focus:outline-none focus:border-accent-blue"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Code / Description</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Calculation</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Currency</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.length > 0 ? filteredTransactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${t.type === 'EARNING' ? 'bg-emerald-50 text-accent-green' : 'bg-red-50 text-red-500'} flex items-center justify-center font-bold text-xs`}>
                        {t.code}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{t.description}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Code: {t.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${t.type === 'EARNING' ? 'bg-emerald-100 text-accent-green' : 'bg-red-100 text-red-500'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                       <p className="text-sm font-bold text-navy">
                         {t.isPercentage ? 'Percentage' : 'Flat Amount'}
                       </p>
                       {t.isPercentage && (
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-wrap max-w-[120px]">
                           Of: {t.percentageOf || 'N/A'}
                         </p>
                       )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-navy">
                    <div className="flex flex-col">
                       <span>{t.defaultCurrency}</span>
                       {t.isMultiCurrencySplit && <span className="text-[10px] text-accent-blue font-bold uppercase">Multi-Split</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {t.active ? (
                      <div className="flex items-center gap-1.5 text-accent-green">
                        <ToggleRight size={20} />
                        <span className="text-[10px] font-bold uppercase">Active</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <ToggleLeft size={20} />
                        <span className="text-[10px] font-bold uppercase">Disabled</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors">
                        <Edit size={16} />
                      </button>
                      <button className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                    No earnings or deductions defined yet.
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

export default PayTransactions;
