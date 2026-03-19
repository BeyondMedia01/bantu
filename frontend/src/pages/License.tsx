import React, { useEffect, useState } from 'react';
import { Shield, Loader, CheckCircle2, XCircle, Clock, Users, Calendar, AlertTriangle } from 'lucide-react';
import { LicenseAPI, type LicenseStatus } from '../api/client';
import { getUser } from '../lib/auth';

const License: React.FC = () => {
  const user = getUser();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const isClientAdmin = user?.role === 'CLIENT_ADMIN';
  const [licenses, setLicenses] = useState<any[]>([]);
  const [myLicense, setMyLicense] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const load = async () => {
    setLoading(true);
    if (isClientAdmin) {
      try {
        const res = await LicenseAPI.getStatus();
        setMyLicense(res.data);
      } catch (err) {
        console.error('Failed to load license status', err);
      }
    }
    if (isAdmin) {
      try {
        const res = await LicenseAPI.getAll();
        setLicenses(res.data);
      } catch (err) {
        console.error('Failed to load licenses', err);
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRevoke = async (clientId: string) => {
    if (!confirm('Revoke this license?')) return;
    setActionLoading(clientId);
    try { await LicenseAPI.revoke(clientId); load(); } catch {}
    setActionLoading('');
  };

  const handleReactivate = async (clientId: string) => {
    setActionLoading(clientId);
    try { await LicenseAPI.reactivate(clientId, 12); load(); } catch {}
    setActionLoading('');
  };

  const getDaysUntilExpiry = (expiresAt: string) => {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getExpiryColor = (days: number) => {
    if (days < 0) return 'text-red-600 bg-red-50';
    if (days <= 30) return 'text-amber-600 bg-amber-50';
    return 'text-emerald-600 bg-emerald-50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  // CLIENT_ADMIN view - show their own license status
  if (isClientAdmin) {
    const daysLeft = myLicense?.expiresAt ? getDaysUntilExpiry(myLicense.expiresAt) : 0;
    const expiryColor = getExpiryColor(daysLeft);
    const usagePercent = myLicense ? Math.round((myLicense.employeeCount / myLicense.employeeCap) * 100) : 0;

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">License Status</h1>
          <p className="text-slate-500 text-sm font-medium">Your organization license information</p>
        </div>

        {myLicense ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Status Card */}
            <div className="bg-primary rounded-2xl border border-border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${myLicense.valid ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {myLicense.valid ? <CheckCircle2 size={20} className="text-emerald-600" /> : <XCircle size={20} className="text-red-600" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</p>
                  <p className={`font-bold ${myLicense.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {myLicense.valid ? 'Active' : 'Invalid'}
                  </p>
                </div>
              </div>
            </div>

            {/* Expiry Card */}
            <div className="bg-primary rounded-2xl border border-border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${expiryColor}`}>
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expires</p>
                  <p className="font-bold">{new Date(myLicense.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>
              <p className={`text-xs font-bold ${expiryColor} px-2 py-1 rounded-full inline-block`}>
                {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} days ago` : `${daysLeft} days remaining`}
              </p>
            </div>

            {/* Employee Cap Card */}
            <div className="bg-primary rounded-2xl border border-border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100">
                  <Users size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Employees</p>
                  <p className="font-bold">{myLicense.employeeCount} / {myLicense.employeeCap}</p>
                </div>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-accent-blue'}`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Organization Card */}
            <div className="bg-primary rounded-2xl border border-border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100">
                  <Shield size={20} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Organization</p>
                  <p className="font-bold truncate">{myLicense.clientName}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-primary rounded-2xl border border-border p-8 text-center">
            <Shield size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">No license information found</p>
          </div>
        )}

        {/* Warning Banner */}
        {myLicense && daysLeft <= 30 && daysLeft >= 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 mb-6">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-amber-800">License Expiring Soon</p>
              <p className="text-sm text-amber-700">Your license expires in {daysLeft} days. Contact Bantu to renew.</p>
            </div>
          </div>
        )}

        {myLicense && daysLeft < 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 mb-6">
            <XCircle size={20} className="text-red-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-red-800">License Expired</p>
              <p className="text-sm text-red-700">Your license has expired. Contact Bantu to renew.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PLATFORM_ADMIN view - list all licenses
  if (!isAdmin) return (
    <div className="text-center py-16 text-slate-400">
      <Shield size={40} className="mx-auto mb-3 opacity-30" />
      <p className="font-medium">License information not available</p>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">License Management</h1>
        <p className="text-slate-500 text-sm font-medium">Manage client licenses</p>
      </div>

      {licenses.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-primary rounded-2xl border border-border">
          <Shield size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No licenses found</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Client', 'Token (partial)', 'Issued', 'Expires', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {licenses.map((lic: any) => {
                const isActive = lic.active && (!lic.expiresAt || new Date(lic.expiresAt) > new Date());
                return (
                  <tr key={lic.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-bold text-sm">{lic.client?.name || lic.clientId}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-400">{lic.token?.slice(0, 12)}…</td>
                    <td className="px-4 py-3 text-sm">{lic.createdAt ? new Date(lic.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-sm">{lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {actionLoading === lic.clientId ? (
                        <Clock size={14} className="text-slate-400 animate-spin" />
                      ) : isActive ? (
                        <button onClick={() => handleRevoke(lic.clientId)} className="text-xs font-bold text-red-500 hover:underline">
                          Revoke
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(lic.clientId)} className="text-xs font-bold text-accent-blue hover:underline">
                          Reactivate (12mo)
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default License;
