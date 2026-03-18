import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Building, Shield, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { PortalExportAPI } from '../api/client';

interface ExportButtonProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  loading?: boolean;
  lastExport?: string;
}

const ExportButton: React.FC<ExportButtonProps> = ({ title, description, icon, color, onClick, loading, lastExport }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={`bg-primary border border-border rounded-2xl p-6 text-left hover:border-${color} hover:shadow-md transition-all flex flex-col gap-3 disabled:opacity-50`}
  >
    <div className={`w-12 h-12 ${color.replace('text-', 'bg-').replace('600', '100').replace('500', '100').replace('700', '100')} rounded-xl flex items-center justify-center ${color}`}>
      {icon}
    </div>
    <div>
      <h3 className="font-bold text-navy mb-1">{title}</h3>
      <p className="text-sm text-slate-500 font-medium">{description}</p>
    </div>
    {lastExport && (
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Clock size={12} />
        <span>Last: {lastExport}</span>
      </div>
    )}
  </button>
);

const PortalExports: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (type: string, downloadFn: () => Promise<any>, filename: string) => {
    setLoading(type);
    setError(null);
    setSuccess(null);
    
    try {
      const res = await downloadFn();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      setSuccess(`${type} exported successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to export ${type}`);
    }
    setLoading(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-slate-100 rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Portal Exports</h1>
          <p className="text-slate-500">Generate filing-ready files for ZIMRA and NSSA portals</p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-600 rounded-xl mb-6">
          <CheckCircle size={18} />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl mb-6">
          <AlertCircle size={18} />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* ZIMRA Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Building size={18} className="text-navy" />
          <h2 className="text-lg font-bold">ZIMRA e-Taxes</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">Generate PAYE files in the exact format required for ZIMRA e-Taxes portal upload.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ExportButton
            title="Monthly PAYE File"
            description="Employee earnings & deductions for monthly filing"
            icon={<FileText size={24} />}
            color="text-blue-600"
            loading={loading === 'zimra'}
            onClick={() => handleDownload('ZIMRA', () => 
              PortalExportAPI.downloadZimra(), 
              `ZIMRA_PAYE_${new Date().toISOString().split('T')[0]}.csv`
            )}
          />
          <ExportButton
            title="PAYE Schedule (Annual)"
            description="Annual tax computation for year-end filing"
            icon={<FileText size={24} />}
            color="text-blue-600"
            loading={loading === 'paye-annual'}
            onClick={() => handleDownload('PAYE Annual', () => 
              PortalExportAPI.downloadZimra({ year: new Date().getFullYear().toString() }), 
              `ZIMRA_PAYE_ANNUAL_${new Date().getFullYear()}.csv`
            )}
          />
        </div>
      </div>

      {/* NSSA Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-navy" />
          <h2 className="text-lg font-bold">NSSA Portal</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">Generate contribution files and annual returns for NSSA e-filing.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ExportButton
            title="Monthly Contributions"
            description="Employee & employer NSSA contributions for portal upload"
            icon={<Shield size={24} />}
            color="text-teal-600"
            loading={loading === 'nssa'}
            onClick={() => handleDownload('NSSA', () => 
              PortalExportAPI.downloadNssa(), 
              `NSSA_CONTRIBUTION_${new Date().toISOString().split('T')[0]}.csv`
            )}
          />
          <ExportButton
            title="P4A Annual Return"
            description="Annual NSSA P4A report for all employees"
            icon={<FileText size={24} />}
            color="text-teal-600"
            loading={loading === 'p4a'}
            onClick={() => handleDownload('P4A', () => 
              PortalExportAPI.downloadP4A(new Date().getFullYear()), 
              `NSSA_P4A_${new Date().getFullYear()}.csv`
            )}
          />
        </div>
      </div>

      {/* Compliance Features */}
      <div className="bg-slate-50 rounded-2xl p-6">
        <h3 className="font-bold text-navy mb-4">Zero-Touch Compliance Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-slate-600">Automatic PAYE calculations with tax tables</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-slate-600">NSSA ceiling (ZW$500,000) applied automatically</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-slate-600">4.5% employer + employee contributions calculated</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-slate-600">AIDS Levy (3%) included in deductions</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-slate-600">Employee TIN validation format</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <span className="text-slate-600">HDR/EMP/TRL record structure</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalExports;