const prisma = require('../lib/prisma');

const ZIMRA_FILE_TYPE_CODES = {
  AGRICULTURAL: 'PAYE01A',
  MINING: 'PAYE01B',
  MANUFACTURING: 'PAYE01C',
  SERVICES: 'PAYE01D',
  COMMERCE: 'PAYE01E',
  CONSTRUCTION: 'PAYE01F',
  TRANSPORT: 'PAYE01G',
  GOVERNMENT: 'PAYE01H',
  EDUCATION: 'PAYE01I',
  HEALTH: 'PAYE01J',
  OTHER: 'PAYE01Z',
};

const ZIMRA_TRANSACTION_CODES = {
  PAYE: '101',
  AIDS_LEVY: '102',
  NSSA_EMPLOYEE: '201',
  NSSA_EMPLOYER: '202',
  PENSION: '301',
  MEDICAL_AID: '401',
  NEC_LEVY: '501',
};

function getEmployerCategoryCode(industryCode) {
  return ZIMRA_FILE_TYPE_CODES[industryCode?.toUpperCase()] || ZIMRA_FILE_TYPE_CODES.OTHER;
}

function generateZIMRAFile(payrollRuns, company, options = {}) {
  const lines = [];
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  const fileTypeCode = getEmployerCategoryCode(company.industryCode || company.industry);
  const employerTin = company.taxId || company.registrationNumber || '';

  lines.push([
    'HDR',
    employerTin,
    company.registrationNumber || '',
    fileTypeCode,
    today,
    'BANTU',
    '1.0',
    company.nssaRegistrationNumber || '',
    company.efilingCredentials || '',
  ].join('|'));

  for (const run of payrollRuns) {
    const periodMonth = run.startDate.toISOString().slice(0, 7).replace('-', '');
    
    for (const transaction of run.transactions) {
      const emp = transaction.employee;
      const amount = transaction.amount;
      
      if (!transaction.transactionCode.affectsPaye) continue;
      
      const isEarning = transaction.transactionCode.category === 'EARNING';
      const transactionCode = getZIMRAStandardCode(transaction.transactionCode.code);
      
      lines.push([
        'EMP',
        emp.tin || emp.idPassport || emp.socialSecurityNum || '',
        (emp.firstName || '').substring(0, 20),
        (emp.lastName || '').substring(0, 30),
        periodMonth,
        isEarning ? '1' : '2',
        transactionCode,
        Math.round(amount * 100) / 100,
        transaction.transactionCode.taxable ? 'Y' : 'N',
        employerTin,
        emp.gender || '',
        emp.dateOfBirth ? new Date(emp.dateOfBirth).toISOString().split('T')[0] : '',
      ].join('|'));
    }
  }

  const totalRecords = lines.length - 1;
  lines.push([
    'TRL',
    totalRecords.toString().padStart(10, '0'),
    calculateChecksum(lines),
  ].join('|'));

  return lines.join('\n');
}

function getZIMRAStandardCode(systemCode) {
  const codeMap = {
    'PAYE': '101',
    'AIDS_LEVY': '102',
    'NSSA_EMP': '201',
    'NSSA': '201',
    'NSSA_EMPLOYER': '202',
    'PENSION': '301',
    'MEDICAL_AID': '401',
    'MEDICAL': '401',
    'NEC_LEVY': '501',
    'NEC': '501',
  };
  return codeMap[systemCode?.toUpperCase()] || systemCode || '999';
}

function calculateChecksum(lines) {
  let sum = 0;
  for (const line of lines) {
    for (const char of line) {
      sum += char.charCodeAt(0);
    }
  }
  return (sum % 1000000).toString().padStart(6, '0');
}

function generateNSAFile(payrollRuns, company, client, nssaCeiling = 700) {
  const lines = [];
  const today = new Date().toISOString().split('T')[0];
  
  lines.push([
    'HEADER',
    company.registrationNumber || '',
    company.nssaRegistrationNumber || '',
    company.taxId || '',
    (client.name || '').substring(0, 40),
    today,
    'MONTHLY',
    payrollRuns[0]?.startDate.toISOString().slice(0, 7).replace('-', '') || '',
    company.industryCode || 'GEN',
  ].join('|'));

  const employeeMap = new Map();
  
  for (const run of payrollRuns) {
    for (const transaction of run.transactions) {
      const emp = transaction.employee;
      const empKey = emp.id;
      
      if (!employeeMap.has(empKey)) {
        employeeMap.set(empKey, {
          employee: emp,
          pensionableEarnings: 0,
          nssaEmployee: 0,
          nssaEmployer: 0,
        });
      }
      
      const data = employeeMap.get(empKey);
      
      if (transaction.transactionCode.affectsNssa && transaction.transactionCode.category === 'EARNING') {
        data.pensionableEarnings += transaction.amount;
      }
      
      if (transaction.transactionCode.code === 'NSSA_EMP' || transaction.transactionCode.code === 'NSSA') {
        data.nssaEmployee = transaction.amount;
      }
      if (transaction.transactionCode.code === 'NSSA_EMPLOYER') {
        data.nssaEmployer = transaction.amount;
      }
    }
  }

  let totalGross = 0;
  let totalEmployeeNssa = 0;
  let totalEmployerNssa = 0;
  
  for (const [_, data] of employeeMap) {
    const cappedPensionable = Math.min(data.pensionableEarnings, nssaCeiling);
    const empNssaCalc = Math.min(cappedPensionable * 0.045, nssaCeiling * 0.045);
    
    if (data.nssaEmployee === 0) {
      data.nssaEmployee = Math.round(empNssaCalc * 100) / 100;
    }
    if (data.nssaEmployer === 0) {
      data.nssaEmployer = Math.round(empNssaCalc * 100) / 100;
    }
    
    totalGross += data.pensionableEarnings;
    totalEmployeeNssa += data.nssaEmployee;
    totalEmployerNssa += data.nssaEmployer;
  }

  for (const [_, data] of employeeMap) {
    const emp = data.employee;
    lines.push([
      emp.socialSecurityNum || emp.nssaNumber || emp.idPassport || emp.id.slice(0, 8),
      (emp.firstName || '').substring(0, 20),
      (emp.lastName || '').substring(0, 20),
      emp.gender || '',
      emp.dateOfBirth ? new Date(emp.dateOfBirth).toISOString().split('T')[0] : '',
      emp.idPassport || '',
      Math.round(data.pensionableEarnings * 100) / 100,
      Math.round(Math.min(data.pensionableEarnings, nssaCeiling) * 100) / 100,
      Math.round(data.nssaEmployee * 100) / 100,
      Math.round(data.nssaEmployer * 100) / 100,
      Math.round((data.nssaEmployee + data.nssaEmployer) * 100) / 100,
    ].join('|'));
  }

  lines.push([
    'SUMMARY',
    employeeMap.size.toString().padStart(6, '0'),
    Math.round(totalGross * 100) / 100,
    Math.round(totalEmployeeNssa * 100) / 100,
    Math.round(totalEmployerNssa * 100) / 100,
    Math.round((totalEmployeeNssa + totalEmployerNssa) * 100) / 100,
  ].join('|'));

  return lines.join('\n');
}

function generateNECFile(payrollRuns, company, client) {
  const lines = [];
  const today = new Date().toISOString().split('T')[0];
  
  lines.push([
    'NEC',
    company.registrationNumber || '',
    company.nssaRegistrationNumber || '',
    (client.name || '').substring(0, 40),
    today,
    payrollRuns[0]?.startDate.toISOString().slice(0, 7).replace('-', '') || '',
  ].join('|'));

  const employeeMap = new Map();
  
  for (const run of payrollRuns) {
    for (const transaction of run.transactions) {
      const emp = transaction.employee;
      const empKey = emp.id;
      
      if (!employeeMap.has(empKey)) {
        employeeMap.set(empKey, {
          employee: emp,
          necLevy: 0,
        });
      }
      
      if (transaction.transactionCode.affectsNec || transaction.transactionCode.code?.toUpperCase().includes('NEC')) {
        employeeMap.get(empKey).necLevy += transaction.amount;
      }
    }
  }

  let totalNecLevy = 0;
  
  for (const [_, data] of employeeMap) {
    const emp = data.employee;
    lines.push([
      emp.tin || emp.idPassport || '',
      (emp.firstName || '').substring(0, 20),
      (emp.lastName || '').substring(0, 20),
      emp.necGrade?.gradeCode || '',
      Math.round(data.necLevy * 100) / 100,
    ].join('|'));
    totalNecLevy += data.necLevy;
  }

  lines.push([
    'SUMMARY',
    employeeMap.size.toString().padStart(6, '0'),
    Math.round(totalNecLevy * 100) / 100,
  ].join('|'));

  return lines.join('\n');
}

function generateP4AFile(employees, company, year) {
  const lines = [];
  
  lines.push([
    'P4A',
    company.registrationNumber || '',
    company.nssaRegistrationNumber || '',
    (company.name || '').substring(0, 40),
    year.toString(),
    new Date().toISOString().split('T')[0],
  ].join('|'));

  for (const emp of employees) {
    const annualGross = emp.annualGross || 0;
    const annualTax = emp.annualTax || 0;
    
    lines.push([
      emp.socialSecurityNum || emp.nssaNumber || emp.tin || emp.idPassport || emp.id.slice(0, 8),
      (emp.firstName || '').substring(0, 20),
      (emp.lastName || '').substring(0, 20),
      Math.round(annualGross * 100) / 100,
      Math.round(annualTax * 100) / 100,
      year,
    ].join('|'));
  }

  return lines.join('\n');
}

function generatePSL8(employee, taxData, company) {
  const lines = [];
  const today = new Date().toISOString().split('T')[0];
  
  lines.push([
    'PSL8_APP',
    company.registrationNumber || '',
    company.taxId || '',
    'BANTU Payroll System v1.0',
    today,
    'DRAFT',
  ].join('|'));

  lines.push([
    employee.tin || employee.idPassport || '',
    (employee.firstName || '').substring(0, 30),
    (employee.lastName || '').substring(0, 30),
    (employee.homeAddress || '').substring(0, 100),
    employee.occupation || '',
    employee.employmentType || 'PERMANENT',
    taxData.periodFrom || '',
    taxData.periodTo || '',
    Math.round((taxData.annualGross || 0) * 100) / 100,
    Math.round((taxData.annualTax || 0) * 100) / 100,
    taxData.certificateNumber || 'PENDING_APPLICATION',
    taxData.dateIssued || '',
  ].join('|'));

  return lines.join('\n');
}

function generateITFCertificate(employee, yearData, company) {
  const lines = [];
  const today = new Date().toISOString().split('T')[0];
  
  lines.push([
    'ITF',
    company.registrationNumber || '',
    company.taxId || '',
    company.name || '',
    company.nssaRegistrationNumber || '',
    company.industryCode || '',
    company.industry || '',
    company.address || '',
    company.contactEmail || '',
    company.contactPhone || '',
    'BANTU Payroll System v1.0',
    today,
  ].join('|'));

  lines.push([
    employee.tin || '',
    employee.idPassport || '',
    (employee.firstName || '').substring(0, 30),
    (employee.lastName || '').substring(0, 30),
    yearData.year.toString(),
    Math.round((yearData.annualGross || 0) * 100) / 100,
    Math.round((yearData.annualPaye || 0) * 100) / 100,
    Math.round((yearData.annualAidsLevy || 0) * 100) / 100,
    Math.round((yearData.annualNssa || 0) * 100) / 100,
    Math.round((yearData.annualPension || 0) * 100) / 100,
    Math.round((yearData.totalEarnings || 0) * 100) / 100,
    employee.startDate ? new Date(employee.startDate).toISOString().split('T')[0] : '',
    employee.dischargeDate ? new Date(employee.dischargeDate).toISOString().split('T')[0] : '',
    employee.employmentType || 'PERMANENT',
  ].join('|'));

  return lines.join('\n');
}

module.exports = {
  generateZIMRAFile,
  generateNSAFile,
  generateNECFile,
  generateP4AFile,
  generatePSL8,
  generateITFCertificate,
  ZIMRA_FILE_TYPE_CODES,
  ZIMRA_TRANSACTION_CODES,
  getEmployerCategoryCode,
};
