const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

const pick = (body) => ({
  employeeUSD: body.employeeUSD !== undefined ? parseFloat(body.employeeUSD) || 0 : undefined,
  employeeZiG: body.employeeZiG !== undefined ? parseFloat(body.employeeZiG) || 0 : undefined,
  employerUSD: body.employerUSD !== undefined ? parseFloat(body.employerUSD) || 0 : undefined,
  employerZiG: body.employerZiG !== undefined ? parseFloat(body.employerZiG) || 0 : undefined,
  units:       body.units !== undefined && body.units !== '' ? parseFloat(body.units) : null,
  unitsType:   body.unitsType !== undefined ? body.unitsType || null : undefined,
  duration:    body.duration || 'Indefinite',
  balance:     body.balance !== undefined && body.balance !== '' ? parseFloat(body.balance) : 0,
  period:      body.period,
  notes:       body.notes !== undefined ? body.notes || null : undefined,
});

const INCLUDE = {
  employee: { select: { firstName: true, lastName: true, employeeCode: true } },
  transactionCode: { select: { code: true, name: true, type: true } },
};

// GET /api/payroll-inputs
router.get('/', async (req, res) => {
  const { payrollRunId, employeeId, processed } = req.query;
  try {
    const where = {
      ...(payrollRunId && { payrollRunId }),
      ...(employeeId && { employeeId }),
      ...(processed !== undefined && processed !== '' && { processed: processed === 'true' }),
    };
    if (req.companyId) {
      where.employee = { companyId: req.companyId };
    }
    const inputs = await prisma.payrollInput.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(inputs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/payroll-inputs
router.post('/', requirePermission('process_payroll'), async (req, res) => {
  const { employeeId, payrollRunId, transactionCodeId, period } = req.body;
  if (!employeeId || !transactionCodeId || !period) {
    return res.status(400).json({ message: 'employeeId, transactionCodeId, and period are required' });
  }
  try {
    const data = pick(req.body);
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const input = await prisma.payrollInput.create({
      data: { employeeId, payrollRunId: payrollRunId || null, transactionCodeId, ...data },
      include: INCLUDE,
    });
    res.status(201).json(input);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/payroll-inputs/:id
router.put('/:id', requirePermission('process_payroll'), async (req, res) => {
  try {
    const existing = await prisma.payrollInput.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Payroll input not found' });
    if (existing.processed) return res.status(400).json({ message: 'Cannot edit a processed input' });

    const { transactionCodeId } = req.body;
    const data = pick(req.body);
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    const input = await prisma.payrollInput.update({
      where: { id: req.params.id },
      data: { ...(transactionCodeId && { transactionCodeId }), ...data },
      include: INCLUDE,
    });
    res.json(input);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/payroll-inputs/:id
router.delete('/:id', requirePermission('process_payroll'), async (req, res) => {
  try {
    const input = await prisma.payrollInput.findUnique({ where: { id: req.params.id } });
    if (!input) return res.status(404).json({ message: 'Payroll input not found' });
    if (input.processed) return res.status(400).json({ message: 'Cannot delete a processed input' });
    await prisma.payrollInput.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/payroll-inputs — bulk delete unprocessed for a run
router.delete('/', requirePermission('process_payroll'), async (req, res) => {
  const { payrollRunId } = req.query;
  if (!payrollRunId) return res.status(400).json({ message: 'payrollRunId query param required' });
  try {
    const { count } = await prisma.payrollInput.deleteMany({
      where: { payrollRunId, processed: false },
    });
    res.json({ deleted: count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
