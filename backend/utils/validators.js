const ZIMBABWE_TIN_FORMAT = {
  old: /^\d{10}[A-Z]$/,
  new: /^\d{2}-\d{6,8}[A-Z]\d{2}$/,
  format: 'Old: 1234567890A or New: 12-345678A01',
};

function validateTIN(tin) {
  if (!tin || tin.trim() === '') {
    return { valid: false, error: 'TIN is required' };
  }

  const cleanTIN = tin.trim().toUpperCase();

  if (ZIMBABWE_TIN_FORMAT.old.test(cleanTIN)) {
    return { valid: true, format: 'OLD_10_DIGIT_LETTER', tin: cleanTIN };
  }

  if (ZIMBABWE_TIN_FORMAT.new.test(cleanTIN)) {
    return { valid: true, format: 'NEW_FORMAT', tin: cleanTIN };
  }

  return {
    valid: false,
    error: `Invalid TIN format. Expected: ${ZIMBABWE_TIN_FORMAT.format}`,
    provided: cleanTIN,
  };
}

const ZIMBABWE_NSSA_FORMAT = /^(ZW)?\d{6}$/;

function validateNSSANumber(nssaNum) {
  if (!nssaNum || nssaNum.trim() === '') {
    return { valid: false, error: 'NSSA number is required' };
  }

  const clean = nssaNum.trim().toUpperCase();

  if (ZIMBABWE_NSSA_FORMAT.test(clean)) {
    const normalized = clean.startsWith('ZW') ? clean : `ZW${clean}`;
    return { valid: true, nssaNumber: normalized, format: 'ZWXXXXXX' };
  }

  return {
    valid: false,
    error: 'Invalid NSSA number format. Expected: ZW123456 or 123456',
    provided: clean,
  };
}

function validateBankAccount(accountNumber, bankCode) {
  if (!accountNumber || accountNumber.trim() === '') {
    return { valid: false, error: 'Account number is required' };
  }

  const clean = accountNumber.trim().replace(/\s/g, '');

  if (clean.length < 6 || clean.length > 20) {
    return { valid: false, error: 'Account number must be 6-20 characters' };
  }

  if (!/^[A-Z0-9]+$/i.test(clean)) {
    return { valid: false, error: 'Account number must contain only letters and numbers' };
  }

  return { valid: true, accountNumber: clean };
}

function validatePayslipConsistency(payslip, transactions, transactionCodes) {
  const discrepancies = [];

  const payslipPaye = payslip.paye || 0;
  const txnPaye = transactions
    .filter(t => t.transactionCode.affectsPaye && t.transactionCode.category === 'DEDUCTION')
    .reduce((sum, t) => sum + t.amount, 0);

  if (Math.abs(payslipPaye - txnPaye) > 0.01) {
    discrepancies.push({
      field: 'PAYE',
      payslipAmount: payslipPaye,
      transactionAmount: txnPaye,
      difference: payslipPaye - txnPaye,
    });
  }

  const payslipNssa = payslip.nssaEmployee || 0;
  const txnNssa = transactions
    .filter(t => t.transactionCode.affectsNssa && t.transactionCode.code?.toUpperCase().includes('NSSA'))
    .reduce((sum, t) => sum + t.amount, 0);

  if (Math.abs(payslipNssa - txnNssa) > 0.01) {
    discrepancies.push({
      field: 'NSSA',
      payslipAmount: payslipNssa,
      transactionAmount: txnNssa,
      difference: payslipNssa - txnNssa,
    });
  }

  return {
    consistent: discrepancies.length === 0,
    discrepancies,
  };
}

function validateCompanyForZIMRA(company) {
  const issues = [];

  if (!company.taxId || company.taxId.trim() === '') {
    issues.push({ field: 'taxId', severity: 'BLOCKING', message: 'Employer TIN is required for ZIMRA filing' });
  }

  if (!company.registrationNumber || company.registrationNumber.trim() === '') {
    issues.push({ field: 'registrationNumber', severity: 'BLOCKING', message: 'Company registration number is required' });
  }

  if (!company.nssaRegistrationNumber || company.nssaRegistrationNumber.trim() === '') {
    issues.push({ field: 'nssaRegistrationNumber', severity: 'WARNING', message: 'NSSA registration number is required for NSSA filing' });
  }

  if (!company.industryCode || company.industryCode.trim() === '') {
    issues.push({ field: 'industryCode', severity: 'WARNING', message: 'Industry code is required for ZIMRA category classification' });
  }

  return {
    valid: !issues.some(i => i.severity === 'BLOCKING'),
    canExport: !issues.some(i => i.severity === 'BLOCKING'),
    issues,
  };
}

async function validatePeriodOverlap(companyId, startDate, endDate, excludeRunId = null, prisma = null) {
  if (!prisma) {
    return {
      hasOverlap: false,
      message: 'Database not available for overlap check',
      warning: true,
    };
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const whereClause = {
      companyId,
      status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED', 'LOCKED'] },
      OR: [
        {
          AND: [
            { startDate: { lte: start } },
            { endDate: { gte: start } },
          ],
        },
        {
          AND: [
            { startDate: { lte: end } },
            { endDate: { gte: end } },
          ],
        },
        {
          AND: [
            { startDate: { gte: start } },
            { endDate: { lte: end } },
          ],
        },
      ],
    };

    if (excludeRunId) {
      whereClause.id = { not: excludeRunId };
    }

    const overlappingRuns = await prisma.payrollRun.findMany({
      where: whereClause,
      select: { id: true, startDate: true, endDate: true, status: true },
      take: 5,
    });

    if (overlappingRuns.length > 0) {
      const overlapDetails = overlappingRuns.map(r => 
        `${r.startDate.toISOString().slice(0,10)} - ${r.endDate.toISOString().slice(0,10)} (${r.status})`
      ).join('; ');

      return {
        hasOverlap: true,
        message: `Period overlaps with existing payroll run(s): ${overlapDetails}`,
        overlappingRuns: overlappingRuns.map(r => r.id),
      };
    }

    return {
      hasOverlap: false,
      message: null,
    };
  } catch (error) {
    console.error('Period overlap validation error:', error);
    return {
      hasOverlap: false,
      message: 'Error checking for period overlap',
      warning: true,
      error: error.message,
    };
  }
}

module.exports = {
  validateTIN,
  validateNSSANumber,
  validateBankAccount,
  validatePayslipConsistency,
  validateCompanyForZIMRA,
  validatePeriodOverlap,
  ZIMBABWE_TIN_FORMAT,
  ZIMBABWE_NSSA_FORMAT,
};
