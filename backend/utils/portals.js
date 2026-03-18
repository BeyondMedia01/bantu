const prisma = require('../lib/prisma');

// ZIMRA e-Taxes Monthly Employee File Format
// Standard: CSV with pipe delimiter
// Fields per employee per month

function generateZIMRAFile(payrollRuns, company) {
  const lines = [];
  
  // Header record (Type = 'HDR')
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  lines.push([
    'HDR',                              // Record Type
    company.registrationNumber || '',   // Employer TIN
    company.taxId || '',               // Employer Tax ID
    'PAYE01',                          // File Type Code
    today,                             // Generation Date
    'BANTU',                           // Software Name
    '1.0',                             // Software Version
  ].join('|'));

  // Employee records
  for (const run of payrollRuns) {
    const periodMonth = run.startDate.toISOString().slice(0, 7).replace('-', '');
    
    for (const transaction of run.transactions) {
      const emp = transaction.employee;
      const amount = transaction.amount;
      
      // Only include taxable transactions
      if (!transaction.transactionCode.affectsPaye) continue;
      
      const isEarning = transaction.transactionCode.category === 'EARNING';
      
      lines.push([
        'EMP',                                    // Record Type
        emp.tin || emp.idPassport || '',        // Employee TIN/ID
        emp.firstName.substring(0, 20),         // First Name
        emp.lastName.substring(0, 30),           // Surname
        periodMonth,                             // Period (YYYYMM)
        isEarning ? '1' : '2',                   // Transaction Type (1=Earning, 2=Deduction)
        transaction.transactionCode.code,        // Transaction Code
        Math.round(amount * 100) / 100,          // Amount (2 decimals)
        transaction.transactionCode.taxable ? 'Y' : 'N',  // Taxable?
        company.registrationNumber || '',       // Employer TIN
      ].join('|'));
    }
  }

  // Trailer record (Type = 'TRL')
  const totalRecords = lines.length - 1; // Exclude header
  lines.push([
    'TRL',
    totalRecords.toString().padStart(10, '0'),  // Total Records
    '000001',                                    // Checksum (placeholder)
  ].join('|'));

  return lines.join('\n');
}

// NSSA Monthly Contribution File Format
// Standard: CSV with comma delimiter
// Required for NSSA e-filing portal

function generateNSAFile(payrollRuns, company, client) {
  const lines = [];
  
  // Header: Employer Details
  lines.push([
    'HEADER',
    company.registrationNumber || '',     // Employer Registration Number
    company.taxId || '',                   // Tax ID
    client.name.substring(0, 40),          // Employer Name
    new Date().toISOString().split('T')[0], // Return Date
    'MONTHLY',                              // Return Type
    payrollRuns[0]?.startDate.toISOString().slice(0, 7).replace('-', '') || '', // Period
  ].join(','));

  // Employee Contributions
  const employeeMap = new Map();
  
  for (const run of payrollRuns) {
    for (const transaction of run.transactions) {
      const emp = transaction.employee;
      const empKey = emp.id;
      
      if (!employeeMap.has(empKey)) {
        employeeMap.set(empKey, {
          employee: emp,
          grossEarnings: 0,
          nssaEmployee: 0,
          nssaEmployer: 0,
        });
      }
      
      const data = employeeMap.get(empKey);
      
      // Add to gross if taxable
      if (transaction.transactionCode.taxable && transaction.transactionCode.category === 'EARNING') {
        data.grossEarnings += transaction.amount;
      }
      
      // NSSA employee contribution (4.5% of gross, capped)
      if (transaction.transactionCode.affectsNssa) {
        data.nssaEmployee += transaction.amount * 0.045;
      }
    }
  }

  // Calculate employer contributions (4.5% of total gross)
  let totalGross = 0;
  let totalEmployeeNssa = 0;
  let totalEmployerNssa = 0;
  
  for (const [_, data] of employeeMap) {
    // Cap at NSSA ceiling (ZW$ based, using placeholder)
    const nssaCeiling = 500000; // ZW$500,000 (adjust as needed)
    const cappedGross = Math.min(data.grossEarnings, nssaCeiling);
    
    const empNssa = Math.min(cappedGross * 0.045, nssaCeiling * 0.045);
    const empNssaFixed = Math.min(empNssa, 22500); // Max employee contribution
    
    data.nssaEmployee = empNssaFixed;
    data.nssaEmployer = empNssaFixed; // Equal to employee
    
    totalGross += data.grossEarnings;
    totalEmployeeNssa += empNssaFixed;
    totalEmployerNssa += empNssaFixed;
  }

  // Employee detail records
  for (const [_, data] of employeeMap) {
    const emp = data.employee;
    lines.push([
      emp.idPassport || emp.socialSecurityNum || emp.id.slice(0, 8), // NSSA Number
      emp.firstName.substring(0, 20),
      emp.lastName.substring(0, 20),
      Math.round(data.grossEarnings * 100) / 100,       // Gross Earnings
      Math.round(data.nssaEmployee * 100) / 100,        // Employee Contribution
      Math.round(data.nssaEmployer * 100) / 100,        // Employer Contribution
      Math.round((data.nssaEmployee + data.nssaEmployer) * 100) / 100, // Total
    ].join(','));
  }

  // Summary record
  lines.push([
    'SUMMARY',
    employeeMap.size.toString(),                    // Total Employees
    Math.round(totalGross * 100) / 100,             // Total Gross
    Math.round(totalEmployeeNssa * 100) / 100,      // Total Employee
    Math.round(totalEmployerNssa * 100) / 100,     // Total Employer
    Math.round((totalEmployeeNssa + totalEmployerNssa) * 100) / 100, // Grand Total
  ].join(','));

  return lines.join('\n');
}

// NSSA P4A (Annual) Report Format
function generateP4AFile(employees, company, year) {
  const lines = [];
  
  // Header
  lines.push([
    'P4A',
    company.registrationNumber || '',
    company.name.substring(0, 40),
    year.toString(),
    new Date().toISOString().split('T')[0],
  ].join(','));

  // Employee annual records
  for (const emp of employees) {
    const annualGross = emp.annualGross || 0;
    const annualTax = emp.annualTax || 0;
    
    lines.push([
      emp.idPassport || emp.tin || emp.id.slice(0, 8),
      emp.firstName,
      emp.lastName,
      Math.round(annualGross * 100) / 100,
      Math.round(annualTax * 100) / 100,
      year,
    ].join(','));
  }

  return lines.join('\n');
}

// PSL 8 (Tax Clearance Certificate Application) Format
function generatePSL8(employee, taxData) {
  const lines = [];
  
  // Header
  lines.push([
    'PSL8',
    new Date().toISOString().split('T')[0],
    'BANTU Payroll System',
  ].join(','));

  // Employee Details
  lines.push([
    employee.idPassport || employee.tin || '',
    employee.firstName,
    employee.lastName,
    employee.homeAddress || '',
    taxData.periodFrom || '',
    taxData.periodTo || '',
    Math.round((taxData.annualGross || 0) * 100) / 100,
    Math.round((taxData.annualTax || 0) * 100) / 100,
    taxData.certificateNumber || '',
  ].join(','));

  return lines.join('\n');
}

module.exports = {
  generateZIMRAFile,
  generateNSAFile,
  generateP4AFile,
  generatePSL8,
};