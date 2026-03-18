const DEFAULT_STATUTORY_RATES = {
  AIDS_LEVY: 0.03,
  NSSA_EMPLOYEE: 0.045,
  NSSA_EMPLOYER: 0.045,
  PENSION_CAP: 0.15,
  MEDICAL_AID_CREDIT_RATE: 0.25,
  MEDICAL_AID_CREDIT_ANNUAL_CAP: 600,
  AIDS_LEVY_EXEMPTION_THRESHOLD_USD: 500,
  AIDS_LEVY_EXEMPTION_THRESHOLD_ZIG: 20000,
  UIF_EMPLOYEE: 0.01,
  UIF_EMPLOYER: 0.01,
  UIF_CEILING_USD: 100,
  UIF_CEILING_ZIG: 100000,
};

let STATUTORY_RATES = { ...DEFAULT_STATUTORY_RATES };

async function loadStatutoryRates(prisma) {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        settingName: {
          in: [
            'AIDS_LEVY_RATE',
            'NSSA_EMPLOYEE_RATE',
            'NSSA_EMPLOYER_RATE',
            'NSSA_CEILING_USD',
            'NSSA_CEILING_ZIG',
            'PENSION_CAP_RATE',
            'AIDS_LEVY_EXEMPTION_THRESHOLD_USD',
            'AIDS_LEVY_EXEMPTION_THRESHOLD_ZIG',
            'MEDICAL_AID_CREDIT_RATE',
            'MEDICAL_AID_CREDIT_ANNUAL_CAP',
            'UIF_EMPLOYEE_RATE',
            'UIF_EMPLOYER_RATE',
            'UIF_CEILING_USD',
            'UIF_CEILING_ZIG',
          ],
        },
        isActive: true,
      },
    });
    
    const rates = {};
    for (const s of settings) {
      if (s.settingName === 'AIDS_LEVY_RATE') rates.AIDS_LEVY = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'NSSA_EMPLOYEE_RATE') rates.NSSA_EMPLOYEE = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'NSSA_EMPLOYER_RATE') rates.NSSA_EMPLOYER = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'NSSA_CEILING_USD') rates.NSSA_CEILING_USD = parseFloat(s.settingValue);
      if (s.settingName === 'NSSA_CEILING_ZIG') rates.NSSA_CEILING_ZIG = parseFloat(s.settingValue);
      if (s.settingName === 'PENSION_CAP_RATE') rates.PENSION_CAP = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'AIDS_LEVY_EXEMPTION_THRESHOLD_USD') rates.AIDS_LEVY_EXEMPTION_THRESHOLD_USD = parseFloat(s.settingValue);
      if (s.settingName === 'AIDS_LEVY_EXEMPTION_THRESHOLD_ZIG') rates.AIDS_LEVY_EXEMPTION_THRESHOLD_ZIG = parseFloat(s.settingValue);
      if (s.settingName === 'MEDICAL_AID_CREDIT_RATE') rates.MEDICAL_AID_CREDIT_RATE = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'MEDICAL_AID_CREDIT_ANNUAL_CAP') rates.MEDICAL_AID_CREDIT_ANNUAL_CAP = parseFloat(s.settingValue);
      if (s.settingName === 'UIF_EMPLOYEE_RATE') rates.UIF_EMPLOYEE = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'UIF_EMPLOYER_RATE') rates.UIF_EMPLOYER = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'UIF_CEILING_USD') rates.UIF_CEILING_USD = parseFloat(s.settingValue);
      if (s.settingName === 'UIF_CEILING_ZIG') rates.UIF_CEILING_ZIG = parseFloat(s.settingValue);
    }
    
    if (Object.keys(rates).length > 0) {
      STATUTORY_RATES = { ...DEFAULT_STATUTORY_RATES, ...rates };
      console.log('Statutory rates loaded from settings:', STATUTORY_RATES);
    }
  } catch (err) {
    console.error('Failed to load statutory rates from settings:', err.message);
  }
}

const USD_TAX_BANDS_2024 = [
  { lower: 0,    upper: 100,      rate: 0,    fixed: 0 },
  { lower: 100,  upper: 300,      rate: 0.20, fixed: 0 },
  { lower: 300,  upper: 1000,     rate: 0.25, fixed: 40 },
  { lower: 1000, upper: 2000,     rate: 0.30, fixed: 215 },
  { lower: 2000, upper: 3000,     rate: 0.35, fixed: 515 },
  { lower: 3000, upper: Infinity, rate: 0.40, fixed: 865 },
];

const ZIG_TAX_BANDS_2024 = [
  { lower: 0,     upper: 2800,     rate: 0,    fixed: 0 },
  { lower: 2800,  upper: 8400,     rate: 0.20, fixed: 0 },
  { lower: 8400,  upper: 28000,    rate: 0.25, fixed: 1120 },
  { lower: 28000, upper: 56000,    rate: 0.30, fixed: 6020 },
  { lower: 56000, upper: 84000,    rate: 0.35, fixed: 14420 },
  { lower: 84000, upper: Infinity, rate: 0.40, fixed: 24220 },
];

const DEFAULT_NSSA_CEILING = { USD: 700, ZiG: 7000 };

const normaliseBrackets = (brackets) =>
  brackets
    .sort((a, b) => a.lowerBound - b.lowerBound)
    .map((b) => ({
      lower: b.lowerBound,
      upper: b.upperBound ?? Infinity,
      rate: b.rate,
      fixed: b.fixedAmount ?? 0,
    }));

function calculatePaye({
  baseSalary,
  currency,
  taxableBenefits = 0,
  motorVehicleBenefit = 0,
  overtimeAmount = 0,
  bonus = 0,
  bonusExemption = 0,
  severanceAmount = 0,
  severanceExemption = 0,
  pensionContribution = 0,
  medicalAid = 0,
  taxCredits = 0,
  wcifRate = 0,
  sdfRate = 0,
  taxBrackets = null,
  annualBrackets = false,
  nssaCeiling = null,
  employmentType = 'PERMANENT',
  taxDirective = null,
  taxDirectiveType = null,
  taxDirectivePerc = null,
  taxDirectiveAmt = null,
  sickLeaveTaxable = true,
  maternityLeaveTaxable = true,
  sickLeaveAmount = 0,
  maternityLeaveAmount = 0,
  pensionFundRegistered = true,
}) {
  let bands;
  if (taxBrackets && taxBrackets.length > 0) {
    bands = normaliseBrackets(taxBrackets);
  } else {
    bands = currency === 'USD' ? USD_TAX_BANDS_2024 : ZIG_TAX_BANDS_2024;
  }

  const ceiling = nssaCeiling ?? (currency === 'ZiG' 
    ? (STATUTORY_RATES.NSSA_CEILING_ZIG || 7000) 
    : (STATUTORY_RATES.NSSA_CEILING_USD || 700));

  let totalEarnings = baseSalary + overtimeAmount + bonus + severanceAmount;

  if (!sickLeaveTaxable && sickLeaveAmount > 0) {
    totalEarnings -= sickLeaveAmount;
  }
  if (!maternityLeaveTaxable && maternityLeaveAmount > 0) {
    const taxableMaternity = Math.max(0, maternityLeaveAmount - (28 * baseSalary / 22));
    totalEarnings -= taxableMaternity;
  }

  const pensionCap = totalEarnings * STATUTORY_RATES.PENSION_CAP;
  const cappedPension = Math.min(pensionContribution, pensionCap);

  const exemptBonus = Math.min(bonus, bonusExemption);
  const exemptSeverance = Math.min(severanceAmount, severanceExemption);

  const grossForTax = totalEarnings + taxableBenefits + motorVehicleBenefit
                      - exemptBonus - exemptSeverance;

  const nssaBasis = Math.min(totalEarnings, ceiling);
  const nssaEmployee = nssaBasis * STATUTORY_RATES.NSSA_EMPLOYEE;
  const nssaEmployer = nssaBasis * STATUTORY_RATES.NSSA_EMPLOYER;

  const wcifEmployer = totalEarnings * wcifRate;
  const sdfContribution = totalEarnings * sdfRate;
  
  const uifCeiling = currency === 'ZiG' 
    ? STATUTORY_RATES.UIF_CEILING_ZIG 
    : STATUTORY_RATES.UIF_CEILING_USD;
  const uifBasis = Math.min(totalEarnings, uifCeiling);
  const uifEmployee = uifBasis * STATUTORY_RATES.UIF_EMPLOYEE;
  const uifEmployer = uifBasis * STATUTORY_RATES.UIF_EMPLOYER;

  let taxableIncome = Math.max(0, grossForTax - nssaEmployee - cappedPension);

  if (!pensionFundRegistered && pensionContribution > 0) {
    taxableIncome += pensionContribution;
  }

  const taxBase = annualBrackets ? taxableIncome * 12 : taxableIncome;

  let annualPaye = 0;
  for (const band of bands) {
    if (taxBase <= band.lower) break;
    const taxableInThisBand = Math.min(taxBase, band.upper) - band.lower;
    annualPaye += taxableInThisBand * band.rate;
  }

  let payeBeforeLevy = annualBrackets ? annualPaye / 12 : annualPaye;

  let taxDirectiveApplied = null;
  const directiveType = taxDirectiveType || 'REDUCTION';
  
  if (taxDirectiveAmt !== null && taxDirectiveAmt !== undefined && taxDirectiveAmt > 0) {
    if (directiveType === 'FIXED') {
      payeBeforeLevy = Math.max(0, payeBeforeLevy - taxDirectiveAmt);
      taxDirectiveApplied = `Fixed directive: -${taxDirectiveAmt}`;
    } else {
      payeBeforeLevy = Math.max(0, payeBeforeLevy - taxDirectiveAmt);
      taxDirectiveApplied = `Reduction directive: -${taxDirectiveAmt}`;
    }
  } else if (taxDirectivePerc !== null && taxDirectivePerc !== undefined && taxDirectivePerc > 0 && taxDirectivePerc < 100) {
    const directiveDeduction = payeBeforeLevy * (taxDirectivePerc / 100);
    payeBeforeLevy = Math.max(0, payeBeforeLevy - directiveDeduction);
    taxDirectiveApplied = `${taxDirectivePerc}% ${directiveType.toLowerCase()} directive: -${directiveDeduction.toFixed(2)}`;
  }

  const aidsLevy = calculateAidsLevy(payeBeforeLevy, employmentType, currency);

  const medicalAidCreditBase = medicalAid * STATUTORY_RATES.MEDICAL_AID_CREDIT_RATE;
  const medicalAidCreditCap = STATUTORY_RATES.MEDICAL_AID_CREDIT_ANNUAL_CAP / 12;
  const medicalAidCredit = Math.min(medicalAidCreditBase, medicalAidCreditCap);
  const totalPaye = Math.max(0, payeBeforeLevy + aidsLevy - medicalAidCredit - taxCredits);

  const totalDeductions = nssaEmployee + pensionContribution + medicalAid + totalPaye + uifEmployee;
  const netSalary = totalEarnings - totalDeductions;

  return {
    grossSalary: totalEarnings,
    taxableBenefits,
    exemptBonus,
    exemptSeverance,
    nssaEmployee,
    nssaEmployer,
    wcifEmployer,
    sdfContribution,
    uifEmployee,
    uifEmployer,
    taxableIncome,
    payeBeforeLevy,
    medicalAidCredit,
    aidsLevy,
    totalPaye,
    netSalary,
    taxDirectiveApplied,
  };
}

function calculateAidsLevy(payeBeforeLevy, employmentType, currency) {
  const threshold = currency === 'ZiG' 
    ? STATUTORY_RATES.AIDS_LEVY_EXEMPTION_THRESHOLD_ZIG 
    : STATUTORY_RATES.AIDS_LEVY_EXEMPTION_THRESHOLD_USD;
  
  if (payeBeforeLevy <= threshold) {
    return 0;
  }

  if (employmentType === 'CONTRACT' || employmentType === 'TEMPORARY') {
    const proportion = Math.max(0, (payeBeforeLevy - threshold) / payeBeforeLevy);
    return payeBeforeLevy * STATUTORY_RATES.AIDS_LEVY * proportion;
  }

  return payeBeforeLevy * STATUTORY_RATES.AIDS_LEVY;
}

function calculateLeaveTaxTreatment({
  leaveType,
  leaveDays,
  dailyRate,
  employmentType,
  statutoryDays = { MATERNITY: 98, SICK: 90 },
}) {
  const results = {
    MATERNITY: {
      first28DaysTaxable: true,
      remainingDaysTaxable: employmentType === 'CONTRACT',
      first28Days: Math.min(28, leaveDays) * dailyRate,
      remainingDays: Math.max(0, leaveDays - 28) * dailyRate,
      taxableAmount: 0,
      exemptAmount: 0,
    },
    SICK: {
      first30DaysTaxable: true,
      remainingDaysPartiallyExempt: true,
      fullPayDays: Math.min(30, leaveDays),
      halfPayDays: Math.max(0, leaveDays - 30),
      taxableAmount: 0,
      exemptAmount: 0,
    },
  };

  if (leaveType === 'MATERNITY') {
    const first28 = Math.min(28, leaveDays);
    const remaining = Math.max(0, leaveDays - 28);
    
    results.MATERNITY.taxableAmount = employmentType === 'CONTRACT' ? leaveDays * dailyRate : first28 * dailyRate;
    results.MATERNITY.exemptAmount = employmentType === 'CONTRACT' ? 0 : remaining * dailyRate;
  }

  if (leaveType === 'SICK') {
    const fullPayDays = Math.min(30, leaveDays);
    const halfPayDays = Math.max(0, leaveDays - 30);
    
    results.SICK.taxableAmount = fullPayDays * dailyRate + (halfPayDays * dailyRate * 0.5);
    results.SICK.exemptAmount = halfPayDays * dailyRate * 0.5;
  }

  return results[leaveType] || { taxableAmount: leaveDays * dailyRate, exemptAmount: 0 };
}

module.exports = {
  calculatePaye,
  loadStatutoryRates,
  getStatutoryRates: () => STATUTORY_RATES,
  DEFAULT_STATUTORY_RATES,
  USD_TAX_BANDS_2024,
  ZIG_TAX_BANDS_2024,
  calculateAidsLevy,
  calculateLeaveTaxTreatment,
};
