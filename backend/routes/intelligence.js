const express = require('express');
const router = express.Router();
const { detectFraud, generateSmartAlerts } = require('../utils/intelligenceEngine');

// Ensure client/company context is present
router.use((req, res, next) => {
  if (!req.user || !req.user.clientId) {
    return res.status(403).json({ message: 'Unauthorized access to intelligence tools.' });
  }
  next();
});

// GET /api/intelligence/alerts
router.get('/alerts', async (req, res) => {
  try {
    const clientId = req.user.clientId;
    const companyId = req.companyId || req.query.companyId || req.user.companyId;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID required' });
    }

    const alerts = await generateSmartAlerts(clientId, companyId);
    res.json({ alerts });
  } catch (error) {
    console.error('Error generating smart alerts:', error);
    res.status(500).json({ message: 'Failed to generate smart alerts.' });
  }
});

// GET /api/intelligence/fraud
router.get('/fraud', async (req, res) => {
  try {
    const clientId = req.user.clientId;
    const companyId = req.companyId || req.query.companyId || req.user.companyId;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID required' });
    }

    const fraudFlags = await detectFraud(clientId, companyId);
    res.json({ flags: fraudFlags });
  } catch (error) {
    console.error('Error detecting fraud:', error);
    res.status(500).json({ message: 'Failed to run fraud detection.' });
  }
});

module.exports = router;
