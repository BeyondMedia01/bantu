const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/retroactive/employees - Get employees with their salary history
router.get('/employees', requirePermission('view_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId, dischargeDate: null },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        baseRate: true,
        position: true,
      },
    });
    res.json(employees);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/retroactive/calculations - Calculate retroactive pay for an employee
router.post('/calculate', requirePermission('view_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { employeeId, effectiveDate, newRate, transactionCodeId } = req.body;
  
  if (!employeeId || !effectiveDate || !newRate) {
    return res.status(400).json({ message: 'employeeId, effectiveDate, and newRate are required' });
  }
  
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        company: true,
        payrollRuns: {
          where: {
            status: 'COMPLETED',
            startDate: { gte: new Date(effectiveDate) },
          },
          orderBy: { startDate: 'asc' },
          include: {
            transactions: {
              where: { transactionCode: { code: 'BASIC' } },
            },
          },
        },
      },
    });
    
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    const oldRate = employee.baseRate;
    const calculations = [];
    let totalBackpay = 0;
    
    for (const run of employee.payrollRuns) {
      const oldBasicAmount = run.transactions[0]?.amount || oldRate;
      const newBasicAmount = newRate;
      const monthsDiff = run.monthDiff || 1;
      
      const shortfall = (newBasicAmount - oldBasicAmount) * monthsDiff;
      totalBackpay += shortfall;
      
      calculations.push({
        runId: run.id,
        period: `${run.startDate.toLocaleDateString()} - ${run.endDate.toLocaleDateString()}`,
        oldRate,
        newRate,
        months: monthsDiff,
        oldAmount: oldBasicAmount,
        newAmount: newBasicAmount,
        shortfall: shortfall,
      });
    }
    
    res.json({
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        employeeCode: employee.employeeCode,
      },
      effectiveDate,
      oldRate,
      newRate,
      calculations,
      totalBackpay,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/retroactive/apply - Apply back-pay to current payroll run
router.post('/apply', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { employeeId, effectiveDate, newRate, totalBackpay, transactionCodeId } = req.body;
  
  try {
    // Find or create current payroll run
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    let payrollRun = await prisma.payrollRun.findFirst({
      where: {
        companyId: req.companyId,
        startDate: { gte: startOfMonth },
        endDate: { lte: endOfMonth },
        status: 'DRAFT',
      },
    });
    
    if (!payrollRun) {
      payrollRun = await prisma.payrollRun.create({
        data: {
          companyId: req.companyId,
          startDate: startOfMonth,
          endDate: endOfMonth,
          runDate: now,
          status: 'DRAFT',
          currency: 'USD',
        },
      });
    }
    
    // Find or create BACKPAY transaction code
    let backpayCode = await prisma.transactionCode.findFirst({
      where: { clientId: req.clientId, code: 'BACKPAY' },
    });
    
    if (!backpayCode) {
      backpayCode = await prisma.transactionCode.create({
        data: {
          clientId: req.clientId,
          code: 'BACKPAY',
          name: 'Back Pay - Retroactive Adjustment',
          category: 'EARNING',
          taxable: true,
          affectsPaye: true,
          affectsNssa: true,
          affectsAidsLevy: true,
          calculationType: 'FIXED',
          isActive: true,
        },
      });
    }
    
    // Create payroll input for backpay
    const payrollInput = await prisma.payrollInput.create({
      data: {
        employeeId,
        payrollRunId: payrollRun.id,
        transactionCodeId: backpayCode.id,
        inputValue: totalBackpay,
        notes: `Retroactive pay from ${effectiveDate} (rate changed from ${req.body.oldRate} to ${newRate})`,
      },
    });
    
    res.json({
      success: true,
      payrollRunId: payrollRun.id,
      transactionCodeId: backpayCode.id,
      backpayAmount: totalBackpay,
      message: `Back-pay of $${totalBackpay.toFixed(2)} added to current month`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/retroactive/history - Get history of retroactive adjustments
router.get('/history', requirePermission('view_payroll'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  try {
    const backpayInputs = await prisma.payrollInput.findMany({
      where: {
        transactionCode: { code: 'BACKPAY' },
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        payrollRun: { select: { startDate: true, endDate: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(backpayInputs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;