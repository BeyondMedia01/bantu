const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET all NSSAContribution entries for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const contributions = await prisma.nSSAContribution.findMany({
      where: { companyId: req.companyId },
      include: {
        employee: { select: { fullName: true, employeeID: true } }
      },
      orderBy: { payPeriod: 'desc' }
    });
    res.json(contributions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new NSSAContribution entry
router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const pensionableEarningsUSD = parseFloat(req.body.pensionableEarningsUSD);
    const employeeContributionPercent = parseFloat(req.body.employeeContributionPercent || 4.5);
    const employerContributionPercent = parseFloat(req.body.employerContributionPercent || 4.5);
    
    const employeeContributionUSD = (pensionableEarningsUSD * employeeContributionPercent) / 100;
    const employerContributionUSD = (pensionableEarningsUSD * employerContributionPercent) / 100;

    const contribution = await prisma.nSSAContribution.create({
      data: {
        ...req.body,
        companyId: req.companyId,
        pensionableEarningsUSD,
        employeeContributionPercent,
        employerContributionPercent,
        employeeContributionUSD,
        employerContributionUSD,
        payPeriod: new Date(req.body.payPeriod)
      }
    });
    res.json(contribution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE NSSAContribution (e.g., to mark as submitted)
router.put('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const contribution = await prisma.nSSAContribution.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(contribution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a NSSAContribution entry
router.delete('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    await prisma.nSSAContribution.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'NSSA contribution record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
