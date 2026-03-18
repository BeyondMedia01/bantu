import { describe, it, expect } from 'vitest';
const { 
  generateBankFile, 
  generateFidelityFile, 
  generateStanbicFile, 
  generateCBZFile, 
  generateZBFile,
  generateThirdPartyPayments 
} = require('./bankFile');

const mockPayrollRun = {
  id: 'run-123',
  startDate: new Date('2026-03-01'),
  currency: 'USD',
  dualCurrency: false,
  exchangeRate: 25,
};

const mockEmployees = [
  {
    id: 'emp-1',
    employeeCode: 'E001',
    firstName: 'John',
    lastName: 'Moyo',
    accountNumber: '1234567890',
    bankName: 'FIDELITY',
    bankBranch: 'HARARE',
    paymentMethod: 'BANK',
    splitUsdPercent: 0,
    idPassport: '12-345678-90-1',
    tin: '1234567890A',
  },
  {
    id: 'emp-2',
    employeeCode: 'E002',
    firstName: 'Mary',
    lastName: 'Ncube',
    accountNumber: '0987654321',
    bankName: 'STANBIC',
    bankBranch: 'BULAWAYO',
    paymentMethod: 'BANK',
    splitUsdPercent: 0,
    idPassport: '98-765432-10-2',
    tin: '9876543210B',
  },
];

const mockPayslips = [
  { employeeId: 'emp-1', netPay: 1500, netPayUSD: 1500, netPayZIG: null },
  { employeeId: 'emp-2', netPay: 2000, netPayUSD: 2000, netPayZIG: null },
];

const mockCompany = {
  registrationNumber: '12345/2023',
  name: 'Test Company Zimbabwe',
  taxId: 'TAX123456',
};

describe('Bank File Generation', () => {
  describe('Fidelity Bank File', () => {
    it('should generate Fidelity format with pipe delimiter', () => {
      const result = generateFidelityFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('|');
      expect(result).toContain('H');
      expect(result).toContain('D');
      expect(result).toContain('T');
    });

    it('should include batch number with unique identifier', () => {
      const result = generateFidelityFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('BATCH');
      expect(result).toContain('FDB');
    });

    it('should calculate correct total amount', () => {
      const result = generateFidelityFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('3500');
    });

    it('should include employee details', () => {
      const result = generateFidelityFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('Moyo');
      expect(result).toContain('Ncube');
    });

    it('should skip non-bank employees', () => {
      const cashEmployee = { ...mockEmployees[0], paymentMethod: 'CASH' };
      const result = generateFidelityFile(mockPayrollRun, mockPayslips, [cashEmployee], mockCompany);
      
      expect(result).not.toContain('Moyo');
    });
  });

  describe('Stanbic Bank File', () => {
    it('should generate Stanbic format with comma delimiter', () => {
      const result = generateStanbicFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain(',');
      expect(result).toContain('TOTAL');
    });

    it('should include company registration', () => {
      const result = generateStanbicFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('12345/2023');
    });
  });

  describe('CBZ Bank File', () => {
    it('should generate CBZ format with header and trailer', () => {
      const result = generateCBZFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('CBZHEADER');
      expect(result).toContain('CBZTRAILER');
    });

    it('should include employee bank details', () => {
      const result = generateCBZFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('1234567890');
    });
  });

  describe('ZB Bank File', () => {
    it('should generate ZB format with totals trailer', () => {
      const result = generateZBFile(mockPayrollRun, mockPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('TOTALS');
      expect(result).toContain('3500.00');
    });
  });

  describe('Dual Currency Handling', () => {
    const dualPayrollRun = { ...mockPayrollRun, currency: 'ZiG', dualCurrency: true };
    const dualPayslips = [
      { employeeId: 'emp-1', netPay: 37500, netPayUSD: 1500, netPayZIG: 37500 },
      { employeeId: 'emp-2', netPay: 50000, netPayUSD: 2000, netPayZIG: 50000 },
    ];

    it('should use ZiG amount for ZiG currency', () => {
      const result = generateFidelityFile(dualPayrollRun, dualPayslips, mockEmployees, mockCompany);
      
      expect(result).toContain('87500');
    });

    it('should handle mixed USD/ZiG employees', () => {
      const empWithSplit = [
        ...mockEmployees,
        { ...mockEmployees[0], id: 'emp-3', splitUsdPercent: 50 },
      ];
      const payslipWithSplit = [
        ...dualPayslips,
        { employeeId: 'emp-3', netPay: 25000, netPayUSD: 1000, netPayZIG: 25000 },
      ];
      
      const result = generateFidelityFile(dualPayrollRun, payslipWithSplit, empWithSplit, mockCompany);
      
      expect(result).toContain('SALARY');
    });
  });

  describe('Third Party Payments', () => {
    it('should generate NSSA contribution line', () => {
      const totals = {
        nssaEmployee: 157.5,
        nssaEmployer: 157.5,
        paye: 711.22,
        necLevy: 50,
        aidsLevy: 21.34,
        wcifEmployer: 17.5,
        sdfContribution: 17.5,
        uifEmployee: 7,
        uifEmployer: 7,
      };

      const result = generateThirdPartyPayments(mockPayrollRun, totals, mockCompany);

      expect(result).toContain('NSSA');
      expect(result).toContain('157.50');
    });

    it('should generate PAYE line', () => {
      const totals = {
        nssaEmployee: 0,
        nssaEmployer: 0,
        paye: 711.22,
        necLevy: 0,
        aidsLevy: 0,
        wcifEmployer: 0,
        sdfContribution: 0,
        uifEmployee: 0,
        uifEmployer: 0,
      };

      const result = generateThirdPartyPayments(mockPayrollRun, totals, mockCompany);

      expect(result).toContain('ZIMRA_PAYE');
      expect(result).toContain('711.22');
    });

    it('should include WCIF contribution', () => {
      const totals = {
        nssaEmployee: 0,
        nssaEmployer: 0,
        paye: 0,
        necLevy: 0,
        aidsLevy: 0,
        wcifEmployer: 17.5,
        sdfContribution: 0,
        uifEmployee: 0,
        uifEmployer: 0,
      };

      const result = generateThirdPartyPayments(mockPayrollRun, totals, mockCompany);

      expect(result).toContain('WCIF');
      expect(result).toContain('WORKERS_COMPENSATION_INSURANCE_FUND');
    });

    it('should include SDF contribution', () => {
      const totals = {
        nssaEmployee: 0,
        nssaEmployer: 0,
        paye: 0,
        necLevy: 0,
        aidsLevy: 0,
        wcifEmployer: 0,
        sdfContribution: 17.5,
        uifEmployee: 0,
        uifEmployer: 0,
      };

      const result = generateThirdPartyPayments(mockPayrollRun, totals, mockCompany);

      expect(result).toContain('SDF');
      expect(result).toContain('SKILLS_DEVELOPMENT_LEVY');
    });

    it('should include UIF contribution', () => {
      const totals = {
        nssaEmployee: 0,
        nssaEmployer: 0,
        paye: 0,
        necLevy: 0,
        aidsLevy: 0,
        wcifEmployer: 0,
        sdfContribution: 0,
        uifEmployee: 7,
        uifEmployer: 7,
      };

      const result = generateThirdPartyPayments(mockPayrollRun, totals, mockCompany);

      expect(result).toContain('UIF');
      expect(result).toContain('UNEMPLOYMENT_INSURANCE_FUND');
    });

    it('should include NEC Levy', () => {
      const totals = {
        nssaEmployee: 0,
        nssaEmployer: 0,
        paye: 0,
        necLevy: 50,
        aidsLevy: 0,
        wcifEmployer: 0,
        sdfContribution: 0,
        uifEmployee: 0,
        uifEmployer: 0,
      };

      const result = generateThirdPartyPayments(mockPayrollRun, totals, mockCompany);

      expect(result).toContain('NEC_LEVY');
    });
  });
});
