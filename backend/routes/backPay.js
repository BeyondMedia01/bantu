const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { calculatePaye } = require('../utils/taxEngine');
const { audit } = require('../lib/audit');

const router = express.Router();

router.post('/', requirePermission('process_payroll'), async (req, res) => {
  const { employeeIds, fromDate, toDate, newBaseRate, currency = 'USD' } = req.body;

  if (!employeeIds?.length || !fromDate || !toDate) {
    return res.status(400).json({ message: 'employeeIds, fromDate, toDate are required' });
  }

  try {
    const employees = await prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        ...(req.companyId && { companyId: req.companyId }),
      },
    });

    if (employees.length === 0) return res.status(400).json({ message: 'No matching employees found' });

    const from = new Date(fromDate);
    const to = new Date(toDate);
    const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

    if (months <= 0) return res.status(400).json({ message: 'toDate must be after fromDate' });

    const company = employees[0].companyId
      ? await prisma.company.findUnique({ where: { id: employees[0].companyId } })
      : null;

    const taxTable = company
      ? await prisma.taxTable.findFirst({
          where: {
            clientId: company.clientId,
            currency,
            effectiveDate: { lte: new Date() },
            OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
          },
          include: { brackets: true },
          orderBy: { effectiveDate: 'desc' },
        })
      : null;

    const taxBrackets = taxTable?.brackets ?? [];

    const results = employees.map((emp) => {
      const oldRate = emp.baseRate;
      const targetRate = newBaseRate !== undefined ? parseFloat(newBaseRate) : oldRate;
      const monthlyDiff = targetRate - oldRate;

      if (monthlyDiff <= 0) {
        return { employeeId: emp.id, name: `${emp.firstName} ${emp.lastName}`, backPayGross: 0, months };
      }

      const grossBackPay = monthlyDiff * months;

      const taxResult = calculatePaye({
        baseSalary: grossBackPay,
        currency: emp.currency || currency,
        taxBrackets,
      });

      return {
        employeeId: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        oldRate,
        newRate: targetRate,
        months,
        backPayGross: grossBackPay,
        paye: taxResult.totalPaye,
        nssa: taxResult.nssaEmployee,
        backPayNet: taxResult.netSalary,
      };
    });

    res.json({ fromDate, toDate, months, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/adjustment', requirePermission('process_payroll'), async (req, res) => {
  const { employeeId, payrollRunId, adjustmentType, amount, reason, isNegative } = req.body;

  if (!employeeId || !adjustmentType || amount === undefined) {
    return res.status(400).json({ message: 'employeeId, adjustmentType, and amount are required' });
  }

  const validTypes = ['SALARY_CORRECTION', 'MISSED_EARNING', 'OVERTIME_CORRECTION', 'DEDUCTION_REVERSAL', 'OTHER'];
  if (!validTypes.includes(adjustmentType)) {
    return res.status(400).json({ message: `Invalid adjustmentType. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { company: true },
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const adjustmentAmount = isNegative ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));

    let targetRun = null;
    if (payrollRunId) {
      targetRun = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
      if (!targetRun) return res.status(404).json({ message: 'Payroll run not found' });
      if (targetRun.status === 'LOCKED') {
        return res.status(400).json({ message: 'Cannot adjust a locked payroll run' });
      }
    }

    const now = new Date();
    const periodStart = targetRun ? new Date(targetRun.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = targetRun ? new Date(targetRun.endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    let adjustmentRun = targetRun;
    if (!adjustmentRun) {
      adjustmentRun = await prisma.payrollRun.create({
        data: {
          companyId: employee.companyId,
          startDate: periodStart,
          endDate: periodEnd,
          runDate: now,
          status: 'DRAFT',
          currency: employee.currency || 'USD',
          notes: `Adjustment run for ${adjustmentType}: ${reason || 'No reason provided'}`,
        },
      });
    }

    const txnCode = await prisma.transactionCode.findFirst({
      where: { clientId: employee.clientId, code: adjustmentType },
    }) || await prisma.transactionCode.create({
      data: {
        clientId: employee.clientId,
        code: adjustmentType,
        name: adjustmentType.replace(/_/g, ' '),
        category: adjustmentAmount >= 0 ? 'EARNING' : 'DEDUCTION',
        taxable: adjustmentType.includes('SALARY') || adjustmentType.includes('OVERTIME') || adjustmentType.includes('EARNING'),
        affectsPaye: true,
        affectsNssa: adjustmentType.includes('SALARY'),
        calculationType: 'FIXED',
      },
    });

    const payrollInput = await prisma.payrollInput.create({
      data: {
        employeeId: employee.id,
        payrollRunId: adjustmentRun.id,
        transactionCodeId: txnCode.id,
        inputValue: Math.abs(adjustmentAmount),
        notes: `${adjustmentType}${reason ? `: ${reason}` : ''} ${isNegative ? '(REVERSAL)' : ''}`,
      },
    });

    await audit({
      req,
      action: 'BACKPAY_ADJUSTMENT_CREATED',
      resource: 'payroll_input',
      resourceId: payrollInput.id,
      details: {
        employeeId,
        adjustmentType,
        amount: adjustmentAmount,
        reason,
        isNegative,
        payrollRunId: adjustmentRun.id,
      },
    });

    res.status(201).json({
      adjustmentRun,
      payrollInput,
      adjustmentType,
      amount: adjustmentAmount,
      message: isNegative ? 'Reversal adjustment created' : 'Positive adjustment created',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/history/:employeeId', async (req, res) => {
  const { employeeId } = req.params;
  const { year } = req.query;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const where = {
      employeeId,
      payrollRun: {
        status: { in: ['COMPLETED', 'LOCKED'] },
      },
    };

    if (year) {
      const startOfYear = new Date(parseInt(year), 0, 1);
      const endOfYear = new Date(parseInt(year), 11, 31);
      where.payrollRun = {
        ...where.payrollRun,
        startDate: { gte: startOfYear },
        endDate: { lte: endOfYear },
      };
    }

    const adjustments = await prisma.payrollInput.findMany({
      where,
      include: {
        payrollRun: true,
        transactionCode: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalAdjustments = adjustments.reduce((sum, adj) => {
      return sum + (adj.inputValue || 0);
    }, 0);

    res.json({
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      year: year || 'ALL',
      adjustmentCount: adjustments.length,
      totalAdjustments,
      adjustments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
