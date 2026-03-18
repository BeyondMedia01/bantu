const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/transaction-codes
router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.clientId) where.clientId = req.clientId;
    if (req.query.type) where.type = req.query.type;

    const codes = await prisma.transactionCode.findMany({
      where,
      orderBy: { code: 'asc' },
    });
    res.json(codes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/transaction-codes
router.post('/', requirePermission('update_settings'), async (req, res) => {
  const { code, name, description, type, taxable, pensionable, preTax } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!code || !name || !type) return res.status(400).json({ message: 'code, name, type are required' });

  try {
    const tc = await prisma.transactionCode.create({
      data: {
        clientId: req.clientId,
        code: code.toUpperCase(),
        name,
        description: description || null,
        type,
        taxable: taxable !== false,
        pensionable: pensionable !== false,
        preTax: type === 'DEDUCTION' ? (preTax === true) : false,
      },
    });
    res.status(201).json(tc);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'Transaction code already exists' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/transaction-codes/:id
router.get('/:id', async (req, res) => {
  try {
    const tc = await prisma.transactionCode.findUnique({ where: { id: req.params.id } });
    if (!tc) return res.status(404).json({ message: 'Transaction code not found' });
    res.json(tc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/transaction-codes/:id
router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  const { name, description, type, taxable, pensionable, preTax } = req.body;
  try {
    const tc = await prisma.transactionCode.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(taxable !== undefined && { taxable }),
        ...(pensionable !== undefined && { pensionable }),
        ...(preTax !== undefined && { preTax: type === 'DEDUCTION' ? (preTax === true) : false }),
      },
    });
    res.json(tc);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Transaction code not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/transaction-codes/:id
router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.transactionCode.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Transaction code not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
