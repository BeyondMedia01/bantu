import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { EmployeeAPI, BranchAPI, DepartmentAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

const ZIMBABWE_BANKS = [
  'Agribank (Agricultural Bank of Zimbabwe)',
  'BancABC Zimbabwe',
  'CABS (Central Africa Building Society)',
  'CBZ Bank',
  'Ecobank Zimbabwe',
  'FBC Bank',
  'First Capital Bank',
  'MetBank',
  'NMB Bank',
  "POSB (People's Own Savings Bank)",
  'Stanbic Bank Zimbabwe',
  'Standard Chartered Bank Zimbabwe',
  'Steward Bank',
  'ZB Bank',
];

const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Rev'];

const EmployeeNew: React.FC = () => {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    // Personal Details
    employeeCode: '', title: '', firstName: '', lastName: '', maidenName: '',
    nationality: '', idPassport: '', dateOfBirth: '', gender: '', maritalStatus: '',
    homeAddress: '', postalAddress: '',
    nextOfKinName: '', nextOfKinContact: '', socialSecurityNum: '',
    // Work Details
    startDate: '', occupation: '', position: '', departmentId: '', branchId: '',
    costCenter: '', grade: '', employmentType: 'PERMANENT',
    leaveEntitlement: '', dischargeDate: '', dischargeReason: '',
    // Pay Details
    paymentMethod: 'BANK', paymentBasis: 'MONTHLY', rateSource: 'MANUAL',
    baseRate: '', currency: 'USD', hoursPerPeriod: '', daysPerPeriod: '',
    bankName: '', bankBranch: '', accountNumber: '',
    // Tax Details
    taxDirectivePerc: '', taxDirectiveAmt: '', taxMethod: 'NON_FDS',
    taxTable: '', accumulativeSetting: 'NO', taxCredits: '',
    tin: '', motorVehicleBenefit: '', motorVehicleType: '',
    // Leave Details
    annualLeaveAccrued: '', annualLeaveTaken: '',
  });

  useEffect(() => {
    const companyId = getActiveCompanyId();
    if (companyId) {
      BranchAPI.getAll({ companyId }).then((r) => setBranches(r.data)).catch(() => {});
      DepartmentAPI.getAll({ companyId }).then((r) => setDepartments(r.data)).catch(() => {});
    }
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await EmployeeAPI.create({
        ...form,
        baseRate: parseFloat(form.baseRate),
        motorVehicleBenefit: form.motorVehicleBenefit ? parseFloat(form.motorVehicleBenefit) : undefined,
        companyId: getActiveCompanyId() ?? undefined,
      });
      navigate('/employees');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/employees')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">New Employee</h1>
          <p className="text-slate-500 font-medium text-sm">Add a new employee to your company</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">

        {/* ── Personal Details ── */}
        <Section title="Personal Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Employee Code" required>
              <input required value={form.employeeCode} onChange={set('employeeCode')} placeholder="e.g. EMP001" />
            </Field>
            <Field label="Title">
              <select value={form.title} onChange={set('title')}>
                <option value="">— Select —</option>
                {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="First Name" required>
              <input required value={form.firstName} onChange={set('firstName')} />
            </Field>
            <Field label="Last Name" required>
              <input required value={form.lastName} onChange={set('lastName')} />
            </Field>
            <Field label="Maiden Name">
              <input value={form.maidenName} onChange={set('maidenName')} />
            </Field>
            <Field label="Nationality" required>
              <input required value={form.nationality} onChange={set('nationality')} placeholder="e.g. Zimbabwean" />
            </Field>
            <Field label="ID / Passport Number" required>
              <input required value={form.idPassport} onChange={set('idPassport')} />
            </Field>
            <Field label="Date of Birth" required>
              <input required type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
            </Field>
            <Field label="Gender" required>
              <select required value={form.gender} onChange={set('gender')}>
                <option value="">— Select —</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Marital Status" required>
              <select required value={form.maritalStatus} onChange={set('maritalStatus')}>
                <option value="">— Select —</option>
                <option value="SINGLE">Single</option>
                <option value="MARRIED">Married</option>
                <option value="DIVORCED">Divorced</option>
                <option value="WIDOWED">Widowed</option>
              </select>
            </Field>
            <Field label="Home Address" className="col-span-2">
              <input value={form.homeAddress} onChange={set('homeAddress')} />
            </Field>
            <Field label="Postal Address" className="col-span-2">
              <input value={form.postalAddress} onChange={set('postalAddress')} />
            </Field>
            <Field label="Next of Kin Name">
              <input value={form.nextOfKinName} onChange={set('nextOfKinName')} />
            </Field>
            <Field label="Next of Kin Contact">
              <input value={form.nextOfKinContact} onChange={set('nextOfKinContact')} />
            </Field>
            <Field label="Social Security Number">
              <input value={form.socialSecurityNum} onChange={set('socialSecurityNum')} />
            </Field>
          </div>
        </Section>

        {/* ── Work Details ── */}
        <Section title="Work Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" required>
              <input required type="date" value={form.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Occupation">
              <input value={form.occupation} onChange={set('occupation')} placeholder="e.g. Software Engineer" />
            </Field>
            <Field label="Position / Job Title" required>
              <input required value={form.position} onChange={set('position')} />
            </Field>
            <Field label="Department">
              <select value={form.departmentId} onChange={set('departmentId')}>
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select value={form.branchId} onChange={set('branchId')}>
                <option value="">— None —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Cost Center">
              <input value={form.costCenter} onChange={set('costCenter')} />
            </Field>
            <Field label="Grade">
              <input value={form.grade} onChange={set('grade')} placeholder="e.g. Grade 5" />
            </Field>
            <Field label="Employment Type" required>
              <select required value={form.employmentType} onChange={set('employmentType')}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
                <option value="TEMPORARY">Temporary</option>
                <option value="PART_TIME">Part Time</option>
              </select>
            </Field>
            <Field label="Leave Entitlement (days)">
              <input type="number" step="0.5" value={form.leaveEntitlement} onChange={set('leaveEntitlement')} placeholder="e.g. 30" />
            </Field>
            <Field label="Discharge Date">
              <input type="date" value={form.dischargeDate} onChange={set('dischargeDate')} />
            </Field>
            <Field label="Discharge Reason" className="col-span-2">
              <input value={form.dischargeReason} onChange={set('dischargeReason')} />
            </Field>
          </div>
        </Section>

        {/* ── Pay Details ── */}
        <Section title="Pay Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Payment Method" required>
              <select required value={form.paymentMethod} onChange={set('paymentMethod')}>
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
              </select>
            </Field>
            <Field label="Payment Basis" required>
              <select required value={form.paymentBasis} onChange={set('paymentBasis')}>
                <option value="MONTHLY">Monthly</option>
                <option value="DAILY">Daily</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </Field>
            <Field label="Rate Source" required>
              <select required value={form.rateSource} onChange={set('rateSource')}>
                <option value="MANUAL">Manual</option>
                <option value="NEC_GRADE">NEC Grade</option>
              </select>
            </Field>
            <Field label="Base Rate" required>
              <input required type="number" step="0.01" min="0" value={form.baseRate} onChange={set('baseRate')} placeholder="0.00" />
            </Field>
            <Field label="Currency" required>
              <select required value={form.currency} onChange={set('currency')}>
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </Field>
            <Field label="Hours per Period">
              <input type="number" step="0.5" value={form.hoursPerPeriod} onChange={set('hoursPerPeriod')} placeholder="e.g. 176" />
            </Field>
            <Field label="Days per Period">
              <input type="number" step="0.5" value={form.daysPerPeriod} onChange={set('daysPerPeriod')} placeholder="e.g. 22" />
            </Field>
            <Field label="Bank Name">
              <select value={form.bankName} onChange={set('bankName')}>
                <option value="">— Select bank —</option>
                {ZIMBABWE_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Bank Branch">
              <input value={form.bankBranch} onChange={set('bankBranch')} placeholder="e.g. Harare Main" />
            </Field>
            <Field label="Account Number">
              <input value={form.accountNumber} onChange={set('accountNumber')} />
            </Field>
          </div>
        </Section>

        {/* ── Tax Details ── */}
        <Section title="Tax Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tax Directive %">
              <input type="number" step="0.01" min="0" max="100" value={form.taxDirectivePerc} onChange={set('taxDirectivePerc')} placeholder="0.00" />
            </Field>
            <Field label="Tax Directive Amount">
              <input type="number" step="0.01" min="0" value={form.taxDirectiveAmt} onChange={set('taxDirectiveAmt')} placeholder="0.00" />
            </Field>
            <Field label="Tax Method" required>
              <select required value={form.taxMethod} onChange={set('taxMethod')}>
                <option value="NON_FDS">Non-FDS</option>
                <option value="FDS_AVERAGE">FDS Average</option>
                <option value="FDS_FORECASTING">FDS Forecasting</option>
              </select>
            </Field>
            <Field label="Tax Table" required>
              <input required value={form.taxTable} onChange={set('taxTable')} placeholder="e.g. USD 2024" />
            </Field>
            <Field label="Accumulative Setting" required>
              <select required value={form.accumulativeSetting} onChange={set('accumulativeSetting')}>
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
            </Field>
            <Field label="Tax Credits">
              <input type="number" step="0.01" min="0" value={form.taxCredits} onChange={set('taxCredits')} placeholder="0.00" />
            </Field>
            <Field label="TIN (Tax Identification Number)">
              <input value={form.tin} onChange={set('tin')} />
            </Field>
            <Field label="Motor Vehicle Benefit">
              <input type="number" step="0.01" min="0" value={form.motorVehicleBenefit} onChange={set('motorVehicleBenefit')} placeholder="0.00" />
            </Field>
            <Field label="Motor Vehicle Type">
              <input value={form.motorVehicleType} onChange={set('motorVehicleType')} placeholder="e.g. Saloon" />
            </Field>
          </div>
        </Section>

        {/* ── Leave Details ── */}
        <Section title="Leave Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Annual Leave Accrued (days)">
              <input type="number" step="0.5" min="0" value={form.annualLeaveAccrued} onChange={set('annualLeaveAccrued')} placeholder="0" />
            </Field>
            <Field label="Annual Leave Taken (days)">
              <input type="number" step="0.5" min="0" value={form.annualLeaveTaken} onChange={set('annualLeaveTaken')} placeholder="0" />
            </Field>
          </div>
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Save size={16} /> {loading ? 'Saving…' : 'Save Employee'}
          </button>
          <button type="button" onClick={() => navigate('/employees')} className="px-6 py-3 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
    <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-slate-400">{title}</h3>
    {children}
  </div>
);

const Field: React.FC<{ label: string; required?: boolean; className?: string; children: React.ReactElement }> = ({ label, required, className, children }) => {
  const child = React.cloneElement(children as React.ReactElement<any>, {
    className: 'w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium text-sm',
  });
  return (
    <div className={`flex flex-col gap-1.5 ${className || ''}`}>
      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {child}
    </div>
  );
};

export default EmployeeNew;
