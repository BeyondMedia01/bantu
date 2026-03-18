const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { calculatePaye } = require('../utils/taxEngine');
const { generatePayslipPDF } = require('../utils/pdfService');
const { getSettingAsNumber } = require('../lib/systemSettings');
const { audit } = require('../lib/audit');
const { validateBody } = require('../lib/validate');

const router = express.Router();

// ─── GET /api/payroll ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { status } = req.query;
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

  try {
    const [runs, employeeCount] = await Promise.all([
      prisma.payrollRun.findMany({
        where: {
          companyId: req.companyId,
          ...(status && { status }),
        },
        include: { _count: { select: { payslips: true } } },
        orderBy: { runDate: 'desc' },
      }),
      prisma.employee.count({ where: { companyId: req.companyId } }),
    ]);
    res.json(runs.map((r) => ({ ...r, employeeCount })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll — create a DRAFT run (no payslips yet) ─────────────────

router.post(
  '/',
  requirePermission('manage_payroll'),
  validateBody({
    startDate: { required: true, isDate: true },
    endDate:   { required: true, isDate: true },
  }),
  async (req, res) => {
    const { startDate, endDate, currency, exchangeRate, dualCurrency, payrollCalendarId, notes } = req.body;
    if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ message: 'endDate must be after startDate' });
    }

    const isDual = dualCurrency === true || dualCurrency === 'true';
    if (isDual && (!exchangeRate || parseFloat(exchangeRate) <= 1)) {
      return res.status(400).json({ message: 'A valid USD→ZiG exchange rate (>1) is required for dual-currency runs' });
    }

    try {
      const run = await prisma.payrollRun.create({
        data: {
          companyId: req.companyId,
          payrollCalendarId: payrollCalendarId || null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currency: isDual ? 'USD' : (currency || 'USD'),
          exchangeRate: parseFloat(exchangeRate || 1),
          dualCurrency: isDual,
          status: 'DRAFT',
          notes: notes || null,
        },
      });

      await audit({
        req,
        action: 'PAYROLL_RUN_CREATED',
        resource: 'payroll_run',
        resourceId: run.id,
        details: { currency: run.currency, startDate, endDate, status: 'DRAFT' },
      });

      res.status(201).json(run);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── POST /api/payroll/:runId/submit — DRAFT → PENDING_APPROVAL ───────────────

router.post('/:runId/submit', requirePermission('manage_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (run.status !== 'DRAFT') return res.status(400).json({ message: 'Only DRAFT runs can be submitted for approval' });

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'PENDING_APPROVAL' },
    });

    await audit({ req, action: 'PAYROLL_RUN_SUBMITTED', resource: 'payroll_run', resourceId: run.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll/:runId/approve — PENDING_APPROVAL → APPROVED ──────────

router.post('/:runId/approve', requirePermission('approve_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (!['PENDING_APPROVAL', 'DRAFT'].includes(run.status)) {
      return res.status(400).json({ message: 'Only DRAFT or PENDING_APPROVAL runs can be approved' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'APPROVED' },
    });

    await audit({ req, action: 'PAYROLL_RUN_APPROVED', resource: 'payroll_run', resourceId: run.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll/:runId/process — calculate payslips (APPROVED/DRAFT) ──

router.post('/:runId/process', requirePermission('process_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (!['DRAFT', 'APPROVED', 'ERROR'].includes(run.status)) {
      return res.status(400).json({ message: 'Only DRAFT, APPROVED, or ERROR runs can be processed' });
    }

    // Fetch tax table: try period-matched first, then fall back to most recent for the client
    const fetchTaxTable = async (clientId, currency, date) => {
      const matched = await prisma.taxTable.findFirst({
        where: {
          clientId,
          currency,
          effectiveDate: { lte: date },
          OR: [{ expiryDate: null }, { expiryDate: { gte: date } }],
        },
        include: { brackets: true },
        orderBy: { effectiveDate: 'desc' },
      });
      if (matched) return matched;
      // Fallback: use the most recently created table for this client/currency
      return prisma.taxTable.findFirst({
        where: { clientId, currency },
        include: { brackets: true },
        orderBy: { createdAt: 'desc' },
      });
    };

    // Fetch active tax table(s)
    const taxTableUSD = await fetchTaxTable(run.company.clientId, 'USD', run.startDate);
    const taxBracketsUSD = taxTableUSD?.brackets ?? [];
    const annualBracketsUSD = taxBracketsUSD.length > 0; // DB brackets are annual (FDS)

    let taxBracketsZIG = [];
    let annualBracketsZIG = false;
    if (run.dualCurrency || run.currency === 'ZiG') {
      const taxTableZIG = await fetchTaxTable(run.company.clientId, 'ZiG', run.startDate);
      taxBracketsZIG = taxTableZIG?.brackets ?? [];
      annualBracketsZIG = taxBracketsZIG.length > 0;
    }

    const taxBrackets = run.currency === 'ZiG' ? taxBracketsZIG : taxBracketsUSD;
    const annualBrackets = run.currency === 'ZiG' ? annualBracketsZIG : annualBracketsUSD;

    // NSSA ceiling from SystemSettings (falls back to engine defaults)
    const nssaCeilingUSD = await getSettingAsNumber('NSSA_CEILING_USD', 700);
    const nssaCeilingZIG = await getSettingAsNumber('NSSA_CEILING_ZIG', 20000);
    const nssaCeiling = run.currency === 'ZiG' ? nssaCeilingZIG : nssaCeilingUSD;

    // Bonus exemption threshold (ZIMRA)
    const bonusExemptionUSD = await getSettingAsNumber('BONUS_EXEMPTION_USD', 0);
    const bonusExemptionZIG = await getSettingAsNumber('BONUS_EXEMPTION_ZIG', 0);
    const bonusExemption = run.currency === 'ZiG' ? bonusExemptionZIG : bonusExemptionUSD;

    // Severance / retrenchment exemption threshold
    const severanceExemptionUSD = await getSettingAsNumber('SEVERANCE_EXEMPTION_USD', 0);
    const severanceExemptionZIG = await getSettingAsNumber('SEVERANCE_EXEMPTION_ZIG', 0);
    const severanceExemption = run.currency === 'ZiG' ? severanceExemptionZIG : severanceExemptionUSD;

    // Industry-specific WCIF and SDF rates: company setting overrides global SystemSetting
    const globalWcifRate = await getSettingAsNumber('WCIF_RATE', 0);
    const globalSdfRate  = await getSettingAsNumber('SDF_RATE', 0);
    const wcifRate = run.company.wcifRate ?? globalWcifRate;
    const sdfRate  = run.company.sdfRate  ?? globalSdfRate;

    const employees = await prisma.employee.findMany({
      where: { companyId: run.companyId },
      include: { necGrade: true },
    });

    if (employees.length === 0) {
      return res.status(400).json({ message: 'No employees found for this company' });
    }

    const adjustments = req.body?.adjustments || {};
    const xr = run.exchangeRate || 1;
    const toRunCcy = (usd, zig) => run.currency === 'ZiG'
      ? (zig || 0) + (usd || 0) * xr
      : (usd || 0) + (zig || 0) / xr;

    // ── Batch-fetch all data BEFORE the transaction (avoids long-running tx) ──

    // All unprocessed inputs for this run
    const allInputs = await prisma.payrollInput.findMany({
      where: { payrollRunId: run.id, processed: false },
      include: { transactionCode: { select: { type: true, preTax: true } } },
    });
    const inputsByEmployee = {};
    for (const inp of allInputs) {
      (inputsByEmployee[inp.employeeId] = inputsByEmployee[inp.employeeId] || []).push(inp);
    }

    // All due loan repayments for employees in this company
    const employeeIds = employees.map((e) => e.id);
    const allDueRepayments = await prisma.loanRepayment.findMany({
      where: {
        status: 'UNPAID',
        dueDate: { lte: new Date(run.endDate) },
        loan: { employeeId: { in: employeeIds }, status: 'ACTIVE', repaymentMethod: 'SALARY_DEDUCTION' },
      },
      include: { loan: { select: { id: true, employeeId: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const repaymentsByEmployee = {};
    for (const rep of allDueRepayments) {
      const empId = rep.loan.employeeId;
      (repaymentsByEmployee[empId] = repaymentsByEmployee[empId] || []).push(rep);
    }

    // All remaining unpaid repayments for loans that will have repayments paid (to detect pay-off)
    const affectedLoanIds = [...new Set(allDueRepayments.map((r) => r.loanId))];
    const remainingRepaymentCounts = {};
    if (affectedLoanIds.length > 0) {
      const dueRepaymentIds = new Set(allDueRepayments.map((r) => r.id));
      const allUnpaid = await prisma.loanRepayment.findMany({
        where: { loanId: { in: affectedLoanIds }, status: 'UNPAID' },
        select: { id: true, loanId: true },
      });
      for (const loanId of affectedLoanIds) {
        const remaining = allUnpaid.filter((r) => r.loanId === loanId && !dueRepaymentIds.has(r.id));
        remainingRepaymentCounts[loanId] = remaining.length;
      }
    }

    // ── Calculate payslips in memory ─────────────────────────────────────────

    const payslipData = [];
    const now = new Date();

    for (const emp of employees) {
      const adj = adjustments[emp.id] || {};
      const empInputs = inputsByEmployee[emp.id] || [];
      const empRepayments = repaymentsByEmployee[emp.id] || [];

      let inputEarnings = 0, inputDeductions = 0, inputPension = 0;
      let inputEarningsUSD = 0, inputEarningsZIG = 0;
      let inputDeductionsUSD = 0, inputDeductionsZIG = 0;
      let inputPensionUSD = 0, inputPensionZIG = 0;

      for (const input of empInputs) {
        const tc = input.transactionCode;
        const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
        const isPreTaxDeduction = tc.type === 'DEDUCTION' && tc.preTax === true;

        if (run.dualCurrency) {
          if (isEarning) {
            inputEarningsUSD += input.employeeUSD || 0;
            inputEarningsZIG += input.employeeZiG || 0;
          } else if (isPreTaxDeduction) {
            // Pre-tax pension: deducted from taxable income before PAYE
            inputPensionUSD += input.employeeUSD || 0;
            inputPensionZIG += input.employeeZiG || 0;
          } else {
            // Post-tax deductions: subtracted from net pay after PAYE
            inputDeductionsUSD += input.employeeUSD || 0;
            inputDeductionsZIG += input.employeeZiG || 0;
          }
        } else {
          const amt = toRunCcy(input.employeeUSD, input.employeeZiG);
          if (isEarning) {
            inputEarnings += amt;
          } else if (isPreTaxDeduction) {
            inputPension += amt;
          } else {
            inputDeductions += amt;
          }
        }
      }

      let baseRate = emp.baseRate;
      if (emp.currency && emp.currency !== run.currency && run.exchangeRate && run.exchangeRate !== 1 && !run.dualCurrency) {
        if (run.currency === 'ZiG' && emp.currency === 'USD') baseRate = emp.baseRate * run.exchangeRate;
        else if (run.currency === 'USD' && emp.currency === 'ZiG') baseRate = emp.baseRate / run.exchangeRate;
      }

      let necLevy = 0;
      if (emp.rateSource === 'NEC_GRADE' && emp.necGrade) {
        const necMinRate = emp.necGrade.minRate;
        if (baseRate < necMinRate) baseRate = necMinRate;
        necLevy = baseRate * (emp.necGrade.necLevyRate || 0);
      }

      let taxResult, taxResultUSD, taxResultZIG;

      if (run.dualCurrency) {
        const baseUSD = emp.currency === 'USD' ? baseRate : baseRate / xr;
        const baseZIG = emp.currency === 'ZiG' ? baseRate : baseRate * xr;

        taxResultUSD = calculatePaye({
          baseSalary: baseUSD, currency: 'USD',
          taxableBenefits: adj.taxableBenefits || 0,
          motorVehicleBenefit: emp.motorVehicleBenefit || 0,
          overtimeAmount: (adj.overtimeAmount || 0) + inputEarningsUSD,
          bonus: adj.bonus || 0, bonusExemption: bonusExemptionUSD,
          severanceAmount: adj.severanceAmount || 0, severanceExemption: severanceExemptionUSD,
          pensionContribution: (adj.pensionContribution || 0) + inputPensionUSD,
          medicalAid: adj.medicalAid || 0,
          taxCredits: emp.taxCredits || 0, wcifRate, sdfRate,
          taxBrackets: taxBracketsUSD, annualBrackets: annualBracketsUSD, nssaCeiling: nssaCeilingUSD,
        });

        taxResultZIG = calculatePaye({
          baseSalary: baseZIG, currency: 'ZiG',
          taxableBenefits: 0, motorVehicleBenefit: 0,
          overtimeAmount: inputEarningsZIG,
          bonus: 0, bonusExemption: bonusExemptionZIG,
          severanceAmount: 0, severanceExemption: severanceExemptionZIG,
          pensionContribution: inputPensionZIG, medicalAid: 0, taxCredits: 0,
          wcifRate: 0, sdfRate: 0,
          taxBrackets: taxBracketsZIG, annualBrackets: annualBracketsZIG, nssaCeiling: nssaCeilingZIG,
        });

        taxResult = taxResultUSD;
      } else {
        taxResult = calculatePaye({
          baseSalary: baseRate, currency: run.currency,
          taxableBenefits: adj.taxableBenefits || 0,
          motorVehicleBenefit: emp.motorVehicleBenefit || 0,
          overtimeAmount: (adj.overtimeAmount || 0) + inputEarnings,
          bonus: adj.bonus || 0, bonusExemption,
          severanceAmount: adj.severanceAmount || 0, severanceExemption,
          pensionContribution: (adj.pensionContribution || 0) + inputPension,
          medicalAid: adj.medicalAid || 0,
          taxCredits: emp.taxCredits || 0, wcifRate, sdfRate,
          taxBrackets, annualBrackets, nssaCeiling,
        });
      }

      const loanDeductions = empRepayments.reduce((s, r) => s + r.amount, 0);

      let netPayAfterLoans, netPayUSD, netPayZIG, dualFields;

      if (run.dualCurrency) {
        const netUSD = Math.max(0, taxResultUSD.netSalary - loanDeductions - inputDeductionsUSD);
        const netZIG = Math.max(0, taxResultZIG.netSalary - inputDeductionsZIG);
        netPayAfterLoans = netUSD;
        netPayUSD = netUSD;
        netPayZIG = netZIG;
        dualFields = {
          grossUSD: taxResultUSD.grossSalary, grossZIG: taxResultZIG.grossSalary,
          payeUSD: taxResultUSD.totalPaye, payeZIG: taxResultZIG.totalPaye,
          aidsLevyUSD: taxResultUSD.aidsLevy, aidsLevyZIG: taxResultZIG.aidsLevy,
          nssaUSD: taxResultUSD.nssaEmployee, nssaZIG: taxResultZIG.nssaEmployee,
        };
      } else {
        netPayAfterLoans = Math.max(0, taxResult.netSalary - loanDeductions - inputDeductions);
        netPayUSD = null;
        netPayZIG = null;
        const splitPct = emp.splitUsdPercent;
        if (splitPct && splitPct > 0 && splitPct < 100 && run.exchangeRate && run.exchangeRate !== 1) {
          const usdShare = splitPct / 100;
          if (run.currency === 'USD') {
            netPayUSD = netPayAfterLoans * usdShare;
            netPayZIG = netPayAfterLoans * (1 - usdShare) * run.exchangeRate;
          } else {
            netPayZIG = netPayAfterLoans * (1 - usdShare);
            netPayUSD = (netPayAfterLoans * usdShare) / run.exchangeRate;
          }
        }
        dualFields = {};
      }

      payslipData.push({
        employeeId: emp.id,
        payrollRunId: run.id,
        gross: taxResult.grossSalary,
        paye: taxResult.totalPaye,
        aidsLevy: taxResult.aidsLevy,
        nssaEmployee: taxResult.nssaEmployee,
        wcifEmployer: taxResult.wcifEmployer,
        sdfContribution: taxResult.sdfContribution,
        necLevy,
        loanDeductions,
        netPay: netPayAfterLoans,
        netPayUSD,
        netPayZIG,
        ...dualFields,
      });
    }

    // ── Determine which loans are fully paid off ──────────────────────────────

    const paidOffLoanIds = affectedLoanIds.filter((id) => remainingRepaymentCounts[id] === 0);

    // ── Short transaction — bulk writes only ───────────────────────────────────

    const result = await prisma.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PROCESSING' } });

      await tx.payslip.createMany({ data: payslipData });

      if (allInputs.length > 0) {
        await tx.payrollInput.updateMany({
          where: { id: { in: allInputs.map((i) => i.id) } },
          data: { processed: true },
        });
      }

      if (allDueRepayments.length > 0) {
        await tx.loanRepayment.updateMany({
          where: { id: { in: allDueRepayments.map((r) => r.id) } },
          data: { status: 'PAID', paidDate: now },
        });
      }

      if (paidOffLoanIds.length > 0) {
        await tx.loan.updateMany({
          where: { id: { in: paidOffLoanIds } },
          data: { status: 'PAID_OFF' },
        });
      }

      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'COMPLETED' } });
      return { count: payslipData.length };
    });

    await audit({
      req,
      action: 'PAYROLL_RUN_PROCESSED',
      resource: 'payroll_run',
      resourceId: run.id,
      details: { employeeCount: result.count, currency: run.currency },
    });

    res.json({ message: 'Payroll processed successfully', runId: run.id, count: result.count });
  } catch (error) {
    // Mark run as ERROR if processing fails
    await prisma.payrollRun.update({
      where: { id: req.params.runId },
      data: { status: 'ERROR' },
    }).catch(() => {});
    console.error('Payroll process error:', error);
    res.status(500).json({ message: 'Payroll processing failed' });
  }
});

// ─── GET /api/payroll/:runId ───────────────────────────────────────────────────

router.get('/:runId', async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: {
        payslips: {
          include: { employee: { select: { firstName: true, lastName: true, position: true } } },
        },
        _count: { select: { payslips: true } },
      },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json(run);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/payroll/:runId ──────────────────────────────────────────────────

router.put('/:runId', requirePermission('approve_payroll'), async (req, res) => {
  const { status, notes } = req.body;
  const VALID_TRANSITIONS = {
    DRAFT: ['PENDING_APPROVAL', 'APPROVED'],
    PENDING_APPROVAL: ['APPROVED', 'DRAFT'],
    APPROVED: ['DRAFT'],
  };

  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (status && VALID_TRANSITIONS[run.status] && !VALID_TRANSITIONS[run.status].includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from ${run.status} to ${status}`,
      });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    if (status) {
      await audit({ req, action: `PAYROLL_STATUS_${status}`, resource: 'payroll_run', resourceId: run.id });
    }

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Payroll run not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/payroll/:runId — DRAFT only ─────────────────────────────────

router.delete('/:runId', requirePermission('manage_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== 'DRAFT') return res.status(400).json({ message: 'Only DRAFT runs can be deleted' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.payrollRun.delete({ where: { id: run.id } });
    await audit({ req, action: 'PAYROLL_RUN_DELETED', resource: 'payroll_run', resourceId: run.id });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/payslips ─────────────────────────────────────────

router.get('/:runId/payslips', async (req, res) => {
  try {
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: req.params.runId },
      include: {
        employee: {
          select: { firstName: true, lastName: true, position: true, employeeCode: true, currency: true },
        },
      },
      orderBy: [{ employee: { lastName: 'asc' } }],
    });
    res.json(payslips);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/payslips/:id/pdf ─────────────────────────────────

router.get('/:runId/payslips/:id/pdf', async (req, res) => {
  try {
    const payslip = await prisma.payslip.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
    });

    if (!payslip) return res.status(404).json({ message: 'Payslip not found' });
    if (req.companyId && payslip.payrollRun.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    // EMPLOYEE can only download their own payslip
    if (req.user.role === 'EMPLOYEE' && req.employeeId && payslip.employeeId !== req.employeeId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=payslip-${payslip.employee.lastName}-${payslip.employee.firstName}.pdf`
    );

    generatePayslipPDF({
      companyName: payslip.payrollRun.company.name,
      period: `${payslip.payrollRun.startDate.toLocaleDateString()} – ${payslip.payrollRun.endDate.toLocaleDateString()}`,
      employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
      nationalId: payslip.employee.idPassport || '',
      jobTitle: payslip.employee.position || '',
      currency: payslip.payrollRun.currency,
      baseSalary: payslip.employee.baseRate,
      overtimeAmount: 0,
      bonus: 0,
      taxableBenefits: 0,
      paye: payslip.paye,
      aidsLevy: payslip.aidsLevy,
      nssaEmployee: payslip.nssaEmployee,
      nssaEmployer: payslip.nssaEmployee,    // employer rate equals employee rate (4.5% each)
      wcifEmployer: payslip.wcifEmployer || 0,
      sdfContribution: payslip.sdfContribution || 0,
      necLevy: payslip.necLevy || 0,
      pensionEmployee: 0,
      medicalAid: 0,
      loanDeductions: payslip.loanDeductions || 0,
      netSalary: payslip.netPay,
      netPayUSD: payslip.netPayUSD ?? null,
      netPayZIG: payslip.netPayZIG ?? null,
    }, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/export — CSV ────────────────────────────────────

router.get('/:runId/export', requirePermission('export_reports'), async (req, res) => {
  try {
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: req.params.runId },
      include: { employee: true },
    });

    const header = 'Employee Code,Name,Position,Gross,PAYE,AIDS Levy,NSSA,Loan Deductions,Net Pay,Currency\n';
    const rows = payslips.map((p) =>
      [
        p.employee.employeeCode || '',
        `${p.employee.firstName} ${p.employee.lastName}`,
        p.employee.position,
        p.gross.toFixed(2),
        p.paye.toFixed(2),
        p.aidsLevy.toFixed(2),
        p.nssaEmployee.toFixed(2),
        (p.loanDeductions || 0).toFixed(2),
        p.netPay.toFixed(2),
        p.employee.currency || 'USD',
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll-export-${req.params.runId}.csv`);
    res.send(header + rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
