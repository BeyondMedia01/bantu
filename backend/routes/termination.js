const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const { getSettingAsNumber } = require('../lib/systemSettings');

const router = express.Router();

const ZIMBABWE_STATUTORY_LEAVE = {
  ANNUAL: { permanent: 24, contract: 'PRO_RATA' },
  SICK: { permanent: 90, contract: 90, certRequired: true },
  MATERNITY: { permanent: 98, contract: 98 },
  PATERNITY: { permanent: 2, contract: 2 },
};

const NOTICE_PERIOD_LABOUR_ACT = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 3,
};

const NOTICE_PERIOD_BY_GRADE = {
  A: 1,
  B: 1,
  C: 1,
  D: 7,
  E: 7,
  F: 30,
  G: 30,
  H: 30,
};

const SEVERANCE_EXEMPTION_DEFAULTS = {
  USD: 300000,
  ZiG: 1500000,
};

async function getSeveranceExemption(currency) {
  const severanceExemption = currency === 'ZiG' 
    ? await getSettingAsNumber('SEVERANCE_EXEMPTION_ZIG', SEVERANCE_EXEMPTION_DEFAULTS.ZiG)
    : await getSettingAsNumber('SEVERANCE_EXEMPTION_USD', SEVERANCE_EXEMPTION_DEFAULTS.USD);
  return severanceExemption;
}

router.get('/calculate/:employeeId', requirePermission('view_employees'), async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
      include: {
        necGrade: true,
        payrollRuns: {
          where: { status: { in: ['COMPLETED', 'LOCKED'] } },
          orderBy: { startDate: 'desc' },
          take: 3,
          include: { payslips: true },
        },
        leaveBalances: {
          include: { leaveType: true },
        },
      },
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const terminationData = await calculateTerminationBenefits(employee, req);
    res.json(terminationData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/process/:employeeId', requirePermission('manage_employees'), async (req, res) => {
  const { terminationDate, reason, noticePeriodMonths, createPayslip } = req.body;

  if (!terminationDate) return res.status(400).json({ message: 'Termination date is required' });

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
      include: {
        necGrade: true,
        payrollRuns: {
          where: { status: { in: ['COMPLETED', 'LOCKED'] } },
          orderBy: { startDate: 'desc' },
          take: 3,
          include: { payslips: true },
        },
        leaveBalances: {
          include: { leaveType: true },
        },
      },
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const terminationData = await calculateTerminationBenefits(employee, req, {
      terminationDate: new Date(terminationDate),
      reason,
      noticePeriodMonths,
    });

    const updated = await prisma.employee.update({
      where: { id: req.params.employeeId },
      data: {
        dischargeDate: new Date(terminationDate),
        dischargeReason: reason,
      },
    });

    await audit({
      req,
      action: 'EMPLOYEE_TERMINATED',
      resource: 'employee',
      resourceId: employee.id,
      details: {
        reason,
        terminationDate,
        noticePay: terminationData.noticePay.amount,
        severancePay: terminationData.severancePay.amount,
        leaveEncashment: terminationData.totalLeaveEncashment,
        totalBenefits: terminationData.totalTerminationBenefits,
      },
    });

    if (createPayslip) {
      const payslipRun = await createTerminationPayslip(employee, terminationData, req);
      return res.json({
        employee: updated,
        termination: terminationData,
        payslipRunId: payslipRun.id,
      });
    }

    res.json({
      employee: updated,
      termination: terminationData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/itf-batch', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });

  const { year } = req.query;
  const targetYear = parseInt(year) || new Date().getFullYear();

  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId },
      include: {
        payrollRuns: {
          where: {
            status: { in: ['COMPLETED', 'LOCKED'] },
            startDate: { gte: new Date(targetYear, 0, 1) },
            endDate: { lte: new Date(targetYear, 11, 31) },
          },
          include: { transactions: { include: { transactionCode: true } } },
        },
        payslips: {
          where: {
            payrollRun: {
              companyId: req.companyId,
              status: { in: ['COMPLETED', 'LOCKED'] },
              startDate: { gte: new Date(targetYear, 0, 1) },
              endDate: { lte: new Date(targetYear, 11, 31) },
            },
          },
        },
      },
    });

    const itfData = employees.map(emp => {
      let annualGross = 0;
      let annualPaye = 0;
      let annualAidsLevy = 0;
      let annualNssa = 0;
      let annualPension = 0;

      for (const run of emp.payrollRuns) {
        for (const txn of run.transactions) {
          if (txn.transactionCode.category === 'EARNING' && txn.transactionCode.taxable) {
            annualGross += txn.amount;
          }
          if (txn.transactionCode.code === 'PAYE') annualPaye += txn.amount;
          if (txn.transactionCode.code === 'AIDS_LEVY') annualAidsLevy += txn.amount;
          if (txn.transactionCode.code === 'NSSA_EMP' || txn.transactionCode.code === 'NSSA') {
            annualNssa += txn.amount;
          }
          if (txn.transactionCode.code === 'PENSION') annualPension += txn.amount;
        }
      }

      if (emp.payslips.length > 0) {
        annualPaye = emp.payslips.reduce((sum, p) => sum + (p.paye || 0), 0);
        annualAidsLevy = emp.payslips.reduce((sum, p) => sum + (p.aidsLevy || 0), 0);
        annualNssa = emp.payslips.reduce((sum, p) => sum + (p.nssaEmployee || 0), 0);
      }

      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        name: `${emp.firstName} ${emp.lastName}`,
        tin: emp.tin,
        idPassport: emp.idPassport,
        startDate: emp.startDate,
        dischargeDate: emp.dischargeDate,
        employmentType: emp.employmentType,
        year: targetYear,
        annualGross,
        annualPaye,
        annualAidsLevy,
        annualNssa,
        annualPension,
      };
    });

    res.json(itfData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

async function calculateTerminationBenefits(employee, req, options = {}) {
  const {
    terminationDate = new Date(),
    reason = 'VOLUNTARY_RESIGNATION',
    noticePeriodMonths = null,
  } = options;

  const startDate = new Date(employee.startDate);
  const yearsOfService = Math.max(0, (terminationDate - startDate) / (365.25 * 24 * 60 * 60 * 1000));
  const completedYears = Math.floor(yearsOfService);

  const lastPayroll = employee.payrollRuns[0];
  const lastPayslip = lastPayroll?.payslips[0];
  
  const lastDrawnSalary = lastPayslip?.gross || employee.baseRate;
  const currency = employee.currency || 'USD';

  const noticePay = calculateNoticePay(lastDrawnSalary, completedYears, employee.necGrade, noticePeriodMonths);
  const severancePay = await calculateSeverancePay(lastDrawnSalary, completedYears, currency, req);
  const leaveEncashment = await calculateLeaveEncashment(employee, terminationDate, req);

  const totalTerminationBenefits = noticePay.amount + severancePay.amount + leaveEncashment.totalEncashment;
  const taxOnSeverance = await calculateTerminationTax(severancePay.taxableAmount, currency);
  const taxOnLeaveEncashment = calculateLeaveEncashmentTax(leaveEncashment.totalEncashment, currency);
  const totalTaxOnTermination = taxOnSeverance + taxOnLeaveEncashment;

  return {
    employeeId: employee.id,
    terminationDate,
    reason,
    yearsOfService: Math.round(yearsOfService * 100) / 100,
    completedYears,
    baseRate: employee.baseRate,
    lastDrawnSalary,
    currency,
    noticePay,
    severancePay,
    leaveEncashment: leaveEncashment.breakdown,
    totalLeaveEncashment: leaveEncashment.totalEncashment,
    totalTerminationBenefits,
    estimatedTaxOnTermination: totalTaxOnTermination,
    taxBreakdown: {
      severanceTax: taxOnSeverance,
      leaveEncashmentTax: taxOnLeaveEncashment,
      totalTax: totalTaxOnTermination,
    },
    netTerminationBenefits: totalTerminationBenefits - totalTaxOnTermination,
  };
}

function calculateNoticePay(lastDrawnSalary, completedYears, employeeGrade = null, requestedMonths = null) {
  let noticeDays;
  let noticeMonths;
  let noticeBasis;
  
  if (requestedMonths !== null && requestedMonths > 0) {
    noticeMonths = requestedMonths;
    noticeDays = null;
    noticeBasis = `Requested notice period: ${requestedMonths} months`;
  } else if (employeeGrade) {
    const gradeLetter = employeeGrade.gradeCode?.charAt(0).toUpperCase() || 'A';
    noticeDays = NOTICE_PERIOD_BY_GRADE[gradeLetter] || 1;
    noticeMonths = Math.ceil(noticeDays / 30);
    noticeBasis = `Labour Act Grade ${gradeLetter}: ${noticeDays} days`;
  } else {
    noticeMonths = NOTICE_PERIOD_LABOUR_ACT[Math.min(completedYears, 5)] || 1;
    noticeDays = null;
    noticeBasis = completedYears >= 5 
      ? 'Labour Act (5+ years): 3 months' 
      : 'Labour Act (under 5 years): 1 month';
  }

  const noticePay = lastDrawnSalary * noticeMonths;

  return {
    months: noticeMonths,
    days: noticeDays,
    ratePerMonth: lastDrawnSalary,
    amount: noticePay,
    basis: noticeBasis,
    labourActReference: 'Labour Act Chapter 28:01',
  };
}

async function calculateSeverancePay(lastDrawnSalary, completedYears, currency, req) {
  const severanceExemption = await getSeveranceExemption(currency);
  
  const severanceDays = completedYears * 7;
  const dailyRate = lastDrawnSalary / 22;
  const grossSeverance = severanceDays * dailyRate;
  const exemptAmount = Math.min(grossSeverance, severanceExemption);
  const taxableAmount = Math.max(0, grossSeverance - severanceExemption);

  return {
    days: severanceDays,
    dailyRate,
    grossAmount: grossSeverance,
    exemptionThreshold: severanceExemption,
    exemptAmount,
    taxableAmount,
    amount: grossSeverance,
    basis: '7 days per completed year of service at daily rate (1/22 of monthly)',
    statutoryReference: 'Labour Act Chapter 28:01 Section 12',
  };
}

async function calculateLeaveEncashment(employee, terminationDate, req) {
  const currentYear = terminationDate.getFullYear();
  
  const lastPayroll = employee.payrollRuns[0];
  const lastDrawnSalary = lastPayroll?.payslips[0]?.gross || employee.baseRate;
  const dailyRate = lastDrawnSalary / 22;

  const encashableTypes = await prisma.leaveType.findMany({
    where: {
      clientId: employee.clientId,
      encashable: true,
      isActive: true,
    },
    include: { 
      balances: { 
        where: { employeeId: employee.id, year: currentYear } 
      } 
    },
  });

  let totalEncashment = 0;
  const breakdown = [];

  for (const lt of encashableTypes) {
    const balance = lt.balances[0];
    if (!balance) continue;

    const availableDays = (balance.accruedDays || 0) + (balance.broughtForward || 0)
                       - (balance.usedDays || 0) - (balance.encashedDays || 0);

    if (availableDays <= 0) continue;

    const encashmentRate = lt.encashmentRate || 1;
    const encashmentAmount = availableDays * dailyRate * encashmentRate;

    totalEncashment += encashmentAmount;
    breakdown.push({
      leaveType: lt.code,
      leaveTypeName: lt.name,
      days: availableDays,
      dailyRate,
      encashmentRate: encashmentRate * 100,
      amount: encashmentAmount,
    });
  }

  return { totalEncashment, breakdown };
}

async function calculateTerminationTax(taxableSeveranceAmount, currency = 'USD') {
  if (taxableSeveranceAmount <= 0) return 0;

  const USD_TAX_BANDS = [
    { lower: 0, upper: 100, rate: 0 },
    { lower: 100, upper: 300, rate: 0.20 },
    { lower: 300, upper: 1000, rate: 0.25 },
    { lower: 1000, upper: 2000, rate: 0.30 },
    { lower: 2000, upper: 3000, rate: 0.35 },
    { lower: 3000, upper: Infinity, rate: 0.40 },
  ];

  const ZIG_TAX_BANDS = [
    { lower: 0, upper: 2800, rate: 0 },
    { lower: 2800, upper: 8400, rate: 0.20 },
    { lower: 8400, upper: 28000, rate: 0.25 },
    { lower: 28000, upper: 56000, rate: 0.30 },
    { lower: 56000, upper: 84000, rate: 0.35 },
    { lower: 84000, upper: Infinity, rate: 0.40 },
  ];

  const bands = currency === 'ZiG' ? ZIG_TAX_BANDS : USD_TAX_BANDS;

  let tax = 0;
  for (const band of bands) {
    if (taxableSeveranceAmount <= band.lower) break;
    const taxableInBand = Math.min(taxableSeveranceAmount, band.upper) - band.lower;
    tax += taxableInBand * band.rate;
  }

  return Math.round(tax * 100) / 100;
}

function calculateLeaveEncashmentTax(encashmentAmount, currency = 'USD') {
  if (encashmentAmount <= 0) return 0;
  
  const monthlyEquivalent = encashmentAmount;
  
  const USD_TAX_BANDS = [
    { lower: 0, upper: 100, rate: 0 },
    { lower: 100, upper: 300, rate: 0.20 },
    { lower: 300, upper: 1000, rate: 0.25 },
    { lower: 1000, upper: 2000, rate: 0.30 },
    { lower: 2000, upper: 3000, rate: 0.35 },
    { lower: 3000, upper: Infinity, rate: 0.40 },
  ];

  const ZIG_TAX_BANDS = [
    { lower: 0, upper: 2800, rate: 0 },
    { lower: 2800, upper: 8400, rate: 0.20 },
    { lower: 8400, upper: 28000, rate: 0.25 },
    { lower: 28000, upper: 56000, rate: 0.30 },
    { lower: 56000, upper: 84000, rate: 0.35 },
    { lower: 84000, upper: Infinity, rate: 0.40 },
  ];

  const bands = currency === 'ZiG' ? ZIG_TAX_BANDS : USD_TAX_BANDS;
  const aidsLevyThreshold = currency === 'ZiG' ? 20000 : 500;

  let tax = 0;
  for (const band of bands) {
    if (monthlyEquivalent <= band.lower) break;
    const taxableInBand = Math.min(monthlyEquivalent, band.upper) - band.lower;
    tax += taxableInBand * band.rate;
  }

  const aidsLevy = monthlyEquivalent > aidsLevyThreshold ? monthlyEquivalent * 0.03 : 0;

  return Math.round((tax + aidsLevy) * 100) / 100;
}

async function createTerminationPayslip(employee, terminationData, req) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  let payrollRun = await prisma.payrollRun.findFirst({
    where: {
      companyId: employee.companyId,
      startDate: { gte: startOfMonth },
      endDate: { lte: endOfMonth },
      status: 'DRAFT',
    },
  });

  if (!payrollRun) {
    payrollRun = await prisma.payrollRun.create({
      data: {
        companyId: employee.companyId,
        startDate: startOfMonth,
        endDate: endOfMonth,
        runDate: now,
        status: 'DRAFT',
        currency: employee.currency || 'USD',
        notes: `Termination payment for ${employee.firstName} ${employee.lastName}`,
      },
    });
  }

  const terminationTxnCode = await prisma.transactionCode.findFirst({
    where: { clientId: employee.clientId, code: 'TERMINATION_BEN' },
  }) || await prisma.transactionCode.create({
    data: {
      clientId: employee.clientId,
      code: 'TERMINATION_BEN',
      name: 'Termination Benefits',
      category: 'EARNING',
      taxable: true,
      affectsPaye: true,
      affectsNssa: false,
      calculationType: 'FIXED',
    },
  });

  await prisma.payrollInput.create({
    data: {
      employeeId: employee.id,
      payrollRunId: payrollRun.id,
      transactionCodeId: terminationTxnCode.id,
      inputValue: terminationData.totalTerminationBenefits,
      notes: `Termination: Notice ${terminationData.noticePay.amount.toFixed(2)}, Severance ${terminationData.severancePay.amount.toFixed(2)}, Leave ${terminationData.totalLeaveEncashment.toFixed(2)}`,
    },
  });

  return payrollRun;
}

module.exports = router;
