const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { authenticateToken } = require('./lib/auth');
const companyContext = require('./middleware/companyContext');

const app = express();
const PORT = process.env.PORT || 5005;

// ─── Stripe Webhook (raw body — must come before express.json()) ──────────────
// Stripe requires the raw request body to verify the signature.

app.use('/api/webhooks', express.raw({ type: 'application/json' }), require('./routes/webhooks'));

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later.' },
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({ message: 'Bantu Payroll API', version: '2.0.0' });
});

// ─── Public Routes (no auth required) ────────────────────────────────────────

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/license/validate', require('./routes/licenseValidate'));

// ─── Protected Routes (auth + company context required) ──────────────────────

app.use(authenticateToken);
app.use(companyContext);

// User info
app.use('/api/user', require('./routes/user'));

// Dashboard
app.use('/api/dashboard', require('./routes/dashboard'));

// Platform & org structure
app.use('/api/clients', require('./routes/clients'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/sub-companies', require('./routes/subCompanies'));

// Employees
app.use('/api/employees', require('./routes/employees'));
app.use('/api/employee', require('./routes/employeeSelf'));

// Payroll
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/payslips', require('./routes/payslips'));
app.use('/api/payroll-calendar', require('./routes/payrollCalendar'));
app.use('/api/payroll-inputs', require('./routes/payrollInputs'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/retroactive', require('./routes/retroactive'));
app.use('/api/tax-tables', require('./routes/taxTables'));
app.use('/api/grades', require('./routes/grades'));

// Leave & Loans
app.use('/api/leave', require('./routes/leave'));
app.use('/api/loans', require('./routes/loans'));

// License management (PLATFORM_ADMIN)
app.use('/api/license', require('./routes/licenses'));

// Admin (PLATFORM_ADMIN only)
app.use('/api/admin', require('./routes/admin'));

// Reports
app.use('/api/reports', require('./routes/reports'));

// Subscriptions
app.use('/api/subscription', require('./routes/subscriptions'));

// Utilities
app.use('/api/payincrease', require('./routes/payIncrease'));
app.use('/api/backpay', require('./routes/backPay'));
app.use('/api/period-end', require('./routes/periodEnd'));
app.use('/api/nssa-settings', require('./routes/nssaSettings'));
app.use('/api/currency-rates', require('./routes/currencyRates'));
app.use('/api/nec-tables', require('./routes/necTables'));

// Intelligence
app.use('/api/intelligence', require('./routes/intelligence'));

// ─── Global Error Handler ─────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server environment: ${process.env.NODE_ENV}`);
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', async () => {
  const prisma = require('./lib/prisma');
  await prisma.$disconnect();
  process.exit(0);
});
