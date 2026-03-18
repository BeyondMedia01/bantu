import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CalendarDays, User, Loader } from 'lucide-react';
import { EmployeeSelfAPI } from '../../api/client';

const EmployeeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      EmployeeSelfAPI.getProfile(),
      EmployeeSelfAPI.getPayslips(),
      EmployeeSelfAPI.getLeave(),
    ]).then(([p, ps, l]) => {
      setProfile(p.data);
      setPayslips(ps.data?.slice(0, 3) || []);
      setLeave(l.data?.slice(0, 3) || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400"><Loader size={24} className="animate-spin" /></div>
  );

  return (
    <div>
      {/* Welcome */}
      <div className="bg-primary rounded-2xl border border-border p-8 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 border border-border flex items-center justify-center text-2xl font-bold text-slate-400">
            {profile?.firstName?.[0]}{profile?.lastName?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold">Welcome, {profile?.firstName}</h1>
            <p className="text-slate-500 font-medium">{profile?.position} · {profile?.company?.name || ''}</p>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Recent Payslips', value: payslips.length, icon: <FileText size={18} />, path: '/employee/payslips' },
          { label: 'Leave Records', value: leave.length, icon: <CalendarDays size={18} />, path: '/employee/leave' },
          { label: 'My Profile', value: '→', icon: <User size={18} />, path: '/employee/profile' },
        ].map((s) => (
          <button
            key={s.path}
            onClick={() => navigate(s.path)}
            className="bg-primary border border-border rounded-2xl p-5 shadow-sm hover:border-accent-blue transition-all text-left flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-accent-blue">{s.icon}</div>
            <div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Recent payslips */}
      {payslips.length > 0 && (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold">Recent Payslips</h3>
            <button onClick={() => navigate('/employee/payslips')} className="text-xs font-bold text-accent-blue hover:underline">View All</button>
          </div>
          <div className="divide-y divide-border">
            {payslips.map((p: any) => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">
                    {p.payrollRun && new Date(p.payrollRun.startDate).toLocaleDateString()} – {p.payrollRun && new Date(p.payrollRun.endDate).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-slate-400">{p.payrollRun?.currency}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">{p.netPay?.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">Net Pay</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;
