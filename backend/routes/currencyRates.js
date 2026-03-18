const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

router.get('/', requirePermission('view_reports'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  
  const { startDate, endDate } = req.query;
  
  try {
    const where = {};
    if (startDate) where.rateDate = { ...where.rateDate, gte: new Date(startDate) };
    if (endDate) where.rateDate = { ...where.rateDate, lte: new Date(endDate) };
    
    const rates = await prisma.rBZExchangeRate.findMany({
      where,
      orderBy: { rateDate: 'desc' },
      take: 30,
    });
    
    const formattedRates = rates.map(r => ({
      id: r.id,
      companyId: req.companyId,
      effectiveDate: r.rateDate,
      rateDate: r.rateDate,
      rateToUSD: r.usdToZiglRate,
      usdToZiglRate: r.usdToZiglRate,
      zigToUsdRate: parseFloat((1 / r.usdToZiglRate).toFixed(6)),
      source: r.source,
      isOfficial: r.isOfficial,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
    
    res.json(formattedRates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requirePermission('update_settings'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  
  const { rateDate, rateToUSD, source, notes } = req.body;
  
  if (!rateDate || !rateToUSD) {
    return res.status(400).json({ message: 'rateDate and rateToUSD are required' });
  }
  
  try {
    const existing = await prisma.rBZExchangeRate.findFirst({
      where: { rateDate: new Date(rateDate) },
    });
    
    if (existing) {
      return res.status(400).json({ 
        message: 'A rate already exists for this date',
        existingRate: existing,
      });
    }
    
    const isOfficial = source === 'RBZ_INTERBANK' || source === 'RBZ_OFFICIAL';
    
    const rate = await prisma.rBZExchangeRate.create({
      data: {
        rateDate: new Date(rateDate),
        usdToZiglRate: parseFloat(rateToUSD),
        source: source || 'RBZ_INTERBANK',
        isOfficial,
        createdBy: req.user?.email,
        notes,
      },
    });
    
    await audit({
      req,
      action: 'CURRENCY_RATE_CREATED',
      resource: 'rbz_exchange_rate',
      resourceId: rate.id,
      details: { rateDate, rateToUSD, source },
    });
    
    res.status(201).json({
      id: rate.id,
      companyId: req.companyId,
      effectiveDate: rate.rateDate,
      rateToUSD: rate.usdToZiglRate,
      source: rate.source,
      isOfficial: rate.isOfficial,
      notes: rate.notes,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  
  const { rateToUSD, source, notes } = req.body;
  
  try {
    const existing = await prisma.rBZExchangeRate.findUnique({
      where: { id: req.params.id },
    });
    
    if (!existing) {
      return res.status(404).json({ message: 'Rate not found' });
    }
    
    const updated = await prisma.rBZExchangeRate.update({
      where: { id: req.params.id },
      data: {
        usdToZiglRate: rateToUSD ? parseFloat(rateToUSD) : existing.usdToZiglRate,
        source: source || existing.source,
        notes: notes !== undefined ? notes : existing.notes,
      },
    });
    
    await audit({
      req,
      action: 'CURRENCY_RATE_UPDATED',
      resource: 'rbz_exchange_rate',
      resourceId: updated.id,
      details: { oldRate: existing.usdToZiglRate, newRate: updated.usdToZiglRate },
    });
    
    res.json({
      id: updated.id,
      companyId: req.companyId,
      effectiveDate: updated.rateDate,
      rateToUSD: updated.usdToZiglRate,
      source: updated.source,
      isOfficial: updated.isOfficial,
      notes: updated.notes,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  
  try {
    const existing = await prisma.rBZExchangeRate.findUnique({
      where: { id: req.params.id },
    });
    
    if (!existing) {
      return res.status(404).json({ message: 'Rate not found' });
    }
    
    await prisma.rBZExchangeRate.delete({
      where: { id: req.params.id },
    });
    
    await audit({
      req,
      action: 'CURRENCY_RATE_DELETED',
      resource: 'rbz_exchange_rate',
      resourceId: req.params.id,
    });
    
    res.json({ message: 'Currency rate deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
