const crypto = require('crypto');
const prisma = require('./prisma');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const generateLicenseToken = () =>
  crypto.randomBytes(32).toString('hex');

const issueLicense = async (clientId, employeeCap = 10, expiryMonths = 12, organizationName = null) => {
  const token = generateLicenseToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  return prisma.licenseToken.upsert({
    where: { clientId },
    update: { token, tokenHash, expiresAt, employeeCap, active: true, organizationName },
    create: { clientId, token, tokenHash, expiresAt, employeeCap, active: true, organizationName },
  });
};

const validateLicense = async (token, deviceId = null) => {
  const tokenHash = hashToken(token);
  const license = await prisma.licenseToken.findUnique({
    where: { tokenHash },
    include: { client: true },
  });

  if (!license) return { valid: false, reason: 'License token not found' };
  if (!license.active) return { valid: false, reason: 'License has been revoked' };
  if (license.expiresAt < new Date()) return { valid: false, reason: 'License has expired' };
  if (license.redeemedAt && license.redeemedDeviceId && license.redeemedDeviceId !== deviceId) {
    return { valid: false, reason: 'License has already been activated on another device' };
  }
  if (license.redeemedAt && !deviceId) {
    return { valid: false, reason: 'License has already been used' };
  }

  const employeeCount = await prisma.employee.count({ where: { clientId: license.clientId } });
  if (employeeCount >= license.employeeCap) {
    return {
      valid: true,
      license,
      employeeCount,
      employeeCap: license.employeeCap,
      warning: `Employee cap reached (${license.employeeCap}). Upgrade required.`
    };
  }

  return { valid: true, license, employeeCount, employeeCap: license.employeeCap };
};

const redeemLicense = async (token, deviceId) => {
  const tokenHash = hashToken(token);
  return prisma.licenseToken.update({
    where: { tokenHash },
    data: { redeemedAt: new Date(), redeemedDeviceId: deviceId },
  });
};

const revokeLicense = async (clientId) =>
  prisma.licenseToken.update({
    where: { clientId },
    data: { active: false },
  });

const reactivateLicense = async (clientId, expiryMonths = 12) => {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  return prisma.licenseToken.update({
    where: { clientId },
    data: { active: true, expiresAt },
  });
};

const checkEmployeeCap = async (clientId) => {
  const license = await prisma.licenseToken.findUnique({
    where: { clientId },
  });

  const subscription = await prisma.subscription.findUnique({
    where: { clientId },
  });

  const cap = license?.employeeCap ?? subscription?.employeeCap ?? 10;
  const count = await prisma.employee.count({ where: { clientId } });

  return {
    withinCap: count < cap,
    cap,
    count,
  };
};

module.exports = {
  generateLicenseToken,
  hashToken,
  issueLicense,
  validateLicense,
  redeemLicense,
  revokeLicense,
  reactivateLicense,
  checkEmployeeCap,
};
