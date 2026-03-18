import { describe, it, expect, vi, beforeEach } from 'vitest';
const { calculatePaye, calculateAidsLevy, DEFAULT_STATUTORY_RATES } = require('./taxEngine');

describe('Tax Engine - Zimbabwe PAYE Compliance', () => {
  describe('USD Tax Calculations', () => {
    it('should calculate zero PAYE for income below threshold', () => {
      const result = calculatePaye({ baseSalary: 80, currency: 'USD' });
      expect(result.totalPaye).toBe(0);
      expect(result.aidsLevy).toBe(0);
    });

    it('should calculate correct PAYE for income $1500 USD', () => {
      const result = calculatePaye({ baseSalary: 1500, currency: 'USD' });
      expect(result.payeBeforeLevy).toBeCloseTo(355.55, 2);
      expect(result.nssaEmployee).toBeCloseTo(31.5, 2);
    });

    it('should apply NSSA ceiling correctly', () => {
      const result = calculatePaye({ baseSalary: 5000, currency: 'USD' });
      expect(result.nssaEmployee).toBe(DEFAULT_STATUTORY_RATES.NSSA_EMPLOYEE * 700);
    });
  });

  describe('ZiG Tax Calculations', () => {
    it('should calculate PAYE for ZiG currency', () => {
      const result = calculatePaye({ baseSalary: 50000, currency: 'ZiG' });
      expect(result.grossSalary).toBe(50000);
      expect(result.nssaEmployee).toBeGreaterThan(0);
    });

    it('should use ZiG NSSA ceiling', () => {
      const result = calculatePaye({ baseSalary: 100000, currency: 'ZiG' });
      expect(result.nssaEmployee).toBe(DEFAULT_STATUTORY_RATES.NSSA_EMPLOYEE * 7000);
    });
  });

  describe('UIF Calculations', () => {
    it('should calculate UIF with ceiling', () => {
      const result = calculatePaye({ baseSalary: 500, currency: 'USD' });
      expect(result.uifEmployee).toBe(DEFAULT_STATUTORY_RATES.UIF_CEILING_USD * DEFAULT_STATUTORY_RATES.UIF_EMPLOYEE);
    });

    it('should not exceed UIF ceiling', () => {
      const result = calculatePaye({ baseSalary: 10000, currency: 'USD' });
      expect(result.uifEmployee).toBe(DEFAULT_STATUTORY_RATES.UIF_CEILING_USD * DEFAULT_STATUTORY_RATES.UIF_EMPLOYEE);
    });
  });

  describe('AIDS Levy', () => {
    it('should exempt AIDS levy below threshold (USD)', () => {
      const result = calculatePaye({ baseSalary: 400, currency: 'USD' });
      expect(result.aidsLevy).toBe(0);
    });

    it('should apply AIDS levy above threshold (USD)', () => {
      const result = calculatePaye({ baseSalary: 3000, currency: 'USD' });
      expect(result.aidsLevy).toBeGreaterThan(0);
    });

    it('should exempt AIDS levy below threshold (ZiG)', () => {
      const result = calculatePaye({ baseSalary: 15000, currency: 'ZiG' });
      expect(result.aidsLevy).toBe(0);
    });

    it('should apply AIDS levy above threshold (ZiG)', () => {
      const result = calculatePaye({ baseSalary: 90000, currency: 'ZiG' });
      expect(result.aidsLevy).toBeGreaterThan(0);
    });
  });

  describe('Medical Aid Credit', () => {
    it('should apply medical aid credit', () => {
      const result = calculatePaye({ baseSalary: 2000, currency: 'USD', medicalAid: 100 });
      expect(result.medicalAidCredit).toBeGreaterThan(0);
    });

    it('should cap medical aid credit at monthly limit', () => {
      const result = calculatePaye({ baseSalary: 2000, currency: 'USD', medicalAid: 200 });
      expect(result.medicalAidCredit).toBe(50);
    });
  });

  describe('Leave Tax Treatment', () => {
    it('should handle non-taxable sick leave', () => {
      const result = calculatePaye({
        baseSalary: 1000,
        currency: 'USD',
        sickLeaveTaxable: false,
        sickLeaveAmount: 100,
      });
      expect(result.grossSalary).toBeLessThan(1000);
    });

    it('should apply partial exemption for maternity leave', () => {
      const result = calculatePaye({
        baseSalary: 5000,
        currency: 'USD',
        maternityLeaveTaxable: false,
        maternityLeaveAmount: 2000,
      });
      expect(result.grossSalary).toBeLessThan(7000);
    });
  });

  describe('Tax Directive Handling', () => {
    it('should apply REDUCTION directive correctly', () => {
      const baseResult = calculatePaye({ baseSalary: 2000, currency: 'USD' });
      const result = calculatePaye({
        baseSalary: 2000,
        currency: 'USD',
        taxDirectiveType: 'REDUCTION',
        taxDirectiveAmt: 50,
      });
      expect(result.totalPaye).toBeLessThan(baseResult.totalPaye);
      expect(result.taxDirectiveApplied).toBeTruthy();
    });

    it('should apply FIXED directive correctly', () => {
      const baseResult = calculatePaye({ baseSalary: 2000, currency: 'USD' });
      const result = calculatePaye({
        baseSalary: 2000,
        currency: 'USD',
        taxDirectiveType: 'FIXED',
        taxDirectiveAmt: 50,
      });
      expect(result.totalPaye).toBeLessThan(baseResult.totalPaye);
      expect(result.taxDirectiveApplied).toBeTruthy();
    });

    it('should apply percentage directive correctly', () => {
      const result = calculatePaye({
        baseSalary: 2000,
        currency: 'USD',
        taxDirectiveType: 'REDUCTION',
        taxDirectivePerc: 10,
      });
      expect(result.taxDirectiveApplied).toContain('10%');
    });
  });

  describe('Leave Tax Treatment', () => {
    it('should handle non-taxable sick leave', () => {
      const result = calculatePaye({
        baseSalary: 1000,
        currency: 'USD',
        sickLeaveTaxable: false,
        sickLeaveAmount: 100,
      });
      expect(result.grossSalary).toBeLessThan(1000);
    });

    it('should handle non-taxable maternity leave', () => {
      const result = calculatePaye({
        baseSalary: 2000,
        currency: 'USD',
        maternityLeaveTaxable: false,
        maternityLeaveAmount: 5000,
      });
      expect(result.grossSalary).toBeLessThan(7000);
    });
  });

  describe('Dual Currency Totals', () => {
    it('should return all required fields', () => {
      const result = calculatePaye({
        baseSalary: 1500,
        currency: 'USD',
        motorVehicleBenefit: 200,
        overtimeAmount: 100,
        bonus: 500,
      });

      expect(result).toHaveProperty('grossSalary');
      expect(result).toHaveProperty('nssaEmployee');
      expect(result).toHaveProperty('nssaEmployer');
      expect(result).toHaveProperty('uifEmployee');
      expect(result).toHaveProperty('uifEmployer');
      expect(result).toHaveProperty('wcifEmployer');
      expect(result).toHaveProperty('sdfContribution');
      expect(result).toHaveProperty('payeBeforeLevy');
      expect(result).toHaveProperty('aidsLevy');
      expect(result).toHaveProperty('totalPaye');
      expect(result).toHaveProperty('netSalary');
    });
  });
});
