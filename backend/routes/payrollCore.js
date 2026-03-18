const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET all PayrollCore entries for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const cores = await prisma.payrollCore.findMany({
      where: { companyId: req.companyId }
    });
    res.json(cores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new PayrollCore entry
router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const core = await prisma.payrollCore.create({
      data: {
        ...req.body,
        companyId: req.companyId,
        startDate: new Date(req.body.startDate)
      }
    });
    res.json(core);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a PayrollCore entry
router.put('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const core = await prisma.payrollCore.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined
      }
    });
    res.json(core);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a PayrollCore entry
router.delete('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    await prisma.payrollCore.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'PayrollCore entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
