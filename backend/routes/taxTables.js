const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const multer = require('multer');
const { parseTaxCSV, parseTaxPDF, parseTaxExcel } = require('../lib/taxTableParser');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// GET /api/tax-tables
router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.clientId) where.clientId = req.clientId;
    if (req.query.currency) where.currency = req.query.currency;

    const tables = await prisma.taxTable.findMany({
      where,
      include: { _count: { select: { brackets: true } } },
      orderBy: { effectiveDate: 'desc' },
    });
    res.json(tables);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/tax-tables
router.post('/', requirePermission('update_settings'), async (req, res) => {
  const { name, currency, effectiveDate, expiryDate } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!name || !currency || !effectiveDate) {
    return res.status(400).json({ message: 'name, currency, effectiveDate are required' });
  }

  try {
    const table = await prisma.taxTable.create({
      data: {
        clientId: req.clientId,
        name,
        currency,
        effectiveDate: new Date(effectiveDate),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });
    res.status(201).json(table);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/tax-tables/:id
router.get('/:id', async (req, res) => {
  try {
    const table = await prisma.taxTable.findUnique({
      where: { id: req.params.id },
      include: { brackets: { orderBy: { lowerBound: 'asc' } } },
    });
    if (!table) return res.status(404).json({ message: 'Tax table not found' });
    res.json(table);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/tax-tables/:id
router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  const { name, currency, effectiveDate, expiryDate } = req.body;
  try {
    const table = await prisma.taxTable.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(currency && { currency }),
        ...(effectiveDate && { effectiveDate: new Date(effectiveDate) }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
      },
    });
    res.json(table);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Tax table not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/tax-tables/:id
router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.taxTable.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Tax table not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Brackets ─────────────────────────────────────────────────────────────────

// GET /api/tax-tables/:id/brackets
router.get('/:id/brackets', async (req, res) => {
  try {
    const brackets = await prisma.taxBracket.findMany({
      where: { taxTableId: req.params.id },
      orderBy: { lowerBound: 'asc' },
    });
    res.json(brackets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/tax-tables/:id/brackets
router.post('/:id/brackets', requirePermission('update_settings'), async (req, res) => {
  const { lowerBound, upperBound, rate, fixedAmount } = req.body;
  if (lowerBound === undefined || rate === undefined) {
    return res.status(400).json({ message: 'lowerBound and rate are required' });
  }

  try {
    const bracket = await prisma.taxBracket.create({
      data: {
        taxTableId: req.params.id,
        lowerBound: parseFloat(lowerBound),
        upperBound: upperBound !== undefined ? parseFloat(upperBound) : null,
        rate: parseFloat(rate),
        fixedAmount: fixedAmount !== undefined ? parseFloat(fixedAmount) : 0,
      },
    });
    res.status(201).json(bracket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/tax-tables/:tableId/brackets/:bracketId
router.put('/:tableId/brackets/:bracketId', requirePermission('update_settings'), async (req, res) => {
  const { lowerBound, upperBound, rate, fixedAmount } = req.body;
  try {
    const bracket = await prisma.taxBracket.update({
      where: { id: req.params.bracketId },
      data: {
        ...(lowerBound !== undefined && { lowerBound: parseFloat(lowerBound) }),
        ...(upperBound !== undefined && { upperBound: upperBound ? parseFloat(upperBound) : null }),
        ...(rate !== undefined && { rate: parseFloat(rate) }),
        ...(fixedAmount !== undefined && { fixedAmount: parseFloat(fixedAmount) }),
      },
    });
    res.json(bracket);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Tax bracket not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/tax-tables/:tableId/brackets/:bracketId
router.delete('/:tableId/brackets/:bracketId', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.taxBracket.delete({ where: { id: req.params.bracketId } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Tax bracket not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/tax-tables/:id/brackets/replace — replace all brackets atomically
router.post('/:id/brackets/replace', requirePermission('update_settings'), async (req, res) => {
  const { brackets } = req.body;
  if (!Array.isArray(brackets)) return res.status(400).json({ message: 'brackets array required' });

  try {
    await prisma.$transaction([
      prisma.taxBracket.deleteMany({ where: { taxTableId: req.params.id } }),
      prisma.taxBracket.createMany({
        data: brackets.map((b) => ({
          taxTableId: req.params.id,
          lowerBound: parseFloat(b.lowerBound),
          upperBound: b.upperBound !== undefined ? parseFloat(b.upperBound) : null,
          rate: parseFloat(b.rate),
          fixedAmount: b.fixedAmount !== undefined ? parseFloat(b.fixedAmount) : 0,
        })),
      }),
    ]);

    const updated = await prisma.taxBracket.findMany({
      where: { taxTableId: req.params.id },
      orderBy: { lowerBound: 'asc' },
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/tax-tables/:id/upload — upload CSV or PDF to replace brackets
router.post('/:id/upload', requirePermission('update_settings'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  
  try {
    let brackets = [];
    if (req.file.mimetype === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      brackets = parseTaxCSV(req.file.buffer);
    } else if (req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf')) {
      brackets = await parseTaxPDF(req.file.buffer);
    } else if (req.file.originalname.endsWith('.xlsx') || req.file.originalname.endsWith('.xls')) {
      brackets = parseTaxExcel(req.file.buffer);
    } else {
      return res.status(400).json({ message: 'Unsupported file type. Please upload CSV, PDF, or Excel.' });
    }

    console.log(`Parsed ${brackets.length} brackets from ${req.file.originalname}`);

    if (brackets.length === 0) {
      return res.status(400).json({ message: 'No valid tax brackets found in file.' });
    }

    // Atomic update
    await prisma.$transaction([
      prisma.taxBracket.deleteMany({ where: { taxTableId: req.params.id } }),
      prisma.taxBracket.createMany({
        data: brackets.map((b) => ({
          taxTableId: req.params.id,
          lowerBound: b.lowerBound,
          upperBound: b.upperBound,
          rate: b.rate,
          fixedAmount: b.fixedAmount,
        })),
      }),
    ]);

    const updated = await prisma.taxBracket.findMany({
      where: { taxTableId: req.params.id },
      orderBy: { lowerBound: 'asc' },
    });
    
    res.json({ 
      message: `Successfully imported ${brackets.length} brackets.`,
      brackets: updated 
    });
  } catch (error) {
    console.error('Tax upload error:', error);
    res.status(500).json({ message: 'Failed to process file: ' + error.message });
  }
});

module.exports = router;
