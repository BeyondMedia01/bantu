const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { getSettingAsNumber, getSettingAsString } = require('../lib/systemSettings');
const { generateZIMRAFile, generateNSAFile, generateNECFile, generateP4AFile, generatePSL8, generateITFCertificate } = require('../utils/portals');
const { validateCompanyForZIMRA, validateTIN } = require('../utils/validators');

const router = express.Router();

router.get('/zimra', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { startDate, endDate, format = 'csv' } = req.query;
  
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });
    
    const validation = validateCompanyForZIMRA(company);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Cannot export ZIMRA file. Missing required company details.',
        issues: validation.issues,
      });
    }
    
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        companyId: req.companyId,
        status: { in: ['COMPLETED', 'LOCKED'] },
        ...(startDate && { startDate: { gte: new Date(startDate) } }),
        ...(endDate && { endDate: { lte: new Date(endDate) } }),
      },
      include: {
        transactions: {
          include: {
            transactionCode: true,
            employee: {
              select: {
                id: true, firstName: true, lastName: true, tin: true,
                idPassport: true, socialSecurityNum: true, gender: true,
                dateOfBirth: true, employmentType: true,
              },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
    
    if (payrollRuns.length === 0) {
      return res.status(400).json({ message: 'No completed payroll runs found for the selected period' });
    }
    
    const content = generateZIMRAFile(payrollRuns, company);
    
    const filename = `ZIMRA_PAYE_${payrollRuns[0].startDate.toISOString().slice(0, 7)}.txt`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/nssa', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { startDate, endDate, format = 'csv' } = req.query;
  
  try {
    const [company, client] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.companyId } }),
      prisma.client.findFirst({ where: { companies: { some: { id: req.companyId } } } }),
    ]);
    
    if (!company.nssaRegistrationNumber) {
      return res.status(400).json({
        message: 'Cannot export NSSA file. NSSA registration number is required.',
        field: 'nssaRegistrationNumber',
      });
    }
    
    const nssaCeilingUSD = await getSettingAsNumber('NSSA_CEILING_USD', 700);
    const nssaCeilingZIG = await getSettingAsNumber('NSSA_CEILING_ZIG', 20000);
    
    const whereClause = {
      companyId: req.companyId,
      status: { in: ['COMPLETED', 'LOCKED'] },
    };
    
    if (startDate) whereClause.startDate = { gte: new Date(startDate) };
    if (endDate) whereClause.endDate = { lte: new Date(endDate) };
    
    const payrollRuns = await prisma.payrollRun.findMany({
      where: whereClause,
      include: {
        transactions: {
          include: {
            transactionCode: true,
            employee: {
              select: {
                id: true, firstName: true, lastName: true, tin: true,
                idPassport: true, socialSecurityNum: true, nssaNumber: true,
                gender: true, dateOfBirth: true, necGrade: true,
              },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
    
    if (payrollRuns.length === 0) {
      return res.status(400).json({ message: 'No completed payroll runs found for the selected period' });
    }
    
    const nssaCeiling = payrollRuns[0].currency === 'ZiG' ? nssaCeilingZIG : nssaCeilingUSD;
    const content = generateNSAFile(payrollRuns, company, client, nssaCeiling);
    
    const filename = `NSSA_CONTRIBUTION_${payrollRuns[0].startDate.toISOString().slice(0, 7)}.txt`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/nssa/nec', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  
  const { startDate, endDate } = req.query;
  
  try {
    const [company, client] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.companyId } }),
      prisma.client.findFirst({ where: { companies: { some: { id: req.companyId } } } }),
    ]);
    
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
            employee: {
              select: {
                id: true, firstName: true, lastName: true, tin: true,
                necGrade: { include: { necTable: true } },
              },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
    
    if (payrollRuns.length === 0) {
      return res.status(400).json({ message: 'No completed payroll runs found for the selected period' });
    }
    
    const content = generateNECFile(payrollRuns, company, client);
    
    const filename = `NEC_LEVY_${payrollRuns[0].startDate.toISOString().slice(0, 7)}.txt`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

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
    
    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId },
      include: {
        payrollRuns: {
          where: {
            status: 'COMPLETED',
            startDate: { gte: startDate },
            endDate: { lte: endDate },
          },
          include: {
            transactions: { include: { transactionCode: true } },
          },
        },
      },
    });
    
    const employeeData = employees.map(emp => {
      let annualGross = 0;
      let annualTax = 0;
      let terminationPayments = 0;
      
      for (const run of emp.payrollRuns) {
        for (const txn of run.transactions) {
          if (txn.transactionCode.category === 'EARNING' && txn.transactionCode.taxable) {
            annualGross += txn.amount;
          }
          if (txn.transactionCode.code === 'NOTICE_PAY' || 
              txn.transactionCode.code === 'SEVERANCE_PAY' ||
              txn.transactionCode.code === 'LEAVE_ENCASH') {
            terminationPayments += txn.amount;
          }
        }
      }
      
      annualGross += terminationPayments;
      
      return { ...emp, annualGross, annualTax, terminationPayments };
    });
    
    const content = generateP4AFile(employeeData, company, parseInt(year));
    
    const filename = `NSSA_P4A_${year}.txt`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/psl8/:employeeId', requirePermission('view_reports'), async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });
    
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
    });
    
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
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
      certificateNumber: null,
      dateIssued: null,
    }, company);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="PSL8_${employee.firstName}_${employee.lastName}.txt"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/itf/:employeeId', requirePermission('view_reports'), async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });
    
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
    });
    
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    const payrollRuns = await prisma.payrollRun.findMany({
      where: {
        employeeId: employee.id,
        status: 'COMPLETED',
        startDate: { gte: startDate },
        endDate: { lte: endDate },
      },
      include: {
        transactions: { include: { transactionCode: true } },
        payslips: true,
      },
    });
    
    let annualGross = 0;
    let annualPaye = 0;
    let annualAidsLevy = 0;
    let annualNssa = 0;
    let annualPension = 0;
    let totalEarnings = 0;
    
    for (const run of payrollRuns) {
      for (const txn of run.transactions) {
        if (txn.transactionCode.category === 'EARNING') {
          totalEarnings += txn.amount;
          if (txn.transactionCode.taxable) {
            annualGross += txn.amount;
          }
        }
        if (txn.transactionCode.code === 'PAYE' || txn.transactionCode.affectsPaye) {
          annualPaye += txn.amount;
        }
        if (txn.transactionCode.code === 'AIDS_LEVY') {
          annualAidsLevy += txn.amount;
        }
        if (txn.transactionCode.code === 'NSSA_EMP' || txn.transactionCode.code === 'NSSA') {
          annualNssa += txn.amount;
        }
        if (txn.transactionCode.code === 'PENSION') {
          annualPension += txn.amount;
        }
      }
    }
    
    const content = generateITFCertificate(employee, {
      year,
      annualGross,
      annualPaye,
      annualAidsLevy,
      annualNssa,
      annualPension,
      totalEarnings,
    }, company);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="ITF_${employee.lastName}_${year}.txt"`);
    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
