const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { calculatePaye } = require('../utils/taxEngine');

const router = express.Router();

/**
 * POST /api/backpay
 * Calculates back pay for employees between two dates.
 *
 * Body:
 *   { employeeIds: string[], fromDate: string, toDate: string,
 *     newBaseRate?: number, currency?: string }
 *
 * Returns computed back pay amounts (does not create payroll run).
 */
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

    // Calculate months between dates
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

    if (months <= 0) return res.status(400).json({ message: 'toDate must be after fromDate' });

    // Fetch tax table
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

      // Calculate PAYE on the back pay amount
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

module.exports = router;
