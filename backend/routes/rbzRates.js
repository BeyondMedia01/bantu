const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

const DEFAULT_MAX_SPREAD = 0.02;

router.get('/', async (req, res) => {
  const { startDate, endDate } = req.query;
  
  try {
    const where = {};
    if (startDate) where.rateDate = { gte: new Date(startDate) };
    if (endDate) where.rateDate = { ...where.rateDate, lte: new Date(endDate) };
    
    const rates = await prisma.rBZExchangeRate.findMany({
      where,
      orderBy: { rateDate: 'desc' },
      take: 30,
    });
    
    res.json(rates);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/current', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let rate = await prisma.rBZExchangeRate.findFirst({
      where: {
        rateDate: { lte: today },
        isOfficial: true,
      },
      orderBy: { rateDate: 'desc' },
    });
    
    if (!rate) {
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      
      rate = await prisma.rBZExchangeRate.findFirst({
        where: {
          rateDate: { gte: lastWeek },
          isOfficial: true,
        },
        orderBy: { rateDate: 'desc' },
      });
    }
    
    if (!rate) {
      return res.status(404).json({ 
        message: 'No exchange rate found. Please upload the official RBZ rate.',
        required: true,
      });
    }
    
    const zigToUsdRate = parseFloat((1 / rate.usdToZiglRate).toFixed(6));
    
    res.json({
      ...rate,
      zigToUsdRate,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requirePermission('update_settings'), async (req, res) => {
  const { rateDate, usdToZiglRate, source, notes } = req.body;
  
  if (!rateDate || !usdToZiglRate) {
    return res.status(400).json({ message: 'rateDate and usdToZiglRate are required' });
  }
  
  const rateDateObj = new Date(rateDate);
  rateDateObj.setHours(0, 0, 0, 0);
  
  try {
    const existing = await prisma.rBZExchangeRate.findUnique({
      where: { rateDate: rateDateObj },
    });
    
    if (existing) {
      return res.status(400).json({ 
        message: 'A rate already exists for this date. Use PUT to update.',
        existingRate: existing,
      });
    }
    
    const isOfficial = source === 'RBZ_INTERBANK' || source === 'RBZ_OFFICIAL';
    
    const rate = await prisma.rBZExchangeRate.create({
      data: {
        rateDate: rateDateObj,
        usdToZiglRate: parseFloat(usdToZiglRate),
        source: source || 'RBZ_INTERBANK',
        isOfficial,
        maxSpread: DEFAULT_MAX_SPREAD,
        createdBy: req.user?.email,
        notes,
      },
    });
    
    await audit({
      req,
      action: 'RBZ_RATE_CREATED',
      resource: 'rbz_exchange_rate',
      resourceId: rate.id,
      details: { rateDate, usdToZiglRate, source },
    });
    
    res.status(201).json(rate);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  const { id } = req.params;
  const { usdToZiglRate, source, notes } = req.body;
  
  try {
    const existing = await prisma.rBZExchangeRate.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return res.status(404).json({ message: 'Rate not found' });
    }
    
    const updated = await prisma.rBZExchangeRate.update({
      where: { id },
      data: {
        usdToZiglRate: usdToZiglRate !== undefined ? parseFloat(usdToZiglRate) : existing.usdToZiglRate,
        source: source || existing.source,
        notes: notes !== undefined ? notes : existing.notes,
      },
    });
    
    await audit({
      req,
      action: 'RBZ_RATE_UPDATED',
      resource: 'rbz_exchange_rate',
      resourceId: id,
      details: { 
        oldRate: existing.usdToZiglRate, 
        newRate: updated.usdToZiglRate,
        changedBy: req.user?.email,
      },
    });
    
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/validate/:rate', async (req, res) => {
  const { rate } = req.params;
  const providedRate = parseFloat(rate);
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const officialRate = await prisma.rBZExchangeRate.findFirst({
      where: {
        rateDate: { lte: today },
        isOfficial: true,
      },
      orderBy: { rateDate: 'desc' },
    });
    
    if (!officialRate) {
      return res.json({
        valid: true,
        warning: 'No official rate found. Rate will be used as provided.',
        providedRate,
      });
    }
    
    const spread = Math.abs(providedRate - officialRate.usdToZiglRate) / officialRate.usdToZiglRate;
    const maxSpread = officialRate.maxSpread || DEFAULT_MAX_SPREAD;
    
    const isValid = spread <= maxSpread;
    
    res.json({
      valid: isValid,
      providedRate,
      officialRate: officialRate.usdToZiglRate,
      spread: (spread * 100).toFixed(2) + '%',
      maxAllowedSpread: (maxSpread * 100).toFixed(2) + '%',
      exceedsLimit: !isValid,
      message: isValid 
        ? 'Rate is within acceptable spread of official rate'
        : `Rate exceeds maximum allowed spread of ${(maxSpread * 100).toFixed(2)}%`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
