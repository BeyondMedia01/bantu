import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, ChevronRight, Check, AlertTriangle, Loader } from 'lucide-react';
import { RetroactivePayAPI } from '../../api/client';

const RetroactivePayWizard: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [newRate, setNewRate] = useState('');
  const [calculation, setCalculation] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await RetroactivePayAPI.getEmployees();
      setEmployees(res.data);
    } catch (err) {
      console.error('Failed to load employees', err);
    }
    setLoading(false);
  };

  const handleCalculate = async () => {
    if (!selectedEmployee || !effectiveDate || !newRate) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await RetroactivePayAPI.calculate({
        employeeId: selectedEmployee.id,
        effectiveDate,
        newRate: parseFloat(newRate),
      });
      setCalculation(res.data);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Calculation failed');
    }
    setLoading(false);
  };

  const handleApply = async () => {
    if (!calculation) return;
    setApplying(true);
    try {
      const res = await RetroactivePayAPI.apply({
        employeeId: selectedEmployee.id,
        effectiveDate,
        newRate: parseFloat(newRate),
        oldRate: calculation.oldRate,
        totalBackpay: calculation.totalBackpay,
      });
      setApplied(true);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to apply back-pay');
    }
    setApplying(false);
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} className="p-2 hover:bg-slate-100 rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Retroactive Pay Wizard</h1>
          <p className="text-slate-500">Calculate and apply back-pay for rate changes</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4 mb-8">
        {[
          { num: 1, label: 'Select Employee' },
          { num: 2, label: 'Review Calculation' },
          { num: 3, label: 'Apply Back-Pay' },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              step >= s.num ? 'bg-btn-primary text-navy' : 'bg-slate-200 text-slate-400'
            }`}>
              {step > s.num ? <Check size={16} /> : s.num}
            </div>
            <span className={`text-sm font-medium ${step >= s.num ? 'text-navy' : 'text-slate-400'}`}>
              {s.label}
            </span>
            {s.num < 3 && <ChevronRight size={16} className="text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Employee */}
      {step === 1 && (
        <div className="bg-primary rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold mb-4">Step 1: Select Employee & Enter New Rate</h2>
          
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl mb-4">
              <AlertTriangle size={16} />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Employee</label>
              <select
                value={selectedEmployee?.id || ''}
                onChange={(e) => {
                  const emp = employees.find((em) => em.id === e.target.value);
                  setSelectedEmployee(emp);
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium"
              >
                <option value="">Select employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Current Base Rate</label>
              <div className="px-4 py-3 bg-slate-100 border border-border rounded-xl font-medium text-slate-500">
                {selectedEmployee ? `$${selectedEmployee.baseRate?.toFixed(2) || '0.00'}` : '—'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Effective Date</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">New Rate</label>
              <input
                type="number"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="Enter new base rate"
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCalculate}
              disabled={loading || !selectedEmployee || !effectiveDate || !newRate}
              className="flex items-center gap-2 px-6 py-3 bg-btn-primary text-navy rounded-xl font-bold shadow-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader size={18} className="animate-spin" /> : <Calculator size={18} />}
              Calculate Back-Pay
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review Calculation */}
      {step === 2 && calculation && (
        <div className="bg-primary rounded-2xl border border-border p-6">
          <h2 className="text-lg font-bold mb-4">Step 2: Review Calculation</h2>
          
          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">Employee:</span>
                <span className="font-bold ml-2">{calculation.employee.name}</span>
              </div>
              <div>
                <span className="text-slate-400">Effective Date:</span>
                <span className="font-bold ml-2">{new Date(calculation.effectiveDate).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-slate-400">Old Rate:</span>
                <span className="font-bold ml-2">{formatCurrency(calculation.oldRate)}</span>
              </div>
              <div>
                <span className="text-slate-400">New Rate:</span>
                <span className="font-bold ml-2">{formatCurrency(calculation.newRate)}</span>
              </div>
            </div>
          </div>

          <h3 className="font-bold text-navy mb-3">Payroll Period Breakdown</h3>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-slate-400 font-bold">Period</th>
                  <th className="text-right py-2 text-slate-400 font-bold">Old Amount</th>
                  <th className="text-right py-2 text-slate-400 font-bold">New Amount</th>
                  <th className="text-right py-2 text-slate-400 font-bold">Shortfall</th>
                </tr>
              </thead>
              <tbody>
                {calculation.calculations.map((calc: any, i: number) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2">{calc.period}</td>
                    <td className="py-2 text-right">{formatCurrency(calc.oldAmount)}</td>
                    <td className="py-2 text-right">{formatCurrency(calc.newAmount)}</td>
                    <td className="py-2 text-right font-bold text-red-500">+{formatCurrency(calc.shortfall)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 font-bold">Total Back-Pay</td>
                  <td></td>
                  <td></td>
                  <td className="py-3 text-right font-bold text-xl text-emerald-600">
                    {formatCurrency(calculation.totalBackpay)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 border border-border rounded-xl font-bold text-slate-500 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className="flex items-center gap-2 px-6 py-3 bg-btn-primary text-navy rounded-xl font-bold shadow-lg hover:opacity-90"
            >
              {applying ? <Loader size={18} className="animate-spin" /> : <Check size={18} />}
              Apply to Current Month
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && (
        <div className="bg-primary rounded-2xl border border-border p-6 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold mb-2">Back-Pay Applied Successfully!</h2>
          <p className="text-slate-500 mb-6">
            The retroactive pay of {formatCurrency(calculation?.totalBackpay || 0)} has been added to the current month's payroll.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => {
                setStep(1);
                setSelectedEmployee(null);
                setEffectiveDate('');
                setNewRate('');
                setCalculation(null);
                setApplied(false);
              }}
              className="px-6 py-3 border border-border rounded-xl font-bold text-slate-500 hover:bg-slate-50"
            >
              Process Another
            </button>
            <button
              onClick={() => navigate('/payroll')}
              className="px-6 py-3 bg-btn-primary text-navy rounded-xl font-bold shadow-lg hover:opacity-90"
            >
              Go to Payroll
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RetroactivePayWizard;