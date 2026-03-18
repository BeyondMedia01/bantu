/**
 * Zimbabwean PAYE Calculation Engine (FDS)
 * Final Deduction System implementation based on ZIMRA guidelines.
 */

const DEFAULT_STATUTORY_RATES = {
  AIDS_LEVY: 0.03,
  NSSA_EMPLOYEE: 0.045,
  NSSA_EMPLOYER: 0.045,
  MEDICAL_AID_CREDIT_RATE: 0.50,
};

let STATUTORY_RATES = { ...DEFAULT_STATUTORY_RATES };

/**
 * Load statutory rates from SystemSettings
 * Call this on server startup and after settings changes
 */
async function loadStatutoryRates(prisma) {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        settingName: {
          in: ['AIDS_LEVY_RATE', 'NSSA_EMPLOYEE_RATE', 'NSSA_EMPLOYER_RATE', 'NSSA_CEILING_USD', 'PENSION_CAP_RATE'],
        },
        isActive: true,
      },
    });
    
    const rates = {};
    for (const s of settings) {
      if (s.settingName === 'AIDS_LEVY_RATE') rates.AIDS_LEVY = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'NSSA_EMPLOYEE_RATE') rates.NSSA_EMPLOYEE = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'NSSA_EMPLOYER_RATE') rates.NSSA_EMPLOYER = parseFloat(s.settingValue) / 100;
      if (s.settingName === 'NSSA_CEILING_USD') rates.NSSA_CEILING = parseFloat(s.settingValue);
      if (s.settingName === 'PENSION_CAP_RATE') rates.PENSION_CAP = parseFloat(s.settingValue) / 100;
    }
    
    if (Object.keys(rates).length > 0) {
      STATUTORY_RATES = { ...DEFAULT_STATUTORY_RATES, ...rates };
      console.log('Statutory rates loaded from settings:', STATUTORY_RATES);
    }
  } catch (err) {
    console.error('Failed to load statutory rates from settings:', err.message);
  }
}

module.exports = {
  calculatePaye,
  loadStatutoryRates,
  DEFAULT_STATUTORY_RATES,
  getStatutoryRates: () => STATUTORY_RATES,
};

// 2024 USD Tax Bands (Monthly) — used as fallback when no DB bands are provided

// 2024 USD Tax Bands (Monthly) — used as fallback when no DB bands are provided
const USD_TAX_BANDS_2024 = [
  { lower: 0,    upper: 100,      rate: 0,    fixed: 0 },
  { lower: 100,  upper: 300,      rate: 0.20, fixed: 0 },
  { lower: 300,  upper: 1000,     rate: 0.25, fixed: 40 },
  { lower: 1000, upper: 2000,     rate: 0.30, fixed: 215 },
  { lower: 2000, upper: 3000,     rate: 0.35, fixed: 515 },
  { lower: 3000, upper: Infinity, rate: 0.40, fixed: 865 },
];

// 2024 ZiG Tax Bands (Monthly) — used as fallback
const ZIG_TAX_BANDS_2024 = [
  { lower: 0,     upper: 2800,     rate: 0,    fixed: 0 },
  { lower: 2800,  upper: 8400,     rate: 0.20, fixed: 0 },
  { lower: 8400,  upper: 28000,    rate: 0.25, fixed: 1120 },
  { lower: 28000, upper: 56000,    rate: 0.30, fixed: 6020 },
  { lower: 56000, upper: 84000,    rate: 0.35, fixed: 14420 },
  { lower: 84000, upper: Infinity, rate: 0.40, fixed: 24220 },
];

const DEFAULT_NSSA_CEILING = { USD: 700, ZiG: 20000 };

/**
 * Normalise DB TaxBracket records into the internal band format.
 * DB records: { lowerBound, upperBound, rate, fixedAmount }
 */
const normaliseBrackets = (brackets) =>
  brackets
    .sort((a, b) => a.lowerBound - b.lowerBound)
    .map((b) => ({
      lower: b.lowerBound,
      upper: b.upperBound ?? Infinity,
      rate: b.rate,
      fixed: b.fixedAmount ?? 0,
    }));

/**
 * Calculates PAYE for a given monthly gross salary.
 *
 * @param {Object} params
 * @param {number}   params.baseSalary
 * @param {string}   params.currency              "USD" | "ZiG"
 * @param {number}   [params.taxableBenefits]      Other non-cash benefits (e.g. housing)
 * @param {number}   [params.motorVehicleBenefit]  Annual deemed value ÷ 12 — added to taxable income per ZIMRA FDS
 * @param {number}   [params.overtimeAmount]
 * @param {number}   [params.bonus]
 * @param {number}   [params.bonusExemption]       Tax-free bonus threshold per ZIMRA. Exempt portion excluded from
 *                                                  PAYE but NSSA is still calculated on full cash earnings.
 * @param {number}   [params.severanceAmount]      Retrenchment / severance pay — included in cash earnings; the
 *                                                  exempt portion (up to severanceExemption) is excluded from PAYE.
 * @param {number}   [params.severanceExemption]   ZIMRA-prescribed tax-free threshold for retrenchment packages.
 * @param {number}   [params.pensionContribution]
 * @param {number}   [params.medicalAid]
 * @param {number}   [params.taxCredits]
 * @param {number}   [params.wcifRate]             Workers Compensation Insurance Fund rate — employer-only, per
 *                                                  industry classification; does NOT reduce employee net pay.
 * @param {number}   [params.sdfRate]              Standard Development Fund / Manpower Training Levy rate —
 *                                                  employer-only (typically 1%); does NOT reduce employee net pay.
 * @param {Array}    [params.taxBrackets]          DB TaxBracket[] — overrides built-in bands when provided
 * @param {boolean}  [params.annualBrackets]        true when DB brackets are annual (FDS). Monthly income is
 *                                                  annualised (×12), tax computed against annual bands, result
 *                                                  divided by 12. Hardcoded fallback bands are already monthly.
 * @param {number}   [params.nssaCeiling]          Override NSSA ceiling from DB/SystemSettings
 */
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
}) {
  // Resolve tax bands: prefer DB brackets, fall back to hardcoded monthly 2024 bands
  let bands;
  if (taxBrackets && taxBrackets.length > 0) {
    bands = normaliseBrackets(taxBrackets);
  } else {
    bands = currency === 'USD' ? USD_TAX_BANDS_2024 : ZIG_TAX_BANDS_2024;
  }

  const ceiling = nssaCeiling ?? DEFAULT_NSSA_CEILING[currency] ?? 700;

  // Full cash earnings — all cash components, including full severance and bonus.
  // NSSA is applied to the full amount (capped at ceiling) per ZIMRA guidance.
  const cashEarnings = baseSalary + overtimeAmount + bonus + severanceAmount;

  // Exempt portions reduce the PAYE base but NOT the NSSA base.
  const exemptBonus     = Math.min(bonus, bonusExemption);
  const exemptSeverance = Math.min(severanceAmount, severanceExemption);

  // Motor vehicle benefit: deemed fringe benefit — taxable but excluded from NSSA.
  const grossForTax = cashEarnings + taxableBenefits + motorVehicleBenefit
                      - exemptBonus - exemptSeverance;

  const nssaBasis    = Math.min(cashEarnings, ceiling);
  const nssaEmployee = nssaBasis * STATUTORY_RATES.NSSA_EMPLOYEE;
  const nssaEmployer = nssaBasis * STATUTORY_RATES.NSSA_EMPLOYER;

  // Employer-only statutory contributions — do NOT reduce employee net pay.
  const wcifEmployer = cashEarnings * wcifRate;
  const sdfContribution = cashEarnings * sdfRate;

  const taxableIncome = Math.max(0, grossForTax - nssaEmployee - pensionContribution);

  // FDS: annualise monthly taxable income, apply annual brackets, then divide by 12
  const taxBase = annualBrackets ? taxableIncome * 12 : taxableIncome;

  let annualPaye = 0;
  for (const band of bands) {
    if (taxBase <= band.lower) break;
    const taxableInThisBand = Math.min(taxBase, band.upper) - band.lower;
    annualPaye += taxableInThisBand * band.rate;
  }

  const payeBeforeLevy = annualBrackets ? annualPaye / 12 : annualPaye;

  const aidsLevy         = payeBeforeLevy * STATUTORY_RATES.AIDS_LEVY;
  const medicalAidCredit = medicalAid * STATUTORY_RATES.MEDICAL_AID_CREDIT_RATE;
  const totalPaye        = Math.max(0, payeBeforeLevy + aidsLevy - medicalAidCredit - taxCredits);

  const totalDeductions = nssaEmployee + pensionContribution + medicalAid + totalPaye;
  const netSalary       = cashEarnings - totalDeductions;

  return {
    grossSalary: cashEarnings,
    taxableBenefits,
    exemptBonus,
    exemptSeverance,
    nssaEmployee,
    nssaEmployer,
    wcifEmployer,
    sdfContribution,
    taxableIncome,
    payeBeforeLevy,
    medicalAidCredit,
    aidsLevy,
    totalPaye,
    netSalary,
  };
}

module.exports = { calculatePaye, loadStatutoryRates, getStatutoryRates: () => STATUTORY_RATES, DEFAULT_STATUTORY_RATES, USD_TAX_BANDS_2024, ZIG_TAX_BANDS_2024 };
