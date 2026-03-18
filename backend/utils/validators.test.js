import { describe, it, expect } from 'vitest';
const { validateTIN, validateNSSANumber, validateBankAccount, ZIMBABWE_TIN_FORMAT } = require('./validators');

describe('Zimbabwe Validators', () => {
  describe('TIN Validation', () => {
    it('should accept old format TIN (10 digits + letter)', () => {
      const result = validateTIN('1234567890A');
      expect(result.valid).toBe(true);
      expect(result.format).toBe('OLD_10_DIGIT_LETTER');
    });

    it('should accept new format TIN (XX-XXXXXXX-XX)', () => {
      const result = validateTIN('12-345678A01');
      expect(result.valid).toBe(true);
      expect(result.format).toBe('NEW_FORMAT');
    });

    it('should reject invalid TIN format', () => {
      const result = validateTIN('ABC123');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject plain 10-digit TIN without letter', () => {
      const result = validateTIN('1234567890');
      expect(result.valid).toBe(false);
    });

    it('should reject empty TIN', () => {
      const result = validateTIN('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TIN is required');
    });

    it('should trim and uppercase input', () => {
      const result = validateTIN('  12-345678A01  ');
      expect(result.valid).toBe(true);
      expect(result.tin).toBe('12-345678A01');
    });
  });

  describe('NSSA Number Validation', () => {
    it('should accept 6-digit NSSA number', () => {
      const result = validateNSSANumber('123456');
      expect(result.valid).toBe(true);
    });

    it('should accept ZW-prefixed NSSA number', () => {
      const result = validateNSSANumber('ZW123456');
      expect(result.valid).toBe(true);
      expect(result.nssaNumber).toBe('ZW123456');
    });

    it('should normalize non-prefixed to ZW prefix', () => {
      const result = validateNSSANumber('123456');
      expect(result.valid).toBe(true);
      expect(result.nssaNumber).toBe('ZW123456');
    });

    it('should reject invalid NSSA format', () => {
      const result = validateNSSANumber('ABC');
      expect(result.valid).toBe(false);
    });

    it('should reject empty NSSA number', () => {
      const result = validateNSSANumber('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NSSA number is required');
    });
  });

  describe('Bank Account Validation', () => {
    it('should accept valid account number', () => {
      const result = validateBankAccount('1234567890');
      expect(result.valid).toBe(true);
    });

    it('should accept alphanumeric account', () => {
      const result = validateBankAccount('ACC123456789');
      expect(result.valid).toBe(true);
    });

    it('should reject account number too short', () => {
      const result = validateBankAccount('12345');
      expect(result.valid).toBe(false);
    });

    it('should reject account number too long', () => {
      const result = validateBankAccount('123456789012345678901');
      expect(result.valid).toBe(false);
    });

    it('should reject special characters', () => {
      const result = validateBankAccount('1234-5678');
      expect(result.valid).toBe(false);
    });

    it('should reject empty account', () => {
      const result = validateBankAccount('');
      expect(result.valid).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = validateBankAccount('  1234567890  ');
      expect(result.valid).toBe(true);
    });
  });
});
