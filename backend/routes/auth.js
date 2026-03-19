const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { signToken } = require('../lib/auth');
const { validateLicense } = require('../lib/license');
const { sendPasswordReset } = require('../lib/mailer');

const router = express.Router();

const crypto = require('crypto');

// POST /api/auth/register — CLIENT_ADMIN registration with license token
router.post('/register', async (req, res) => {
  const { name, email, password, licenseToken } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, and password are required' });
  }

  // If no users exist, first-time setup (no license required)
  if (!licenseToken) {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(400).json({ message: 'License token is required' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create default client (self-contained setup)
      const client = await prisma.client.create({
        data: { name: 'My Organization', isActive: true },
      });

      // Create self-contained license (valid for 1 year, 10 employees)
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      const token = crypto.randomBytes(32).toString('hex');

      const license = await prisma.licenseToken.create({
        data: {
          clientId: client.id,
          token,
          expiresAt,
          active: true,
          employeeCap: 10,
        },
      });

      // Create user
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'CLIENT_ADMIN',
          clientAdmin: { create: { clientId: client.id } },
        },
      });

      const authToken = signToken({ userId: user.id, role: user.role, clientId: client.id });
      return res.status(201).json({
        token: authToken,
        role: user.role,
        clientId: client.id,
        licenseToken: license.token,
        message: 'Setup complete. Share this license token with your team: ' + license.token,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'Email already registered' });
      }
      console.error('Setup error:', error);
      res.status(500).json({ message: 'Setup failed' });
    }
  }

  // Validate provided license token
  const { valid, license, reason } = await validateLicense(licenseToken);
  if (!valid) return res.status(400).json({ message: `Invalid license: ${reason}` });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'CLIENT_ADMIN',
        clientAdmin: { create: { clientId: license.clientId } },
      },
    });

    const token = signToken({ userId: user.id, role: user.role, clientId: license.clientId });
    res.status(201).json({ token, role: user.role, clientId: license.clientId });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

    const token = signToken({ userId: user.id, role: user.role, clientId: license.clientId });
    res.status(201).json({ token, role: user.role, clientId: license.clientId });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        clientAdmin: true,
        employee: { select: { id: true, companyId: true, clientId: true } },
      },
    });

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const clientId = user.clientAdmin?.clientId ?? user.employee?.clientId ?? null;
    const companyId = user.employee?.companyId ?? null;
    const employeeId = user.employee?.id ?? null;

    const token = signToken({ userId: user.id, role: user.role, clientId });
    res.json({ token, role: user.role, clientId, companyId, employeeId, name: user.name });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// POST /api/auth/forgot-password
// Generates a reset token and emails a link. Always returns 200 to prevent
// email enumeration — callers can't tell if the address exists or not.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'email is required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpiry: expiry },
      });

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
      await sendPasswordReset(email, resetUrl);
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });

    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

module.exports = router;
