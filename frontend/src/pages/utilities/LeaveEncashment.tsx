import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, DollarSign, AlertCircle, Filter, Check, X } from 'lucide-react';
import { LeaveManagementAPI, LeaveEncashment, EmployeeAPI, LeaveType } from '../../api/client';

const STATUS_COLORS: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-700',
  PROCESSED: 'bg-blue-50 text-blue-700',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const LeaveEncashmentPage: React.FC = () => {
  const [encashments, setEncashments] = useState<LeaveEncashment[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    employeeId: '',
    leaveTypeId: '',
    days: 0,
    notes: '',
  });

  const [selectedBalance, setSelectedBalance] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      LeaveManagementAPI.getEncashments(),
      LeaveManagementAPI.getLeaveTypes(),
      EmployeeAPI.getAll({ limit: '500' }),
    ])
      .then(([encRes, typesRes, empRes]) => {
        setEncashments(encRes.data || []);
        setLeaveTypes((typesRes.data || []).filter((t: LeaveType) => t.encashable));
        setEmployees(empRes.data?.data || empRes.data || []);
      })
      .catch(() => setError('Failed to load data'))
      .finally(() => setLoading(false));
  };

  const handleEmployeeSelect = async (employeeId: string) => {
    setForm({ ...form, employeeId, days: 0 });
    setSelectedBalance(null);
    if (employeeId) {
      try {
        const res = await LeaveManagementAPI.getEmployeeBalances(employeeId);
        const balances = res.data || [];
        if (form.leaveTypeId) {
          const balance = balances.find((b: any) => b.leaveTypeId === form.leaveTypeId);
          setSelectedBalance(balance);
        }
      } catch (e) {
        console.error('Failed to load balances', e);
      }
    }
  };

  const handleLeaveTypeSelect = async (leaveTypeId: string) => {
    setForm({ ...form, leaveTypeId, days: 0 });
    setSelectedBalance(null);
    if (form.employeeId && leaveTypeId) {
      try {
        const res = await LeaveManagementAPI.getEmployeeBalances(form.employeeId);
        const balances = res.data || [];
        const balance = balances.find((b: any) => b.leaveTypeId === leaveTypeId);
        setSelectedBalance(balance);
      } catch (e) {
        console.error('Failed to load balances', e);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await LeaveManagementAPI.requestEncashment(form);
      setSuccess('Leave encashment requested successfully');
      setShowForm(false);
      setForm({ employeeId: '', leaveTypeId: '', days: 0, notes: '' });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to request encashment');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!window.confirm('Approve this encashment request?')) return;
    try {
      await LeaveManagementAPI.approveEncashment(id);
      setSuccess('Encashment approved');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to approve');
    }
  };

  const handleProcess = async (id: string) => {
    if (!window.confirm('Process this approved encashment? This will add it to the current payroll.')) return;
    try {
      await LeaveManagementAPI.processEncashment(id);
      setSuccess('Encashment processed and added to payroll');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to process');
    }
  };

  const availableDays = selectedBalance
    ? (selectedBalance.accruedDays || 0) - (selectedBalance.usedDays || 0) - (selectedBalance.encashedDays || 0)
    : 0;

  const filtered = encashments.filter((e) => {
    if (filterStatus && e.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Leave Encashment</h2>
          <p className="text-slate-500 font-medium text-sm">Request and manage leave encashments</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-btn-primary text-navy px-4 py-2 rounded-lg font-bold text-sm shadow hover:opacity-90 flex items-center gap-2"
        >
          <DollarSign size={16} /> Request Encashment
        </button>
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

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <Filter size={16} className="text-slate-400" />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-primary border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="PROCESSED">Processed</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-navy">Request Leave Encashment</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Employee</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => handleEmployeeSelect(e.target.value)}
                  className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  required
                >
                  <option value="">Select Employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Leave Type</label>
                <select
                  value={form.leaveTypeId}
                  onChange={(e) => handleLeaveTypeSelect(e.target.value)}
                  className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  required
                >
                  <option value="">Select Leave Type</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} ({lt.code})
                    </option>
                  ))}
                </select>
              </div>
              {selectedBalance && (
                <div className="p-3 bg-slate-50 rounded-lg text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Current Balance:</span>
                    <span className="font-medium">{availableDays} days</span>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Days to Encash</label>
                <input
                  type="number"
                  min="1"
                  max={availableDays}
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: parseInt(e.target.value) || 0 })}
                  className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                  rows={2}
                  placeholder="Reason for encashment..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving || form.days > availableDays}
                  className="flex-1 bg-btn-primary text-navy px-4 py-2 rounded-lg font-bold text-sm shadow hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <DollarSign size={16} /> {saving ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg font-medium text-sm border border-border text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Encashments Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No encashment requests found.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Leave Type</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Days</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((enc) => (
                <tr key={enc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium text-navy">
                      {enc.employee?.firstName} {enc.employee?.lastName}
                    </span>
                    <br />
                    <span className="text-slate-400 text-xs">{enc.employee?.employeeCode}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{enc.leaveType?.name || enc.leaveTypeId}</td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">{enc.days}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-navy">{fmtCurrency(enc.totalAmount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[enc.status]}`}>
                      {enc.status === 'PENDING' && <Clock size={10} />}
                      {enc.status === 'APPROVED' && <CheckCircle2 size={10} />}
                      {enc.status === 'PROCESSED' && <Check size={10} />}
                      {enc.status === 'REJECTED' && <XCircle size={10} />}
                      {enc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(enc.requestDate)}</td>
                  <td className="px-4 py-3 text-center">
                    {enc.status === 'PENDING' && (
                      <button
                        onClick={() => handleApprove(enc.id)}
                        className="text-emerald-600 hover:text-emerald-700 p-1"
                        title="Approve"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    )}
                    {enc.status === 'APPROVED' && (
                      <button
                        onClick={() => handleProcess(enc.id)}
                        className="text-blue-600 hover:text-blue-700 p-1"
                        title="Process"
                      >
                        <DollarSign size={16} />
                      </button>
                    )}
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

export default LeaveEncashmentPage;
