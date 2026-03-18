const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

/**
 * POST /api/period-end
 * Runs period-end processing for a payroll calendar period.
 * - Closes the payroll calendar
 * - Marks all PROCESSING payroll runs as COMPLETED
 * - Marks all pending loan repayments for the period as DUE
 *
 * Body: { payrollCalendarId: string }
 */
router.post('/', requirePermission('approve_payroll'), async (req, res) => {
  const { payrollCalendarId } = req.body;
  if (!payrollCalendarId) return res.status(400).json({ message: 'payrollCalendarId is required' });

  try {
    const calendar = await prisma.payrollCalendar.findUnique({
      where: { id: payrollCalendarId },
    });

    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });
    if (calendar.isClosed) return res.status(400).json({ message: 'Period is already closed' });

    // Verify the calendar belongs to this client
    if (req.clientId && calendar.clientId !== req.clientId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const results = await prisma.$transaction(async (tx) => {
      // Close the calendar period
      const closedCalendar = await tx.payrollCalendar.update({
        where: { id: payrollCalendarId },
        data: { isClosed: true },
      });

      // Finalise any runs still in PROCESSING state for this calendar
      const { count: runsCompleted } = await tx.payrollRun.updateMany({
        where: { payrollCalendarId, status: 'PROCESSING' },
        data: { status: 'COMPLETED' },
      });

      // Mark loan repayments due within the period as DUE (if not already paid)
      const { count: repaymentsMarked } = await tx.loanRepayment.updateMany({
        where: {
          status: 'PENDING',
          dueDate: {
            gte: calendar.startDate,
            lte: calendar.endDate,
          },
        },
        data: { status: 'DUE' },
      });

      return { closedCalendar, runsCompleted, repaymentsMarked };
    });

    res.json({
      message: 'Period-end processing completed',
      calendarId: payrollCalendarId,
      runsCompleted: results.runsCompleted,
      repaymentsMarked: results.repaymentsMarked,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/period-end/status?payrollCalendarId= — check period status
router.get('/status', async (req, res) => {
  const { payrollCalendarId } = req.query;
  if (!payrollCalendarId) return res.status(400).json({ message: 'payrollCalendarId is required' });

  try {
    const [calendar, runsInProgress, pendingInputs] = await Promise.all([
      prisma.payrollCalendar.findUnique({ where: { id: payrollCalendarId } }),
      prisma.payrollRun.count({ where: { payrollCalendarId, status: { in: ['PROCESSING', 'DRAFT'] } } }),
      prisma.payrollInput.count({ where: { payrollRunId: null, processed: false } }),
    ]);

    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });

    res.json({
      calendar,
      runsInProgress,
      pendingInputs,
      readyToClose: runsInProgress === 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
