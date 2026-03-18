const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { generateBankFile, generateThirdPartyPayments } = require('../utils/bankFile');
const { getSettingAsNumber } = require('../lib/systemSettings');

const router = express.Router();

const VALID_BANKS = ['FIDELITY', 'STANBIC', 'CBZ', 'ZB', 'AGRIBANK', 'NEDBANK', 'BANKBOD'];

router.get('/salary/:runId', requirePermission('export_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });

  const { runId } = req.params;
  const { bankCode = 'FIDELITY', format = 'txt' } = req.query;

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        payslips: true,
      },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (!['COMPLETED', 'LOCKED'].includes(run.status)) {
      return res.status(400).json({ message: 'Can only export bank files for completed payroll runs' });
    }

    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        accountNumber: true,
        bankName: true,
        bankBranch: true,
        paymentMethod: true,
        splitUsdPercent: true,
        idPassport: true,
        tin: true,
      },
    });

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });

    if (!company) return res.status(404).json({ message: 'Company not found' });

    if (!bankCode || !VALID_BANKS.includes(bankCode.toUpperCase())) {
      return res.status(400).json({
        message: `Invalid bank code. Valid options: ${VALID_BANKS.join(', ')}`,
      });
    }

    const content = generateBankFile(run, run.payslips, employees, company, {
      bankCode: bankCode.toUpperCase(),
      format,
    });

    const extensions = { csv: 'csv', txt: 'txt' };
    const filename = `SALARY_${bankCode.toUpperCase()}_${run.startDate.toISOString().slice(0, 7)}.${extensions[format] || 'txt'}`;

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/thirdparty/:runId', requirePermission('export_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });

  const { runId } = req.params;

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        payslips: true,
        transactions: {
          include: { transactionCode: true },
        },
      },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (!['COMPLETED', 'LOCKED'].includes(run.status)) {
      return res.status(400).json({ message: 'Can only export for completed payroll runs' });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });

    const totals = {
      paye: 0,
      nssaEmployee: 0,
      nssaEmployer: 0,
      necLevy: 0,
      aidsLevy: 0,
      wcifEmployer: 0,
      sdfEmployer: 0,
      uifEmployee: 0,
      uifEmployer: 0,
    };

    for (const payslip of run.payslips) {
      totals.paye += payslip.paye || 0;
      totals.nssaEmployee += payslip.nssaEmployee || 0;
      totals.aidsLevy += payslip.aidsLevy || 0;
      totals.necLevy += payslip.necLevy || 0;
      totals.wcifEmployer += payslip.wcifEmployer || 0;
      totals.sdfEmployer += payslip.sdfContribution || 0;
    }

    for (const txn of run.transactions) {
      const code = txn.transactionCode.code?.toUpperCase() || '';
      if (code === 'NSSA_EMPLOYER') {
        totals.nssaEmployer += txn.amount;
      }
    }

    const nssaEmployerRate = await getSettingAsNumber('NSSA_EMPLOYER_RATE', 4.5);
    if (totals.nssaEmployer === 0 && totals.nssaEmployee > 0) {
      totals.nssaEmployer = totals.nssaEmployee;
    }

    const content = generateThirdPartyPayments(run, totals, company);

    const filename = `THIRDPARTY_${run.startDate.toISOString().slice(0, 7)}.txt`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/summary/:runId', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });

  const { runId } = req.params;

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        payslips: true,
        transactions: {
          include: { transactionCode: true },
        },
      },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const summary = {
      runId: run.id,
      period: `${run.startDate.toISOString().slice(0, 10)} to ${run.endDate.toISOString().slice(0, 10)}`,
      currency: run.currency,
      status: run.status,
      employeeCount: run.payslips.length,
      totals: {
        gross: 0,
        paye: 0,
        aidsLevy: 0,
        nssaEmployee: 0,
        nssaEmployer: 0,
        necLevy: 0,
        totalDeductions: 0,
        netPay: 0,
      },
      byBank: {},
    };

    for (const payslip of run.payslips) {
      summary.totals.gross += payslip.gross || 0;
      summary.totals.paye += payslip.paye || 0;
      summary.totals.aidsLevy += payslip.aidsLevy || 0;
      summary.totals.nssaEmployee += payslip.nssaEmployee || 0;
      summary.totals.necLevy += payslip.necLevy || 0;
      summary.totals.netPay += payslip.netPay || 0;
    }

    for (const txn of run.transactions) {
      const code = txn.transactionCode.code?.toUpperCase() || '';
      if (code === 'NSSA_EMPLOYER') {
        summary.totals.nssaEmployer += txn.amount;
      }
    }

    summary.totals.totalDeductions = 
      summary.totals.paye + 
      summary.totals.nssaEmployee + 
      summary.totals.aidsLevy +
      summary.totals.necLevy;

    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId },
      select: { id: true, bankName: true, paymentMethod: true },
    });

    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

    for (const payslip of run.payslips) {
      const emp = empMap[payslip.employeeId];
      const bank = emp?.bankName || 'CASH';
      if (!summary.byBank[bank]) {
        summary.byBank[bank] = { count: 0, gross: 0, net: 0 };
      }
      summary.byBank[bank].count++;
      summary.byBank[bank].gross += payslip.gross || 0;
      summary.byBank[bank].net += payslip.netPay || 0;
    }

    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
