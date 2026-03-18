const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

// GET /api/leave-types - List all leave types
router.get('/types', async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  try {
    const types = await prisma.leaveType.findMany({
      where: { clientId: req.clientId },
      orderBy: { code: 'asc' },
    });
    res.json(types);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave-types - Create leave type
router.post('/types', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  const { code, name, accrualRate, accrualPeriod, maxCarryOver, maxAccumulation, encashable, encashmentRate, requiresApproval } = req.body;
  try {
    const existing = await prisma.leaveType.findUnique({
      where: { clientId_code: { clientId: req.clientId, code: code.toUpperCase() } },
    });
    if (existing) return res.status(400).json({ message: 'Leave type already exists' });
    
    const leaveType = await prisma.leaveType.create({
      data: {
        clientId: req.clientId,
        code: code.toUpperCase(),
        name,
        accrualRate: accrualRate || 0,
        accrualPeriod: accrualPeriod || 'MONTHLY',
        maxCarryOver: maxCarryOver || 0,
        maxAccumulation: maxAccumulation || 90,
        encashable: encashable || false,
        encashmentRate: encashmentRate || null,
        requiresApproval: requiresApproval !== false,
      },
    });
    await audit({ req, action: 'LEAVE_TYPE_CREATED', resource: 'leave_type', resourceId: leaveType.id, details: { code, name } });
    res.status(201).json(leaveType);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/leave-types/:id - Update leave type
router.put('/types/:id', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  try {
    const existing = await prisma.leaveType.findFirst({ where: { id: req.params.id, clientId: req.clientId } });
    if (!existing) return res.status(404).json({ message: 'Leave type not found' });
    
    const { accrualRate, accrualPeriod, maxCarryOver, maxAccumulation, encashable, encashmentRate, requiresApproval, isActive } = req.body;
    
    const updated = await prisma.leaveType.update({
      where: { id: req.params.id },
      data: {
        accrualRate: accrualRate ?? existing.accrualRate,
        accrualPeriod: accrualPeriod ?? existing.accrualPeriod,
        maxCarryOver: maxCarryOver ?? existing.maxCarryOver,
        maxAccumulation: maxAccumulation ?? existing.maxAccumulation,
        encashable: encashable ?? existing.encashable,
        encashmentRate: encashmentRate ?? existing.encashmentRate,
        requiresApproval: requiresApproval ?? existing.requiresApproval,
        isActive: isActive ?? existing.isActive,
      },
    });
    await audit({ req, action: 'LEAVE_TYPE_UPDATED', resource: 'leave_type', resourceId: updated.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/leave/balances/:employeeId - Get employee leave balances
router.get('/balances/:employeeId', async (req, res) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: req.params.employeeId, clientId: req.clientId },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    const currentYear = new Date().getFullYear();
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId: req.params.employeeId, year: currentYear },
      include: { leaveType: true },
    });
    
    // If no balances exist, calculate initial accruals
    if (balances.length === 0) {
      const leaveTypes = await prisma.leaveType.findMany({
        where: { clientId: req.clientId, isActive: true },
      });
      
      for (const lt of leaveTypes) {
        const monthsWorked = Math.floor((new Date() - new Date(employee.startDate)) / (30 * 24 * 60 * 60 * 1000));
        const accrued = Math.min(monthsWorked * (lt.accrualRate || 0), lt.maxAccumulation || 90);
        
        await prisma.leaveBalance.create({
          data: {
            employeeId: employee.id,
            leaveTypeId: lt.id,
            year: currentYear,
            accruedDays: accrued,
            broughtForward: 0,
            usedDays: 0,
            encashedDays: 0,
            carriedOver: 0,
          },
        });
      }
      
      const newBalances = await prisma.leaveBalance.findMany({
        where: { employeeId: req.params.employeeId, year: currentYear },
        include: { leaveType: true },
      });
      return res.json(newBalances);
    }
    
    res.json(balances);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave/accrue - Run monthly accrual for all employees
router.post('/accrue', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { year, month } = req.body;
  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || new Date().getMonth() + 1;
  
  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId, dischargeDate: null },
      include: { company: true },
    });
    
    const leaveTypes = await prisma.leaveType.findMany({
      where: { clientId: req.companyId ? undefined : req.clientId, isActive: true },
    });
    
    let accrualsProcessed = 0;
    
    for (const emp of employees) {
      // Check if employee has completed a month
      const monthsWorked = Math.floor((new Date() - new Date(emp.startDate)) / (30 * 24 * 60 * 60 * 1000));
      if (monthsWorked < currentMonth) continue;
      
      for (const lt of leaveTypes) {
        let balance = await prisma.leaveBalance.findFirst({
          where: { employeeId: emp.id, leaveTypeId: lt.id, year: currentYear },
        });
        
        const accruedThisMonth = lt.accrualRate || 0;
        const newTotal = (balance?.accruedDays || 0) + accruedThisMonth;
        const cappedAccrued = Math.min(newTotal, lt.maxAccumulation || 90);
        
        if (balance) {
          await prisma.leaveBalance.update({
            where: { id: balance.id },
            data: { accruedDays: cappedAccrued, asOfDate: new Date() },
          });
        } else {
          await prisma.leaveBalance.create({
            data: {
              employeeId: emp.id,
              leaveTypeId: lt.id,
              year: currentYear,
              accruedDays: cappedAccrued,
            },
          });
        }
        accrualsProcessed++;
      }
    }
    
    await audit({ req, action: 'LEAVE_ACCRUAL_RUN', resource: 'leave', details: { year: currentYear, month: currentMonth, employees: employees.length } });
    res.json({ message: 'Accrual completed', accrualsProcessed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave/encash - Request leave encashment
router.post('/encash', requirePermission('manage_leave'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  const { employeeId, leaveTypeId, days, notes } = req.body;
  
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, clientId: req.clientId },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    const leaveType = await prisma.leaveType.findFirst({
      where: { id: leaveTypeId, clientId: req.clientId },
    });
    if (!leaveType) return res.status(404).json({ message: 'Leave type not found' });
    if (!leaveType.encashable) return res.status(400).json({ message: 'This leave type is not encashable' });
    
    // Get current balance
    const currentYear = new Date().getFullYear();
    const balance = await prisma.leaveBalance.findFirst({
      where: { employeeId, leaveTypeId, year: currentYear },
    });
    
    const availableDays = (balance?.accruedDays || 0) - (balance?.usedDays || 0) - (balance?.encashedDays || 0);
    if (days > availableDays) {
      return res.status(400).json({ message: `Insufficient leave balance. Available: ${availableDays} days` });
    }
    
    // Calculate encashment amount
    const dailyRate = employee.baseRate * (leaveType.encashmentRate || 1);
    const totalAmount = days * dailyRate;
    
    const encashment = await prisma.leaveEncashment.create({
      data: {
        employeeId,
        leaveTypeId,
        days,
        dailyRate,
        totalAmount,
        notes,
      },
    });
    
    await audit({ req, action: 'LEAVE_ENCASHMENT_REQUESTED', resource: 'leave_encashment', resourceId: encashment.id, details: { employeeId, days, amount: totalAmount } });
    res.status(201).json(encashment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave/encash/:id/approve - Approve encashment
router.post('/encash/:id/approve', requirePermission('approve_leave'), async (req, res) => {
  try {
    const encashment = await prisma.leaveEncashment.findUnique({
      where: { id: req.params.id },
      include: { employee: true, leaveType: true },
    });
    if (!encashment) return res.status(404).json({ message: 'Encashment not found' });
    if (encashment.status !== 'PENDING') return res.status(400).json({ message: 'Encashment already processed' });
    
    // Update encashment status
    const updated = await prisma.leaveEncashment.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', processedBy: req.user?.email },
    });
    
    // Deduct days from balance
    const currentYear = new Date().getFullYear();
    const balance = await prisma.leaveBalance.findFirst({
      where: { employeeId: encashment.employeeId, leaveTypeId: encashment.leaveTypeId, year: currentYear },
    });
    
    if (balance) {
      await prisma.leaveBalance.update({
        where: { id: balance.id },
        data: { encashedDays: (balance.encashedDays || 0) + encashment.days },
      });
    }
    
    await audit({ req, action: 'LEAVE_ENCASHMENT_APPROVED', resource: 'leave_encashment', resourceId: encashment.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave/encash/:id/process - Process encashment (generate earning)
router.post('/encash/:id/process', requirePermission('process_payroll'), async (req, res) => {
  try {
    const encashment = await prisma.leaveEncashment.findUnique({
      where: { id: req.params.id },
      include: { employee: true, leaveType: true },
    });
    if (!encashment) return res.status(404).json({ message: 'Encashment not found' });
    if (encashment.status !== 'APPROVED') return res.status(400).json({ message: 'Encashment must be approved first' });
    
    // Update status to processed
    const updated = await prisma.leaveEncashment.update({
      where: { id: req.params.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    
    // Create a payroll input for the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    let payrollRun = await prisma.payrollRun.findFirst({
      where: {
        companyId: encashment.employee.companyId,
        startDate: { gte: startOfMonth },
        endDate: { lte: endOfMonth },
        status: 'DRAFT',
      },
    });
    
    if (!payrollRun) {
      payrollRun = await prisma.payrollRun.create({
        data: {
          companyId: encashment.employee.companyId,
          startDate: startOfMonth,
          endDate: endOfMonth,
          runDate: now,
          status: 'DRAFT',
          currency: encashment.employee.currency || 'USD',
        },
      });
    }
    
    // Find or create LEAVE_ENCASHMENT transaction code
    let txnCode = await prisma.transactionCode.findFirst({
      where: { clientId: encashment.employee.clientId, code: 'LEAVE_ENCASH' },
    });
    
    if (!txnCode) {
      txnCode = await prisma.transactionCode.create({
        data: {
          clientId: encashment.employee.clientId,
          code: 'LEAVE_ENCASH',
          name: 'Leave Encashment',
          category: 'EARNING',
          taxable: true,
          affectsPaye: true,
          affectsNssa: true,
          affectsAidsLevy: true,
          calculationType: 'FIXED',
        },
      });
    }
    
    // Create payroll input
    await prisma.payrollInput.create({
      data: {
        employeeId: encashment.employeeId,
        payrollRunId: payrollRun.id,
        transactionCodeId: txnCode.id,
        inputValue: encashment.totalAmount,
        notes: `Leave encashment: ${encashment.days} days`,
      },
    });
    
    await audit({ req, action: 'LEAVE_ENCASHMENT_PROCESSED', resource: 'leave_encashment', resourceId: encashment.id, details: { amount: encashment.totalAmount } });
    res.json({ message: 'Encashment processed', payrollRunId: payrollRun.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/leave/encashments - List encashments
router.get('/encashments', async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  const { status, employeeId } = req.query;
  
  try {
    const where = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    
    const encashments = await prisma.leaveEncashment.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, leaveType: true },
      orderBy: { requestDate: 'desc' },
    });
    res.json(encashments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave/year-end - Year-end carry-over processing
router.post('/year-end', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { fromYear, toYear } = req.body;
  const currentYear = fromYear || new Date().getFullYear();
  const nextYear = toYear || currentYear + 1;
  
  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId, dischargeDate: null },
    });
    
    const leaveTypes = await prisma.leaveType.findMany({
      where: { clientId: req.companyId ? undefined : req.clientId, isActive: true },
    });
    
    let processed = 0;
    
    for (const emp of employees) {
      for (const lt of leaveTypes) {
        const currentBalance = await prisma.leaveBalance.findFirst({
          where: { employeeId: emp.id, leaveTypeId: lt.id, year: currentYear },
        });
        
        if (!currentBalance) continue;
        
        const availableDays = (currentBalance.accruedDays || 0) - (currentBalance.usedDays || 0) - (currentBalance.encashedDays || 0);
        const maxCarryOver = lt.maxCarryOver || 0;
        const carriedOver = Math.min(availableDays, maxCarryOver);
        
        // Check if next year's balance exists
        let nextYearBalance = await prisma.leaveBalance.findFirst({
          where: { employeeId: emp.id, leaveTypeId: lt.id, year: nextYear },
        });
        
        if (nextYearBalance) {
          await prisma.leaveBalance.update({
            where: { id: nextYearBalance.id },
            data: { broughtForward: carriedOver },
          });
        } else {
          await prisma.leaveBalance.create({
            data: {
              employeeId: emp.id,
              leaveTypeId: lt.id,
              year: nextYear,
              broughtForward: carriedOver,
              accruedDays: 0,
              usedDays: 0,
              encashedDays: 0,
              carriedOver: carriedOver,
            },
          });
        }
        processed++;
      }
    }
    
    await audit({ req, action: 'LEAVE_YEAR_END', resource: 'leave', details: { fromYear: currentYear, toYear: nextYear, employees: employees.length } });
    res.json({ message: 'Year-end processing completed', processed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;