const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all system settings for a company
router.get('/', async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  try {
    const settings = await prisma.systemSetting.findMany({
      where: { companyId },
      orderBy: { settingName: 'asc' }
    });
    res.json(settings);
  } catch (error) {
    console.error('Failed to fetch system settings:', error);
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

// Create a new system setting
router.post('/', async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  const {
    settingName,
    settingValue,
    dataType,
    effectiveFrom,
    isActive,
    description,
    lastUpdatedBy
  } = req.body;

  try {
    const newSetting = await prisma.systemSetting.create({
      data: {
        companyId,
        settingName,
        settingValue: String(settingValue), // Always store as string
        dataType: dataType || 'TEXT',
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        isActive: isActive !== undefined ? isActive : true,
        description,
        lastUpdatedBy,
        lastUpdatedOn: new Date()
      }
    });
    res.status(201).json(newSetting);
  } catch (error) {
    console.error('Failed to create system setting:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A setting with this name and effective date already exists for this company.' });
    }
    res.status(500).json({ error: 'Failed to create system setting' });
  }
});

// Update a system setting
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const companyId = req.headers['x-company-id'];
  
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  const {
    settingValue,
    isActive,
    description,
    lastUpdatedBy
  } = req.body;

  try {
    // Verify ownership
    const existing = await prisma.systemSetting.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    const updatedSetting = await prisma.systemSetting.update({
      where: { id },
      data: {
        ...(settingValue !== undefined && { settingValue: String(settingValue) }),
        ...(isActive !== undefined && { isActive }),
        ...(description !== undefined && { description }),
        ...(lastUpdatedBy !== undefined && { lastUpdatedBy }),
        lastUpdatedOn: new Date()
      }
    });
    res.json(updatedSetting);
  } catch (error) {
    console.error('Failed to update system setting:', error);
    res.status(500).json({ error: 'Failed to update system setting' });
  }
});

// Delete a system setting
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const companyId = req.headers['x-company-id'];

  try {
    // Verify ownership
    const existing = await prisma.systemSetting.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    await prisma.systemSetting.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete system setting:', error);
    res.status(500).json({ error: 'Failed to delete system setting' });
  }
});

module.exports = router;
