const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/transactions - List all transaction codes
router.get('/', async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  try {
    const codes = await prisma.transactionCode.findMany({
      where: { clientId: req.clientId },
      include: {
        rules: { where: { isActive: true }, orderBy: { priority: 'asc' } },
      },
      orderBy: { code: 'asc' },
    });
    res.json(codes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/transactions/:id - Get single transaction code
router.get('/:id', async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  try {
    const code = await prisma.transactionCode.findFirst({
      where: { id: req.params.id, clientId: req.clientId },
      include: {
        rules: { orderBy: { priority: 'asc' } },
      },
    });
    if (!code) return res.status(404).json({ message: 'Transaction code not found' });
    res.json(code);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/transactions - Create new transaction code
router.post('/', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  const { 
    code, name, description, category, taxable, affectsPaye, affectsNssa, 
    affectsAidsLevy, affectsNec, calculationType, defaultValue, formula 
  } = req.body;
  
  if (!code || !name || !category) {
    return res.status(400).json({ message: 'Code, name, and category are required' });
  }
  
  try {
    const existing = await prisma.transactionCode.findUnique({
      where: { clientId_code: { clientId: req.clientId, code: code.toUpperCase() } },
    });
    if (existing) {
      return res.status(400).json({ message: 'Transaction code already exists' });
    }
    
    const newCode = await prisma.transactionCode.create({
      data: {
        clientId: req.clientId,
        code: code.toUpperCase(),
        name,
        description: description || null,
        category,
        taxable: taxable ?? true,
        affectsPaye: affectsPaye ?? true,
        affectsNssa: affectsNssa ?? true,
        affectsAidsLevy: affectsAidsLevy ?? false,
        affectsNec: affectsNec ?? false,
        calculationType: calculationType || 'FIXED',
        defaultValue: defaultValue || null,
        formula: formula || null,
      },
    });
    res.status(201).json(newCode);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/transactions/:id - Update transaction code
router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  const { 
    name, description, category, taxable, affectsPaye, affectsNssa, 
    affectsAidsLevy, affectsNec, calculationType, defaultValue, formula, isActive 
  } = req.body;
  
  try {
    const existing = await prisma.transactionCode.findFirst({
      where: { id: req.params.id, clientId: req.clientId },
    });
    if (!existing) return res.status(404).json({ message: 'Transaction code not found' });
    
    const updated = await prisma.transactionCode.update({
      where: { id: req.params.id },
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        category: category ?? existing.category,
        taxable: taxable ?? existing.taxable,
        affectsPaye: affectsPaye ?? existing.affectsPaye,
        affectsNssa: affectsNssa ?? existing.affectsNssa,
        affectsAidsLevy: affectsAidsLevy ?? existing.affectsAidsLevy,
        affectsNec: affectsNec ?? existing.affectsNec,
        calculationType: calculationType ?? existing.calculationType,
        defaultValue: defaultValue ?? existing.defaultValue,
        formula: formula ?? existing.formula,
        isActive: isActive ?? existing.isActive,
      },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/transactions/:id - Delete transaction code
router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  try {
    const existing = await prisma.transactionCode.findFirst({
      where: { id: req.params.id, clientId: req.clientId },
    });
    if (!existing) return res.status(404).json({ message: 'Transaction code not found' });
    
    // Check if code is in use
    const inUse = await prisma.payrollInput.findFirst({
      where: { transactionCodeId: req.params.id },
    });
    if (inUse) {
      return res.status(400).json({ message: 'Cannot delete - transaction code is in use. Consider deactivating instead.' });
    }
    
    await prisma.transactionCodeRule.deleteMany({
      where: { transactionCodeId: req.params.id },
    });
    await prisma.transactionCode.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Transaction code deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/transactions/:id/rules - Add rule to transaction code
router.post('/:id/rules', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  const { conditionType, conditionValue, calculationOverride, priority } = req.body;
  
  try {
    const code = await prisma.transactionCode.findFirst({
      where: { id: req.params.id, clientId: req.clientId },
    });
    if (!code) return res.status(404).json({ message: 'Transaction code not found' });
    
    const rule = await prisma.transactionCodeRule.create({
      data: {
        transactionCodeId: req.params.id,
        conditionType,
        conditionValue: conditionValue ? JSON.stringify(conditionValue) : null,
        calculationOverride: calculationOverride || null,
        priority: priority || 0,
      },
    });
    res.status(201).json(rule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/transactions/:id/rules/:ruleId - Update rule
router.put('/:id/rules/:ruleId', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  const { conditionType, conditionValue, calculationOverride, priority, isActive } = req.body;
  
  try {
    const rule = await prisma.transactionCodeRule.findFirst({
      where: { 
        id: req.params.ruleId,
        transactionCode: { clientId: req.clientId },
      },
    });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    
    const updated = await prisma.transactionCodeRule.update({
      where: { id: req.params.ruleId },
      data: {
        conditionType: conditionType ?? rule.conditionType,
        conditionValue: conditionValue ? JSON.stringify(conditionValue) : conditionValue ? rule.conditionValue : null,
        calculationOverride: calculationOverride ?? rule.calculationOverride,
        priority: priority ?? rule.priority,
        isActive: isActive ?? rule.isActive,
      },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/transactions/:id/rules/:ruleId - Delete rule
router.delete('/:id/rules/:ruleId', requirePermission('update_settings'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  
  try {
    const rule = await prisma.transactionCodeRule.findFirst({
      where: { 
        id: req.params.ruleId,
        transactionCode: { clientId: req.clientId },
      },
    });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    
    await prisma.transactionCodeRule.delete({
      where: { id: req.params.ruleId },
    });
    res.json({ message: 'Rule deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/transactions/employee/:employeeId - Get employee's recurring transactions
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const transactions = await prisma.employeeTransaction.findMany({
      where: { 
        employeeId: req.params.employeeId,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: new Date() } },
        ],
      },
      include: { transactionCode: true },
      orderBy: { transactionCode: { code: 'asc' } },
    });
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/transactions/employee/:employeeId - Add employee default transaction
router.post('/employee/:employeeId', requirePermission('update_employees'), async (req, res) => {
  const { transactionCodeId, value, effectiveFrom, effectiveTo, isRecurring, frequency } = req.body;
  
  try {
    const employee = await prisma.employee.findFirst({
      where: { 
        id: req.params.employeeId,
        clientId: req.clientId,
      },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    // Check for existing transaction and deactivate it
    const existing = await prisma.employeeTransaction.findFirst({
      where: { 
        employeeId: req.params.employeeId,
        transactionCodeId,
        isRecurring: true,
        effectiveTo: null,
      },
    });
    if (existing) {
      await prisma.employeeTransaction.update({
        where: { id: existing.id },
        data: { effectiveTo: new Date(effectiveFrom) },
      });
    }
    
    const empTrans = await prisma.employeeTransaction.create({
      data: {
        employeeId: req.params.employeeId,
        transactionCodeId,
        value: value || 0,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        isRecurring: isRecurring ?? true,
        frequency: frequency || 'MONTHLY',
      },
      include: { transactionCode: true },
    });
    res.status(201).json(empTrans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/transactions/employee/:id - Update employee transaction
router.put('/employee/:id', requirePermission('update_employees'), async (req, res) => {
  const { value, effectiveFrom, effectiveTo, isRecurring, frequency } = req.body;
  
  try {
    const existing = await prisma.employeeTransaction.findFirst({
      where: { 
        id: req.params.id,
        employee: { clientId: req.clientId },
      },
    });
    if (!existing) return res.status(404).json({ message: 'Employee transaction not found' });
    
    const updated = await prisma.employeeTransaction.update({
      where: { id: req.params.id },
      data: {
        value: value ?? existing.value,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : existing.effectiveFrom,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : existing.effectiveTo,
        isRecurring: isRecurring ?? existing.isRecurring,
        frequency: frequency ?? existing.frequency,
      },
      include: { transactionCode: true },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/transactions/employee/:id - Delete employee transaction
router.delete('/employee/:id', requirePermission('update_employees'), async (req, res) => {
  try {
    const existing = await prisma.employeeTransaction.findFirst({
      where: { 
        id: req.params.id,
        employee: { clientId: req.clientId },
      },
    });
    if (!existing) return res.status(404).json({ message: 'Employee transaction not found' });
    
    await prisma.employeeTransaction.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Employee transaction deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/transactions/import — bulk import transaction codes via CSV body
router.post('/import', requirePermission('update_settings'), async (req, res) => {
  const { rows } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'rows array is required' });
  }

  try {
    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      if (!row.code || !row.name || !row.category) {
        results.errors.push({ row, reason: 'Missing code, name, or category' });
        continue;
      }

      try {
        await prisma.transactionCode.upsert({
          where: { clientId_code: { clientId: req.clientId, code: row.code.toUpperCase() } },
          create: {
            clientId: req.clientId,
            code: row.code.toUpperCase(),
            name: row.name,
            description: row.description || null,
            category: row.category,
            taxable: row.taxable !== false,
            affectsPaye: row.affectsPaye !== false,
            affectsNssa: row.affectsNssa !== false,
            affectsAidsLevy: row.affectsAidsLevy === true,
            affectsNec: row.affectsNec === true,
            calculationType: row.calculationType || 'FIXED',
            defaultValue: row.defaultValue || null,
            formula: row.formula || null,
          },
          update: {
            name: row.name,
            description: row.description || null,
            category: row.category,
            taxable: row.taxable !== false,
            affectsPaye: row.affectsPaye !== false,
            affectsNssa: row.affectsNssa !== false,
            affectsAidsLevy: row.affectsAidsLevy === true,
            affectsNec: row.affectsNec === true,
            calculationType: row.calculationType || 'FIXED',
            defaultValue: row.defaultValue || null,
            formula: row.formula || null,
          },
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row, reason: err.message });
        results.skipped++;
      }
    }

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;