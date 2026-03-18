const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET all CurrencyRate entries for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const rates = await prisma.currencyRate.findMany({
      where: { companyId: req.companyId },
      orderBy: { effectiveDate: 'desc' }
    });
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new CurrencyRate entry
router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const rate = await prisma.currencyRate.create({
      data: {
        ...req.body,
        companyId: req.companyId,
        effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined,
        rateToUSD: parseFloat(req.body.rateToUSD)
      }
    });
    res.json(rate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a CurrencyRate entry
router.put('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const rate = await prisma.currencyRate.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined,
        rateToUSD: req.body.rateToUSD ? parseFloat(req.body.rateToUSD) : undefined
      }
    });
    res.json(rate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a CurrencyRate entry
router.delete('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    await prisma.currencyRate.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'CurrencyRate entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
