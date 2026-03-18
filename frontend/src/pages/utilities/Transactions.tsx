import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader } from 'lucide-react';
import { TransactionCodeAPI } from '../../api/client';

const TX_TYPES = ['EARNING', 'DEDUCTION', 'BENEFIT'];

const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', type: 'EARNING', taxable: true, pensionable: true, preTax: false, description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    TransactionCodeAPI.getAll().then((r) => setCodes(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await TransactionCodeAPI.create(form);
      setShowForm(false);
      setForm({ code: '', name: '', type: 'EARNING', taxable: true, pensionable: true, preTax: false, description: '' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction code?')) return;
    try { await TransactionCodeAPI.delete(id); load(); } catch {}
  };

  const typeColor: Record<string, string> = {
    EARNING: 'bg-emerald-50 text-emerald-700',
    DEDUCTION: 'bg-red-50 text-red-700',
    FRINGE_BENEFIT: 'bg-blue-50 text-blue-700',
    EMPLOYER_CONTRIBUTION: 'bg-purple-50 text-purple-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/utilities')} className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold">Transaction Codes</h1>
            <p className="text-slate-500 font-medium text-sm">Manage earnings and deduction codes</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90">
          <Plus size={16} /> Add Code
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">New Transaction Code</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Code *</label>
              <input required value={form.code} onChange={set('code')} placeholder="BASIC" className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Name *</label>
              <input required value={form.name} onChange={set('name')} placeholder="Basic Salary" className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Type *</label>
              <select value={form.type} onChange={set('type')} className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm">
                {TX_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Description</label>
              <input value={form.description} onChange={set('description')} className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.taxable} onChange={set('taxable')} className="w-4 h-4 accent-accent-blue" />
              <span className="text-sm font-medium">Taxable</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.pensionable} onChange={set('pensionable')} className="w-4 h-4 accent-accent-blue" />
              <span className="text-sm font-medium">Pensionable (NSSA)</span>
            </label>
            {form.type === 'DEDUCTION' && (
              <label className="flex items-center gap-2 cursor-pointer col-span-2">
                <input type="checkbox" checked={form.preTax} onChange={set('preTax')} className="w-4 h-4 accent-accent-blue" />
                <span className="text-sm font-medium">Pre-Tax (pension contribution — deducted from taxable income before PAYE)</span>
              </label>
            )}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-btn-primary text-navy px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Saving…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-full border border-border font-bold text-sm text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Code', 'Name', 'Type', 'Taxable', 'Pensionable', 'Pre-Tax', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {codes.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono font-bold text-sm">{c.code}</td>
                  <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${typeColor[c.type] || 'bg-slate-100 text-slate-600'}`}>
                      {c.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{c.taxable ? '✓' : '—'}</td>
                  <td className="px-4 py-3 text-sm">{c.pensionable ? '✓' : '—'}</td>
                  <td className="px-4 py-3 text-sm">{c.type === 'DEDUCTION' && c.preTax ? '✓' : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
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

export default Transactions;
