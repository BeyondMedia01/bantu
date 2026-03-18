const prisma = require('../lib/prisma');

async function detectFraud(clientId, companyId) {
  // Fraud flags to return
  const alerts = [];

  // Query all active employees in this company
  const employees = await prisma.employee.findMany({
    where: { 
      clientId, 
      companyId,
      dischargeDate: null 
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      idPassport: true,
      accountNumber: true,
      bankName: true,
      employeeCode: true
    }
  });

  // 1. Detect duplicate Bank Accounts
  const accountsMap = {};
  employees.forEach(emp => {
    if (emp.accountNumber && emp.accountNumber.trim() !== '') {
      const acc = emp.accountNumber.trim().replace(/\s/g, '');
      if (!accountsMap[acc]) accountsMap[acc] = [];
      accountsMap[acc].push(emp);
    }
  });

  Object.values(accountsMap).forEach(duplicates => {
    if (duplicates.length > 1) {
      alerts.push({
        type: 'DUPLICATE_BANK_ACCOUNT',
        severity: 'high',
        message: `Multiple employees share the same bank account number.`,
        employees: duplicates.map(d => ({ id: d.id, name: `${d.firstName} ${d.lastName}`, code: d.employeeCode }))
      });
    }
  });

  // 2. Detect duplicate IDs/Passports
  const idsMap = {};
  employees.forEach(emp => {
    if (emp.idPassport && emp.idPassport.trim() !== '') {
      const idStr = emp.idPassport.trim().toUpperCase();
      if (!idsMap[idStr]) idsMap[idStr] = [];
      idsMap[idStr].push(emp);
    }
  });

  Object.values(idsMap).forEach(duplicates => {
    if (duplicates.length > 1) {
      alerts.push({
        type: 'DUPLICATE_ID_PASSPORT',
        severity: 'critical',
        message: `Multiple employees share the same ID/Passport number.`,
        employees: duplicates.map(d => ({ id: d.id, name: `${d.firstName} ${d.lastName}`, code: d.employeeCode }))
      });
    }
  });

  return alerts;
}

async function generateSmartAlerts(clientId, companyId) {
  const alerts = [];

  // 1. Check for payroll cost variance (>15% increase)
  // Fetch last two finalized (or at least processed) payroll runs ordered by date desc
  const recentRuns = await prisma.payrollRun.findMany({
    where: {
      companyId,
      status: { in: ['COMPLETED', 'APPROVED', 'PROCESSING'] }
    },
    orderBy: {
      runDate: 'desc'
    },
    take: 2,
    include: {
      payslips: {
        select: {
          gross: true
        }
      }
    }
  });

  if (recentRuns.length === 2) {
    const latestRun = recentRuns[0];
    const previousRun = recentRuns[1];

    const latestTotal = latestRun.payslips.reduce((sum, p) => sum + p.gross, 0);
    const previousTotal = previousRun.payslips.reduce((sum, p) => sum + p.gross, 0);

    if (previousTotal > 0) {
      const variance = (latestTotal - previousTotal) / previousTotal;
      if (variance > 0.15) {
        alerts.push({
          type: 'PAYROLL_COST_INCREASE',
          severity: 'warning',
          message: `Payroll costs increased by ${(variance * 100).toFixed(1)}% compared to the previous run. Please verify overtime and bonuses.`,
          actionLink: `/payroll/runs/${latestRun.id}`,
          actionText: 'Review Payroll Run'
        });
      }
    }
  }

  // 2. Employees missing bank details where paymentMethod = BANK
  const missingBankEmps = await prisma.employee.findMany({
    where: {
      clientId,
      companyId,
      dischargeDate: null,
      paymentMethod: 'BANK',
      OR: [
        { accountNumber: { equals: null } },
        { accountNumber: { equals: '' } }
      ]
    },
    select: {
      id: true,
      firstName: true,
      lastName: true
    }
  });

  if (missingBankEmps.length > 0) {
    alerts.push({
      type: 'MISSING_BANK_DETAILS',
      severity: 'medium',
      message: `${missingBankEmps.length} employee(s) are set to Bank payment but lack account details.`,
      actionLink: `/employees`,
      actionText: 'Update Employees',
      details: missingBankEmps.map(e => `${e.firstName} ${e.lastName}`)
    });
  }

  return alerts;
}

module.exports = {
  detectFraud,
  generateSmartAlerts
};
