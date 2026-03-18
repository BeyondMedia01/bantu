const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

/**
 * POST /api/payincrease
 * Applies a bulk pay increase to a set of employees.
 *
 * Body:
 *   { employeeIds?: string[], percentage?: number, amount?: number,
 *     effectiveDate: string, filter?: { departmentId, branchId, employmentType } }
 *
 * Either percentage OR amount must be provided.
 * If employeeIds is omitted, the filter is used to target employees.
 */
router.post('/', requirePermission('manage_employees'), async (req, res) => {
  const { employeeIds, percentage, amount, effectiveDate, filter = {} } = req.body;

  if (!effectiveDate) return res.status(400).json({ message: 'effectiveDate is required' });
  if (percentage === undefined && amount === undefined) {
    return res.status(400).json({ message: 'Either percentage or amount is required' });
  }

  try {
    // Resolve target employees
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(employeeIds?.length && { id: { in: employeeIds } }),
      ...(filter.departmentId && { departmentId: filter.departmentId }),
      ...(filter.branchId && { branchId: filter.branchId }),
      ...(filter.employmentType && { employmentType: filter.employmentType }),
    };

    const employees = await prisma.employee.findMany({ where, select: { id: true, baseRate: true } });

    if (employees.length === 0) return res.status(400).json({ message: 'No matching employees found' });

    // Apply increase
    const updates = await Promise.all(
      employees.map((emp) => {
        const newRate = percentage !== undefined
          ? emp.baseRate * (1 + parseFloat(percentage) / 100)
          : emp.baseRate + parseFloat(amount);

        return prisma.employee.update({
          where: { id: emp.id },
          data: { baseRate: Math.round(newRate * 100) / 100 },
          select: { id: true, baseRate: true, firstName: true, lastName: true },
        });
      })
    );

    res.json({
      message: `Pay increase applied to ${updates.length} employee(s)`,
      effectiveDate,
      employees: updates,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
