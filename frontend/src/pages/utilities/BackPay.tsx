import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { UtilitiesAPI, EmployeeAPI } from '../../api/client';

const BackPay: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({ fromDate: '', toDate: '', newBaseRate: '', currency: 'USD' });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    EmployeeAPI.getAll({ limit: '200' }).then((r) => setEmployees(r.data?.data || r.data)).catch(() => {});
  }, []);

  const toggleEmployee = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) return setError('Select at least one employee');
    setError('');
    setLoading(true);
    try {
      const payload: any = { employeeIds: selected, fromDate: form.fromDate, toDate: form.toDate, currency: form.currency };
      if (form.newBaseRate) payload.newBaseRate = parseFloat(form.newBaseRate);
      const res = await UtilitiesAPI.backPay(payload);
      setResults(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to calculate back pay');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold">Back Pay Calculator</h1>
          <p className="text-slate-500 font-medium text-sm">Calculate owed back pay for a date range</p>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

      {!results ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Date range & options */}
          <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
            <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-4">Parameters</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { f: 'fromDate', label: 'From Date', type: 'date' },
                { f: 'toDate', label: 'To Date', type: 'date' },
                { f: 'newBaseRate', label: 'New Base Rate (optional)', type: 'number' },
                { f: 'currency', label: 'Currency', type: 'select' },
              ].map(({ f, label, type }) => (
                <div key={f}>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}</label>
                  {type === 'select' ? (
                    <select value={(form as any)[f]} onChange={set(f)} className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm">
                      <option value="USD">USD</option>
                      <option value="ZiG">ZiG</option>
                    </select>
                  ) : (
                    <input
                      type={type}
                      required={f !== 'newBaseRate'}
                      value={(form as any)[f]}
                      onChange={set(f)}
                      step={type === 'number' ? '0.01' : undefined}
                      className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Employee selector */}
          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">
                Select Employees ({selected.length} selected)
              </h3>
              <button
                type="button"
                onClick={() => setSelected(selected.length === employees.length ? [] : employees.map((e) => e.id))}
                className="text-xs font-bold text-accent-blue hover:underline"
              >
                {selected.length === employees.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {employees.map((emp: any) => (
                <label key={emp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(emp.id)}
                    onChange={() => toggleEmployee(emp.id)}
                    className="w-4 h-4 accent-accent-blue"
                  />
                  <span className="font-medium text-sm">{emp.firstName} {emp.lastName}</span>
                  <span className="text-xs text-slate-400 ml-auto">{emp.employeeCode}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60">
              <RefreshCw size={16} /> {loading ? 'Calculating…' : 'Calculate Back Pay'}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-bold">Back Pay Results</h3>
              <p className="text-sm text-slate-500">{results.fromDate} → {results.toDate} ({results.months} months)</p>
            </div>
            <button onClick={() => setResults(null)} className="text-xs font-bold text-accent-blue hover:underline">Recalculate</button>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Employee', 'Months', 'Gross Back Pay', 'PAYE', 'Net Back Pay'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.results?.map((r: any) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-3 font-bold text-sm">{r.name}</td>
                  <td className="px-4 py-3 text-sm">{r.months}</td>
                  <td className="px-4 py-3 text-sm font-bold">{r.backPayGross?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-red-500">{r.paye?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-600">{r.backPayNet?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BackPay;
