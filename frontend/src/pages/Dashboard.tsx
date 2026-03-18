import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Plus, ArrowUpRight, MoreHorizontal, Clock, CheckCircle2, AlertTriangle, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ReportsAPI, DashboardAPI, PayrollCalendarAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import IntelligenceWidget from '../components/IntelligenceWidget';

const COLORS = ['#0F172A', '#3B82F6', '#E2E8F0'];

// ─── Filing Deadlines ─────────────────────────────────────────────────────────

interface Deadline {
  name: string;
  description: string;
  dueDate: Date;
  tag: 'ZIMRA' | 'NSSA';
}

function getUpcomingDeadlines(): Deadline[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlines: Deadline[] = [];

  // Generate PAYE + NSSA for the next 3 months
  for (let offset = 0; offset <= 2; offset++) {
    const ref = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const prevMonth = new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    // PAYE: 10th of each month (covers previous month's payroll)
    deadlines.push({
      name: 'PAYE Submission',
      description: `${prevMonth} payroll`,
      dueDate: new Date(y, m, 10),
      tag: 'ZIMRA',
    });

    // NSSA: last day of each month
    deadlines.push({
      name: 'NSSA Contribution',
      description: `${ref.toLocaleString('default', { month: 'long', year: 'numeric' })} contributions`,
      dueDate: new Date(y, m + 1, 0),
      tag: 'NSSA',
    });
  }

  // QPD (Quarterly Payment Dates): 25th of March, June, September, December
  const qpdMonths = [2, 5, 8, 11];
  for (const qm of qpdMonths) {
    const qYear = today.getMonth() > qm || (today.getMonth() === qm && today.getDate() > 25)
      ? today.getFullYear() + 1
      : today.getFullYear();
    deadlines.push({
      name: 'QPD',
      description: 'Quarterly Payment Date (ZIMRA)',
      dueDate: new Date(qYear, qm, 25),
      tag: 'ZIMRA',
    });
  }

  return deadlines
    .filter((d) => d.dueDate >= today)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 6);
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [reminders, setReminders] = useState<{ birthdays: any[], anniversaries: any[] }>({ birthdays: [], anniversaries: [] });
  const [trend, setTrend] = useState<{ name: string; netPay: number; grossPay: number; headcount: number }[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<any[]>([]);

  useEffect(() => {
    const cid = getActiveCompanyId();
    if (!cid) return;

    ReportsAPI.summary().then((res) => setSummary(res.data)).catch(() => {});
    DashboardAPI.reminders().then((res) => setReminders(res.data)).catch(() => {});
    ReportsAPI.payrollTrend().then((res) => setTrend(res.data)).catch(() => {});
    
    PayrollCalendarAPI.getAll({ companyId: cid })
      .then((res) => setCalendarData(res.data))
      .catch(() => {});
  }, [getActiveCompanyId()]);

  const pieData = summary
    ? [
        { name: 'Employees', value: Math.max(summary.employeeCount, 1) },
        { name: 'Pending Leave', value: Math.max(summary.pendingLeave, 0) },
        { name: 'Active Loans', value: Math.max(summary.activeLoans, 0) },
      ]
    : [{ name: 'Loading', value: 1 }];

  return (
    <div className="flex flex-col gap-8">
      {/* Intelligence Layer */}
      <IntelligenceWidget />

      {/* Main grid: chart | overview | reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Chart — spans 2 cols */}
        <div className="lg:col-span-2 bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">Net Pay Trend</p>
              <p className="text-3xl font-bold text-navy">
                {trend.length > 0
                  ? `$${trend[trend.length - 1].netPay.toLocaleString()}`
                  : summary?.employeeCount != null ? `${summary.employeeCount} Employees` : '—'}
              </p>
              <p className="text-xs text-slate-400 font-medium mt-1">
                {trend.length > 0 ? 'Last completed run' : 'No payroll runs yet'}
              </p>
            </div>
            <button
              onClick={() => navigate('/payroll/new')}
              className="flex items-center gap-2 bg-btn-primary text-navy px-4 py-2 rounded-full text-sm font-bold hover:opacity-90"
            >
              <Plus size={16} /> Run Payroll
            </button>
          </div>

          <div className="h-[240px] w-full">
            {trend.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0F172A" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="#0F172A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 600 }} dy={10} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                    formatter={(value, name) => [
                      `$${Number(value).toLocaleString()}`,
                      name === 'netPay' ? 'Net Pay' : 'Gross Pay',
                    ]}
                  />
                  <Area type="monotone" dataKey="grossPay" stroke="#CBD5E1" strokeWidth={2} fillOpacity={1} fill="url(#colorGross)" />
                  <Area type="monotone" dataKey="netPay" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-slate-400 font-medium text-sm">No payroll history yet.</p>
                <button
                  onClick={() => navigate('/payroll/new')}
                  className="text-accent-blue text-sm font-bold hover:underline"
                >
                  Run your first payroll →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Overview — 1 col */}
        <div className="flex flex-col gap-4">
          <div className="bg-primary rounded-2xl border border-border p-5 shadow-sm flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Overview</h3>
              <MoreHorizontal size={18} className="text-slate-400" />
            </div>
            <div className="flex justify-center mb-4">
              <div className="w-24 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={44} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <SummaryItem label="Employees" value={summary?.employeeCount ?? 0} color="bg-navy" />
              <SummaryItem label="Pending Leave" value={summary?.pendingLeave ?? 0} color="bg-accent-blue" />
              <SummaryItem label="Active Loans" value={summary?.activeLoans ?? 0} color="bg-slate-200" />
            </div>
            <button
              onClick={() => navigate('/employees/new')}
              className="w-full bg-btn-primary text-navy py-2.5 rounded-full font-bold shadow hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={15} /> Add Employee
            </button>
          </div>

          {summary?.lastRun && (
            <div className="p-4 rounded-2xl border border-border bg-primary shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Last Payroll</p>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={10} /> {summary.lastRun.status}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{new Date(summary.lastRun.runDate).toLocaleDateString()}</span>
                <ArrowUpRight size={16} className="text-slate-300" />
              </div>
            </div>
          )}

          <div className="p-4 rounded-2xl border border-accent-blue bg-blue-50/30 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Next Action</p>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-accent-blue">
                <Clock size={10} /> Pending
              </div>
            </div>
            <button onClick={() => navigate('/payroll/new')} className="text-sm font-bold text-accent-blue hover:underline">
              Start new payroll run →
            </button>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Payroll Calendar</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-1 hover:bg-slate-100 rounded">
                <ChevronLeft size={18} className="text-slate-400" />
              </button>
              <span className="text-sm font-bold">{currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-1 hover:bg-slate-100 rounded">
                <ChevronRight size={18} className="text-slate-400" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-[10px] font-bold text-slate-400 uppercase py-2">{d}</div>
            ))}
            {(() => {
              const year = currentMonth.getFullYear();
              const month = currentMonth.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const today = new Date();
              const cells = [];
              
              for (let i = 0; i < firstDay; i++) {
                cells.push(<div key={`empty-${i}`} />);
              }
              
              for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dateStr = date.toISOString().split('T')[0];
                const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
                
                const periods = calendarData.filter((p: any) => {
                  const start = new Date(p.startDate);
                  const end = new Date(p.endDate);
                  return date >= start && date <= end;
                });
                
                const hasPayPeriod = periods.length > 0;
                const status = periods[0]?.status;
                
                let bgClass = '';
                if (status === 'CLOSED') bgClass = 'bg-emerald-100 text-emerald-600';
                else if (status === 'OPEN') bgClass = 'bg-blue-100 text-blue-600';
                else if (hasPayPeriod) bgClass = 'bg-amber-100 text-amber-600';
                
                cells.push(
                  <div key={day} className={`py-2 text-sm font-medium rounded ${isToday ? 'bg-navy text-white' : bgClass || 'text-slate-600 hover:bg-slate-50'}`}>
                    {day}
                  </div>
                );
              }
              
              return cells;
            })()}
          </div>
          
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded bg-amber-100"></span>
              <span className="font-medium text-slate-500">Pay Period</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded bg-blue-100"></span>
              <span className="font-medium text-slate-500">Open</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded bg-emerald-100"></span>
              <span className="font-medium text-slate-500">Closed</span>
            </div>
          </div>
        </div>

        {/* Reminders — 1 col */}
        <RemindersCard reminders={reminders} compact />

      </div>

      {/* Filing Deadlines */}
      <FilingDeadlinesCard />

    </div>
  );
};

// ─── Reminders ────────────────────────────────────────────────────────────────

function daysUntilEvent(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  let target = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (target < today) target = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-600',
  'bg-amber-100 text-amber-600',
  'bg-violet-100 text-violet-600',
  'bg-teal-100 text-teal-600',
  'bg-blue-100 text-blue-600',
  'bg-emerald-100 text-emerald-600',
];

const RemindersCard: React.FC<{ reminders: { birthdays: any[]; anniversaries: any[] }; compact?: boolean }> = ({ reminders, compact }) => {
  const all = [
    ...reminders.birthdays.map((b) => ({ ...b, kind: 'birthday' as const })),
    ...reminders.anniversaries.map((a) => ({ ...a, kind: 'anniversary' as const })),
  ].sort((a, b) => daysUntilEvent(a.date) - daysUntilEvent(b.date));

  const total = all.length;

  return (
    <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎉</span>
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Reminders</h3>
        </div>
        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Next 30 Days</span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-slate-400 font-medium py-2 text-center">No upcoming birthdays or anniversaries.</p>
      ) : (
        <div className={compact ? 'flex flex-col gap-2 max-h-72 overflow-y-auto' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'}>
          {all.map((item, i) => {
            const days = daysUntilEvent(item.date);
            const isBirthday = item.kind === 'birthday';
            const colorClass = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const daysLabel = days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `In ${days} days`;
            const daysColor = days === 0 ? 'text-rose-600 bg-rose-50' : days <= 3 ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-50';
            const eventDate = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            return (
              <div key={`${item.kind}-${item.id}`} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-accent-blue/30 transition-colors">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black ${colorClass}`}>
                  {initials(item.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-navy truncate">{item.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium truncate">
                    {item.position} • {eventDate}
                    {!isBirthday && item.years > 0 && ` • ${item.years}yr`}
                  </p>
                </div>
                <div className={`shrink-0 text-right px-2 py-1 rounded-lg ${daysColor}`}>
                  <p className="text-[10px] font-black leading-tight">{daysLabel}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">{isBirthday ? '🎂 Birthday' : '🎊 Anniv.'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FilingDeadlinesCard: React.FC = () => {
  const deadlines = getUpcomingDeadlines();

  return (
    <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <CalendarClock size={18} className="text-slate-400" />
        <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Filing Deadlines</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {deadlines.map((d, i) => {
          const days = daysUntil(d.dueDate);
          const urgent = days <= 7;
          const soon = days <= 14;
          const tagColor = d.tag === 'ZIMRA'
            ? 'bg-blue-100 text-blue-600'
            : 'bg-teal-100 text-teal-600';
          const borderColor = urgent ? 'border-red-200 bg-red-50/40' : soon ? 'border-amber-200 bg-amber-50/30' : 'border-border';
          const daysColor = urgent ? 'text-red-600' : soon ? 'text-amber-600' : 'text-slate-400';

          return (
            <div key={i} className={`rounded-xl border p-3 flex flex-col gap-2 ${borderColor}`}>
              <div className="flex items-center justify-between gap-1">
                <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${tagColor}`}>
                  {d.tag}
                </span>
                {urgent && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
              </div>
              <div>
                <p className="text-xs font-bold text-navy leading-tight">{d.name}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-tight">{d.description}</p>
              </div>
              <div className="mt-auto">
                <p className="text-sm font-bold text-navy">{d.dueDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
                <p className={`text-[10px] font-bold ${daysColor}`}>
                  {days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days} days`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


const SummaryItem: React.FC<{ label: string; value: any; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-slate-400 font-bold uppercase">{label}</span>
    </div>
    <span className="text-sm font-bold">{value}</span>
  </div>
);

export default Dashboard;
