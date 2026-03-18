const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const { getSettingAsNumber } = require('../lib/systemSettings');

const router = express.Router();

router.get('/reconcile/:runId', requirePermission('view_reports'), async (req, res) => {
  try {
    const calendar = await prisma.payrollCalendar.findUnique({
      where: { id: payrollCalendarId },
    });

    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });
    if (calendar.isClosed) return res.status(400).json({ message: 'Period is already closed' });

    if (req.clientId && calendar.clientId !== req.clientId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = await prisma.$transaction(async (tx) => {
      const closedCalendar = await tx.payrollCalendar.update({
        where: { id: payrollCalendarId },
        data: { isClosed: true },
      });

      const { count: runsCompleted } = await tx.payrollRun.updateMany({
        where: { payrollCalendarId, status: 'PROCESSING' },
        data: { status: 'COMPLETED' },
      });

      return { closedCalendar, runsCompleted, repaymentsMarked: 0 };
    });

    res.json({
      message: 'Period-end processing completed',
      calendarId: payrollCalendarId,
      runsCompleted: results.runsCompleted,
      repaymentsMarked: results.repaymentsMarked,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/status', async (req, res) => {
  const { payrollCalendarId } = req.query;
  if (!payrollCalendarId) return res.status(400).json({ message: 'payrollCalendarId is required' });

  try {
    const [calendar, runsInProgress, pendingInputs] = await Promise.all([
      prisma.payrollCalendar.findUnique({ where: { id: payrollCalendarId } }),
      prisma.payrollRun.count({ where: { payrollCalendarId, status: { in: ['PROCESSING', 'DRAFT'] } } }),
      prisma.payrollInput.count({ where: { payrollRunId: null, processed: false } }),
    ]);

    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });

    res.json({
      calendar,
      runsInProgress,
      pendingInputs,
      readyToClose: runsInProgress === 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/lock/:runId', requirePermission('approve_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (run.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Only COMPLETED runs can be locked' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'LOCKED' },
    });

    await audit({ req, action: 'PAYROLL_RUN_LOCKED', resource: 'payroll_run', resourceId: run.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/unlock/:runId', requirePermission('approve_payroll'), async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ message: 'Unlock reason is required for audit trail' });

  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (run.status !== 'LOCKED') {
      return res.status(400).json({ message: 'Only LOCKED runs can be unlocked' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED' },
    });

    await audit({ req, action: 'PAYROLL_RUN_UNLOCKED', resource: 'payroll_run', resourceId: run.id, details: { reason } });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/auto-lock', requirePermission('approve_payroll'), async (req, res) => {
  const { daysPastEnd = 5 } = req.body;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysPastEnd));

    const runsToLock = await prisma.payrollRun.findMany({
      where: {
        companyId: req.companyId,
        status: 'COMPLETED',
        endDate: { lt: cutoffDate },
      },
    });

    if (runsToLock.length === 0) {
      return res.json({ message: 'No runs to auto-lock', count: 0 });
    }

    const result = await prisma.payrollRun.updateMany({
      where: {
        id: { in: runsToLock.map(r => r.id) },
      },
      data: { status: 'LOCKED' },
    });

    for (const run of runsToLock) {
      await audit({
        req,
        action: 'PAYROLL_RUN_AUTO_LOCKED',
        resource: 'payroll_run',
        resourceId: run.id,
        details: { reason: `Auto-lock: ${daysPastEnd} days past period end` },
      });
    }

    res.json({
      message: `Locked ${result.count} payroll runs`,
      count: result.count,
      runIds: runsToLock.map(r => r.id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/reconcile/:runId', requirePermission('view_reports'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: {
        payslips: true,
        transactions: {
          include: { transactionCode: true },
        },
      },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const payslipTotals = {
      gross: 0,
      paye: 0,
      aidsLevy: 0,
      nssaEmployee: 0,
      necLevy: 0,
      netPay: 0,
      wcifEmployer: 0,
      sdfContribution: 0,
      uifEmployee: 0,
      uifEmployer: 0,
    };

    for (const p of run.payslips) {
      payslipTotals.gross += p.gross || 0;
      payslipTotals.paye += p.paye || 0;
      payslipTotals.aidsLevy += p.aidsLevy || 0;
      payslipTotals.nssaEmployee += p.nssaEmployee || 0;
      payslipTotals.necLevy += p.necLevy || 0;
      payslipTotals.netPay += p.netPay || 0;
      payslipTotals.wcifEmployer += p.wcifEmployer || 0;
      payslipTotals.sdfContribution += p.sdfContribution || 0;
      payslipTotals.uifEmployee += p.uifEmployee || 0;
      payslipTotals.uifEmployer += p.uifEmployer || 0;
    }

    const transactionTotals = {
      earnings: 0,
      deductions: 0,
      employerContributions: 0,
    };

    for (const t of run.transactions) {
      if (t.transactionCode.category === 'EARNING') {
        transactionTotals.earnings += t.amount;
      } else if (t.transactionCode.category === 'DEDUCTION') {
        transactionTotals.deductions += t.amount;
      } else if (t.transactionCode.category === 'CONTRIBUTION') {
        transactionTotals.employerContributions += t.amount;
      }
    }

    const discrepancies = [];
    const tolerance = await getSettingAsNumber('RECONCILIATION_TOLERANCE', 0.01);

    if (Math.abs(payslipTotals.gross - transactionTotals.earnings) > tolerance) {
      discrepancies.push({
        field: 'gross',
        payslipTotal: payslipTotals.gross,
        transactionTotal: transactionTotals.earnings,
        difference: payslipTotals.gross - transactionTotals.earnings,
      });
    }

    res.json({
      runId: run.id,
      period: `${run.startDate.toISOString().slice(0, 10)} to ${run.endDate.toISOString().slice(0, 10)}`,
      employeeCount: run.payslips.length,
      payslipTotals,
      transactionTotals,
      discrepancies,
      isReconciled: discrepancies.length === 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reconcile/:runId/fix', requirePermission('process_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: {
        payslips: true,
        transactions: {
          include: { transactionCode: true },
        },
      },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (!['COMPLETED', 'LOCKED'].includes(run.status)) {
      return res.status(400).json({ message: 'Can only fix transactions for COMPLETED or LOCKED runs' });
    }

    const payslipTotals = {
      nssaEmployer: 0,
      wcifEmployer: 0,
      sdfContribution: 0,
      uifEmployer: 0,
    };

    for (const p of run.payslips) {
      payslipTotals.nssaEmployer += p.nssaEmployee || 0;
      payslipTotals.wcifEmployer += p.wcifEmployer || 0;
      payslipTotals.sdfContribution += p.sdfContribution || 0;
      payslipTotals.uifEmployer += p.uifEmployer || 0;
    }

    const existingCodes = {};
    for (const t of run.transactions) {
      const code = t.transactionCode.code?.toUpperCase();
      if (code) existingCodes[code] = true;
    }

    const clientId = run.company?.clientId;
    const createdTransactions = [];

    const result = await prisma.$transaction(async (tx) => {
      if (payslipTotals.nssaEmployer > 0 && !existingCodes['NSSA_EMPLOYER']) {
        let txnCode = await tx.transactionCode.findFirst({
          where: { clientId, code: 'NSSA_EMPLOYER' },
        });
        if (!txnCode) {
          txnCode = await tx.transactionCode.create({
            data: {
              clientId,
              code: 'NSSA_EMPLOYER',
              name: 'NSSA Employer Contribution',
              category: 'CONTRIBUTION',
              taxable: false,
            },
          });
        }
        await tx.payrollTransaction.create({
          data: {
            employeeId: run.payslips[0]?.employeeId,
            payrollRunId: run.id,
            transactionCodeId: txnCode.id,
            amount: payslipTotals.nssaEmployer,
            description: 'Auto-created NSSA employer contribution',
          },
        });
        createdTransactions.push({ code: 'NSSA_EMPLOYER', amount: payslipTotals.nssaEmployer });
      }

      if (payslipTotals.wcifEmployer > 0 && !existingCodes['WCIF']) {
        let txnCode = await tx.transactionCode.findFirst({
          where: { clientId, code: 'WCIF' },
        });
        if (!txnCode) {
          txnCode = await tx.transactionCode.create({
            data: {
              clientId,
              code: 'WCIF',
              name: 'Workers Compensation Insurance Fund',
              category: 'CONTRIBUTION',
              taxable: false,
            },
          });
        }
        await tx.payrollTransaction.create({
          data: {
            employeeId: run.payslips[0]?.employeeId,
            payrollRunId: run.id,
            transactionCodeId: txnCode.id,
            amount: payslipTotals.wcifEmployer,
            description: 'Auto-created WCIF contribution',
          },
        });
        createdTransactions.push({ code: 'WCIF', amount: payslipTotals.wcifEmployer });
      }

      if (payslipTotals.sdfContribution > 0 && !existingCodes['SDF']) {
        let txnCode = await tx.transactionCode.findFirst({
          where: { clientId, code: 'SDF' },
        });
        if (!txnCode) {
          txnCode = await tx.transactionCode.create({
            data: {
              clientId,
              code: 'SDF',
              name: 'Skills Development Levy',
              category: 'CONTRIBUTION',
              taxable: false,
            },
          });
        }
        await tx.payrollTransaction.create({
          data: {
            employeeId: run.payslips[0]?.employeeId,
            payrollRunId: run.id,
            transactionCodeId: txnCode.id,
            amount: payslipTotals.sdfContribution,
            description: 'Auto-created SDF contribution',
          },
        });
        createdTransactions.push({ code: 'SDF', amount: payslipTotals.sdfContribution });
      }

      if (payslipTotals.uifEmployer > 0 && !existingCodes['UIF_EMPLOYER']) {
        let txnCode = await tx.transactionCode.findFirst({
          where: { clientId, code: 'UIF_EMPLOYER' },
        });
        if (!txnCode) {
          txnCode = await tx.transactionCode.create({
            data: {
              clientId,
              code: 'UIF_EMPLOYER',
              name: 'Unemployment Insurance Fund Employer',
              category: 'CONTRIBUTION',
              taxable: false,
            },
          });
        }
        await tx.payrollTransaction.create({
          data: {
            employeeId: run.payslips[0]?.employeeId,
            payrollRunId: run.id,
            transactionCodeId: txnCode.id,
            amount: payslipTotals.uifEmployer,
            description: 'Auto-created UIF employer contribution',
          },
        });
        createdTransactions.push({ code: 'UIF_EMPLOYER', amount: payslipTotals.uifEmployer });
      }

      return createdTransactions;
    });

    await audit({
      req,
      action: 'RECONCILIATION_FIX',
      resource: 'payroll_run',
      resourceId: run.id,
      details: { createdTransactions: result },
    });

    res.json({
      message: 'Missing transactions created',
      runId: run.id,
      createdTransactions: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/annual-reconciliation', requirePermission('view_reports'), async (req, res) => {
  const { year } = req.query;

  if (!year) return res.status(400).json({ message: 'Year is required' });

  const targetYear = parseInt(year);
  const startDate = new Date(targetYear, 0, 1);
  const endDate = new Date(targetYear, 11, 31);

  try {
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        companyId: req.companyId,
        status: { in: ['COMPLETED', 'LOCKED'] },
        startDate: { gte: startDate },
        endDate: { lte: endDate },
      },
      include: {
        payslips: true,
      },
    });

    const employeeIds = [...new Set(payrollRuns.flatMap(r => r.payslips.map(p => p.employeeId)))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true, tin: true },
    });
    const employeeMap = Object.fromEntries(employees.map(e => [e.id, e]));

    const annualTotals = {};
    for (const empId of employeeIds) {
      annualTotals[empId] = {
        gross: 0,
        paye: 0,
        aidsLevy: 0,
        nssa: 0,
        netPay: 0,
      };
    }

    for (const run of payrollRuns) {
      for (const p of run.payslips) {
        annualTotals[p.employeeId].gross += p.gross || 0;
        annualTotals[p.employeeId].paye += p.paye || 0;
        annualTotals[p.employeeId].aidsLevy += p.aidsLevy || 0;
        annualTotals[p.employeeId].nssa += p.nssaEmployee || 0;
        annualTotals[p.employeeId].netPay += p.netPay || 0;
      }
    }

    const summary = {
      year: targetYear,
      employeeCount: employeeIds.length,
      totalGross: 0,
      totalPaye: 0,
      totalAidsLevy: 0,
      totalNssa: 0,
      totalNetPay: 0,
      employees: [],
    };

    for (const [empId, totals] of Object.entries(annualTotals)) {
      const emp = employeeMap[empId];
      summary.totalGross += totals.gross;
      summary.totalPaye += totals.paye;
      summary.totalAidsLevy += totals.aidsLevy;
      summary.totalNssa += totals.nssa;
      summary.totalNetPay += totals.netPay;
      summary.employees.push({
        employeeId: empId,
        name: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
        tin: emp?.tin,
        ...totals,
      });
    }

    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
