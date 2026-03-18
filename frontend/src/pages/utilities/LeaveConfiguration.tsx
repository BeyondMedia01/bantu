import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Save, X, AlertCircle, CheckCircle2, Calculator } from 'lucide-react';
import { LeaveManagementAPI, LeaveType } from '../../api/client';

const LeaveConfiguration: React.FC = () => {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [accruing, setAccruing] = useState(false);
  const [yearEndRunning, setYearEndRunning] = useState(false);

  const [form, setForm] = useState({
    code: '',
    name: '',
    accrualRate: 1.5,
    accrualPeriod: 'MONTHLY',
    maxCarryOver: 5,
    maxAccumulation: 30,
    encashable: false,
    encashmentRate: 0,
    requiresApproval: true,
  });

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = () => {
    setLoading(true);
    LeaveManagementAPI.getLeaveTypes()
      .then((r) => setTypes(r.data || []))
      .catch(() => setError('Failed to load leave types'))
      .finally(() => setLoading(false));
  };

  const resetForm = () => {
    setForm({
      code: '',
      name: '',
      accrualRate: 1.5,
      accrualPeriod: 'MONTHLY',
      maxCarryOver: 5,
      maxAccumulation: 30,
      encashable: false,
      encashmentRate: 0,
      requiresApproval: true,
    });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing) {
        await LeaveManagementAPI.updateLeaveType(editing.id, form);
        setSuccess('Leave type updated successfully');
      } else {
        await LeaveManagementAPI.createLeaveType(form);
        setSuccess('Leave type created successfully');
      }
      loadTypes();
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save leave type');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (type: LeaveType) => {
    setEditing(type);
    setForm({
      code: type.code,
      name: type.name,
      accrualRate: type.accrualRate,
      accrualPeriod: type.accrualPeriod,
      maxCarryOver: type.maxCarryOver,
      maxAccumulation: type.maxAccumulation,
      encashable: type.encashable,
      encashmentRate: type.encashmentRate || 0,
      requiresApproval: type.requiresApproval,
    });
    setShowForm(true);
  };

  const handleRunAccrual = async () => {
    setAccruing(true);
    setError('');
    try {
      const result = await LeaveManagementAPI.runAccrual();
      setSuccess(`Accrual completed: ${result.data.accrualsProcessed || 0} records processed`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to run accrual');
    } finally {
      setAccruing(false);
    }
  };

  const handleYearEnd = async () => {
    if (!window.confirm('Run year-end carry-over? This will process leave balances for the new year.')) return;
    setYearEndRunning(true);
    setError('');
    try {
      const currentYear = new Date().getFullYear();
      const result = await LeaveManagementAPI.runYearEnd(currentYear, currentYear + 1);
      setSuccess(`Year-end completed: ${result.data.processed || 0} records processed`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to run year-end');
    } finally {
      setYearEndRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Leave Configuration</h2>
          <p className="text-slate-500 font-medium text-sm">Configure leave types, accrual rates, and caps</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunAccrual}
            disabled={accruing}
            className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2"
          >
            <Calculator size={16} />
            {accruing ? 'Running...' : 'Run Accrual'}
          </button>
          <button
            onClick={handleYearEnd}
            disabled={yearEndRunning}
            className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2"
          >
            {yearEndRunning ? 'Processing...' : 'Year-End Carry-Over'}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-btn-primary text-navy px-4 py-2 rounded-lg font-bold text-sm shadow hover:opacity-90 flex items-center gap-2"
          >
            <Plus size={16} /> Add Leave Type
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-600 font-medium flex items-center gap-2">
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-navy">{editing ? 'Edit Leave Type' : 'New Leave Type'}</h3>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                    required
                    disabled={!!editing}
                    placeholder="e.g. ANNUAL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                    required
                    placeholder="e.g. Annual Leave"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Accrual Rate (days/month)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.accrualRate}
                    onChange={(e) => setForm({ ...form, accrualRate: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Accrual Period</label>
                  <select
                    value={form.accrualPeriod}
                    onChange={(e) => setForm({ ...form, accrualPeriod: e.target.value })}
                    className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                    <option value="ON_HIRE">On Hire</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Max Accumulation (cap)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.maxAccumulation}
                    onChange={(e) => setForm({ ...form, maxAccumulation: parseInt(e.target.value) || 0 })}
                    className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Max Carry-Over</label>
                  <input
                    type="number"
                    min="0"
                    value={form.maxCarryOver}
                    onChange={(e) => setForm({ ...form, maxCarryOver: parseInt(e.target.value) || 0 })}
                    className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.encashable}
                    onChange={(e) => setForm({ ...form, encashable: e.target.checked })}
                    className="w-4 h-4 text-accent-blue rounded border-border focus:ring-accent-blue"
                  />
                  Encashable
                </label>
                {form.encashable && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-600">Rate</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.encashmentRate}
                      onChange={(e) => setForm({ ...form, encashmentRate: parseFloat(e.target.value) || 0 })}
                      className="w-20 bg-primary border border-border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                    />
                    <span className="text-sm text-slate-500">x daily rate</span>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.requiresApproval}
                    onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
                    className="w-4 h-4 text-accent-blue rounded border-border focus:ring-accent-blue"
                  />
                  Requires Approval
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-btn-primary text-navy px-4 py-2 rounded-lg font-bold text-sm shadow hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={16} /> {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-lg font-medium text-sm border border-border text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Types Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : types.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No leave types configured. Click "Add Leave Type" to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Accrual</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Cap</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Carry-Over</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Encashable</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.map((type) => (
                <tr key={type.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-navy">{type.code}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{type.name}</td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">
                    {type.accrualRate} days/{type.accrualPeriod.toLowerCase()}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">{type.maxAccumulation} days</td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">{type.maxCarryOver} days</td>
                  <td className="px-4 py-3 text-center">
                    {type.encashable ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        Yes ({type.encashmentRate || 1}x)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleEdit(type)}
                      className="text-accent-blue hover:text-accent-blue/80 p-1"
                    >
                      <Edit2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LeaveConfiguration;
