const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { generateZIMRAFile, generateNSAFile, generateP4AFile, generatePSL8 } = require('../utils/portals');

const router = express.Router();

// GET /api/portals/zimra - Generate ZIMRA e-Taxes file
router.get('/zimra', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { startDate, endDate, format = 'csv' } = req.query;
  
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });
    
    const whereClause = {
      companyId: req.companyId,
      status: 'COMPLETED',
    };
    
    if (startDate) whereClause.startDate = { gte: new Date(startDate) };
    if (endDate) whereClause.endDate = { lte: new Date(endDate) };
    
    const payrollRuns = await prisma.payrollRun.findMany({
      where: whereClause,
      include: {
        transactions: {
          include: {
            transactionCode: true,
            employee: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
    
    if (payrollRuns.length === 0) {
      return res.status(400).json({ message: 'No completed payroll runs found for the selected period' });
    }
    
    const content = generateZIMRAFile(payrollRuns, company);
    
    const filename = `ZIMRA_PAYE_${new Date().toISOString().split('T')[0]}.${format === 'txt' ? 'txt' : 'csv'}`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/portals/nssa - Generate NSSA contribution file
router.get('/nssa', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { startDate, endDate, format = 'csv' } = req.query;
  
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      include: { client: true },
    });
    
    const whereClause = {
      companyId: req.companyId,
      status: 'COMPLETED',
    };
    
    if (startDate) whereClause.startDate = { gte: new Date(startDate) };
    if (endDate) whereClause.endDate = { lte: new Date(endDate) };
    
    const payrollRuns = await prisma.payrollRun.findMany({
      where: whereClause,
      include: {
        transactions: {
          include: {
            transactionCode: true,
            employee: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
    
    if (payrollRuns.length === 0) {
      return res.status(400).json({ message: 'No completed payroll runs found for the selected period' });
    }
    
    const content = generateNSAFile(payrollRuns, company, company.client);
    
    const filename = `NSSA_CONTRIBUTION_${new Date().toISOString().split('T')[0]}.${format === 'txt' ? 'txt' : 'csv'}`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/portals/nssa/p4a - Generate NSSA P4A annual report
router.get('/nssa/p4a', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { year } = req.query;
  
  if (!year) return res.status(400).json({ message: 'Year is required' });
  
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });
    
    const startDate = new Date(parseInt(year), 0, 1);
    const endDate = new Date(parseInt(year), 11, 31);
    
    // Get all employees with their annual totals
    const employees = await prisma.employee.findMany({
      where: {
        companyId: req.companyId,
        dischargeDate: null,
      },
      include: {
        payrollRuns: {
          where: {
            status: 'COMPLETED',
            startDate: { gte: startDate },
            endDate: { lte: endDate },
          },
          include: {
            transactions: {
              include: { transactionCode: true },
            },
          },
        },
      },
    });
    
    // Calculate annual totals per employee
    const employeeData = employees.map(emp => {
      let annualGross = 0;
      let annualTax = 0;
      
      for (const run of emp.payrollRuns) {
        for (const txn of run.transactions) {
          if (txn.transactionCode.category === 'EARNING' && txn.transactionCode.taxable) {
            annualGross += txn.amount;
          }
        }
      }
      
      return { ...emp, annualGross, annualTax };
    });
    
    const content = generateP4AFile(employeeData, company, parseInt(year));
    
    const filename = `NSSA_P4A_${year}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/portals/psl8 - Generate PSL 8 Tax Clearance Certificate data
router.get('/psl8/:employeeId', requirePermission('view_reports'), async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
    });
    
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    // Get last 12 months of data
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        employeeId: employee.id,
        status: 'COMPLETED',
        startDate: { gte: twelveMonthsAgo },
      },
      include: {
        transactions: { include: { transactionCode: true } },
      },
    });
    
    let annualGross = 0;
    let annualTax = 0;
    
    for (const run of payrollRuns) {
      for (const txn of run.transactions) {
        if (txn.transactionCode.category === 'EARNING' && txn.transactionCode.taxable) {
          annualGross += txn.amount;
        }
      }
    }
    
    const content = generatePSL8(employee, {
      periodFrom: twelveMonthsAgo.toISOString().split('T')[0],
      periodTo: new Date().toISOString().split('T')[0],
      annualGross,
      annualTax,
      certificateNumber: `PSL8-${Date.now()}`,
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="PSL8_${employee.firstName}_${employee.lastName}.csv"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;