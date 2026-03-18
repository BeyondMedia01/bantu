const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { generatePayslipPDF, generateP16PDF } = require('../utils/pdfService');

const router = express.Router();

// ─── Payslip Report ───────────────────────────────────────────────────────────

// GET /api/reports/payslips?runId=&format=csv|pdf
router.get('/payslips', requirePermission('view_reports'), async (req, res) => {
  const { runId, format = 'csv' } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });

  try {
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }],
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Position,Gross,PAYE,AIDS Levy,NSSA,Net Pay,Currency\n';
      const rows = payslips.map((p) =>
        [
          p.employee.employeeCode || '',
          `${p.employee.firstName} ${p.employee.lastName}`,
          p.employee.position || '',
          p.gross.toFixed(2),
          p.paye.toFixed(2),
          p.aidsLevy.toFixed(2),
          p.nssaEmployee.toFixed(2),
          p.netPay.toFixed(2),
          p.employee.currency || 'USD',
        ].join(',')
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=payslips-${runId}.csv`);
      return res.send(header + rows);
    }

    res.json(payslips);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Tax Report (P16) ─────────────────────────────────────────────────────────

// GET /api/reports/tax?companyId=&year=&format=pdf|json
router.get('/tax', requirePermission('export_reports'), async (req, res) => {
  const { companyId, year, format = 'json' } = req.query;
  const targetCompanyId = companyId || req.companyId;
  if (!targetCompanyId) return res.status(400).json({ message: 'companyId required' });

  try {
    const startDate = new Date(`${year || new Date().getFullYear()}-01-01`);
    const endDate = new Date(`${year || new Date().getFullYear()}-12-31`);

    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: {
          companyId: targetCompanyId,
          startDate: { gte: startDate },
          endDate: { lte: endDate },
          status: 'COMPLETED',
        },
      },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
    });

    // Aggregate per employee
    const byEmployee = {};
    for (const ps of payslips) {
      const key = ps.employeeId;
      if (!byEmployee[key]) {
        byEmployee[key] = {
          employee: ps.employee,
          company: ps.payrollRun.company,
          totalGross: 0,
          totalPaye: 0,
          totalAidsLevy: 0,
          totalNssa: 0,
          totalNet: 0,
          totalWcif: 0,
          totalSdf: 0,
          totalNecLevy: 0,
        };
      }
      byEmployee[key].totalGross      += ps.gross;
      byEmployee[key].totalPaye       += ps.paye;
      byEmployee[key].totalAidsLevy   += ps.aidsLevy;
      byEmployee[key].totalNssa       += ps.nssaEmployee;
      byEmployee[key].totalNet        += ps.netPay;
      byEmployee[key].totalWcif       += ps.wcifEmployer   || 0;
      byEmployee[key].totalSdf        += ps.sdfContribution || 0;
      byEmployee[key].totalNecLevy    += ps.necLevy        || 0;
    }

    const data = Object.values(byEmployee);

    if (format === 'pdf' && data.length > 0) {
      const firstCompany = data[0].company;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=P16-${year || new Date().getFullYear()}.pdf`);
      return generateP16PDF({ company: firstCompany, year: year || new Date().getFullYear(), rows: data }, res);
    }

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Leave Report ─────────────────────────────────────────────────────────────

// GET /api/reports/leave?startDate=&endDate=&format=csv|json
router.get('/leave', requirePermission('view_reports'), async (req, res) => {
  const { startDate, endDate, format = 'json' } = req.query;
  try {
    const where = {
      ...(req.companyId && { employee: { companyId: req.companyId } }),
      ...(startDate && { startDate: { gte: new Date(startDate) } }),
      ...(endDate && { endDate: { lte: new Date(endDate) } }),
    };

    const records = await prisma.leaveRecord.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Type,Start Date,End Date,Days,Status\n';
      const rows = records.map((r) =>
        [
          r.employee.employeeCode || '',
          `${r.employee.firstName} ${r.employee.lastName}`,
          r.type,
          r.startDate.toLocaleDateString(),
          r.endDate.toLocaleDateString(),
          r.totalDays,
          r.status,
        ].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=leave-report.csv');
      return res.send(header + rows);
    }

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Loans Report ─────────────────────────────────────────────────────────────

// GET /api/reports/loans?status=&format=csv|json
router.get('/loans', requirePermission('view_reports'), async (req, res) => {
  const { status, format = 'json' } = req.query;
  try {
    const where = {
      ...(req.companyId && { employee: { companyId: req.companyId } }),
      ...(status && { status }),
    };

    const loans = await prisma.loan.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        _count: { select: { repayments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Amount,Interest Rate,Term (Months),Status,Start Date\n';
      const rows = loans.map((l) =>
        [
          l.employee.employeeCode || '',
          `${l.employee.firstName} ${l.employee.lastName}`,
          l.amount.toFixed(2),
          l.interestRate.toFixed(2),
          l.termMonths,
          l.status,
          l.startDate.toLocaleDateString(),
        ].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=loans-report.csv');
      return res.send(header + rows);
    }

    res.json(loans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Departments / Headcount Report ──────────────────────────────────────────

// GET /api/reports/departments
router.get('/departments', requirePermission('view_reports'), async (req, res) => {
  try {
    const where = req.companyId ? { companyId: req.companyId } : {};

    const departments = await prisma.department.findMany({
      where,
      include: {
        _count: { select: { employees: true } },
        company: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(departments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Journals Report ──────────────────────────────────────────────────────────

// GET /api/reports/journals?runId=&format=csv|json
router.get('/journals', requirePermission('view_reports'), async (req, res) => {
  const { runId, format = 'json' } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });

  try {
    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        transactionCode: { select: { code: true, name: true, type: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { transactionCode: { code: 'asc' } }],
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Transaction Code,Description,Type,Amount,Currency\n';
      const rows = transactions.map((t) =>
        [
          t.employee.employeeCode || '',
          `${t.employee.firstName} ${t.employee.lastName}`,
          t.transactionCode?.code || '',
          t.description || '',
          t.transactionCode?.type || '',
          t.amount.toFixed(2),
          t.currency,
        ].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=journals-${runId}.csv`);
      return res.send(header + rows);
    }

    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Summary Stats ────────────────────────────────────────────────────────────

// GET /api/reports/summary — high-level dashboard stats
router.get('/summary', requirePermission('view_reports'), async (req, res) => {
  try {
    const companyWhere = req.companyId ? { companyId: req.companyId } : {};
    const runWhere = req.companyId ? { companyId: req.companyId } : {};

    const [employeeCount, lastRun, pendingLeave, activeLoans] = await Promise.all([
      prisma.employee.count({ where: companyWhere }),
      prisma.payrollRun.findFirst({ where: { ...runWhere, status: 'COMPLETED' }, orderBy: { runDate: 'desc' } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING', ...(req.companyId && { employee: { companyId: req.companyId } }) } }),
      prisma.loan.count({ where: { status: 'ACTIVE', ...(req.companyId && { employee: { companyId: req.companyId } }) } }),
    ]);

    res.json({ employeeCount, lastRun, pendingLeave, activeLoans });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Payroll Trend ────────────────────────────────────────────────────────────

// GET /api/reports/payroll-trend — last 6 completed runs with total net pay
router.get('/payroll-trend', requirePermission('view_reports'), async (req, res) => {
  try {
    const runs = await prisma.payrollRun.findMany({
      where: {
        ...(req.companyId && { companyId: req.companyId }),
        status: 'COMPLETED',
      },
      orderBy: { runDate: 'asc' },
      take: -6, // last 6
      include: {
        payslips: { select: { netPay: true } },
      },
    });

    const data = runs.map((run) => {
      const totalNet = run.payslips.reduce((sum, p) => sum + (p.netPay || 0), 0);
      const totalGross = run.payslips.reduce((sum, p) => sum + (p.gross || 0), 0);
      return {
        name: new Date(run.runDate).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        netPay: Math.round(totalNet),
        grossPay: Math.round(totalGross),
        headcount: run.payslips.length,
      };
    });

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
