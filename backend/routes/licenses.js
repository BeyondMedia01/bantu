const express = require('express');
const { requireRole } = require('../lib/auth');
const { issueLicense, revokeLicense, reactivateLicense } = require('../lib/license');
const prisma = require('../lib/prisma');

const router = express.Router();
const adminOnly = requireRole('PLATFORM_ADMIN');

// POST /api/license/issue
router.post('/issue', adminOnly, async (req, res) => {
  const { clientId, employeeCap, expiryMonths, organizationName } = req.body;
  if (!clientId) return res.status(400).json({ message: 'clientId is required' });

  try {
    const license = await issueLicense(clientId, employeeCap || 10, expiryMonths || 12, organizationName);
    res.status(201).json(license);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/license/revoke
router.post('/revoke', adminOnly, async (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ message: 'clientId is required' });

  try {
    const license = await revokeLicense(clientId);
    res.json(license);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'License not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/license/reactivate
router.post('/reactivate', adminOnly, async (req, res) => {
  const { clientId, expiryMonths } = req.body;
  if (!clientId) return res.status(400).json({ message: 'clientId is required' });

  try {
    const license = await reactivateLicense(clientId, expiryMonths || 12);
    res.json(license);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'License not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/license — get current license status (authenticated)
router.get('/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'Unauthorized' });

    const { requireAuth } = require('../lib/auth');
    const decoded = requireAuth(req);
    if (!decoded.clientId) return res.status(400).json({ message: 'No client context' });

    const license = await prisma.licenseToken.findUnique({
      where: { clientId: decoded.clientId },
      include: { client: { select: { name: true } } },
    });

    if (!license) return res.status(404).json({ message: 'No license found' });

    const employeeCount = await prisma.employee.count({ where: { clientId: decoded.clientId } });

    res.json({
      valid: license.active && license.expiresAt > new Date(),
      expiresAt: license.expiresAt,
      active: license.active,
      employeeCap: license.employeeCap,
      employeeCount,
      clientName: license.client.name,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/license — list all licenses (PLATFORM_ADMIN)
router.get('/', async (req, res) => {
  try {
    const licenses = await prisma.licenseToken.findMany({
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(licenses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
