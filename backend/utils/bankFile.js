function generateBankFile(payrollRun, payslips, employees, company, options = {}) {
  const { bankCode = 'FIDELITY', format = 'csv' } = options;
  
  switch (bankCode.toUpperCase()) {
    case 'FIDELITY':
      return generateFidelityFile(payrollRun, payslips, employees, company);
    case 'STANBIC':
      return generateStanbicFile(payrollRun, payslips, employees, company);
    case 'CBZ':
      return generateCBZFile(payrollRun, payslips, employees, company);
    case 'ZB':
      return generateZBFile(payrollRun, payslips, employees, company);
    default:
      return generateGenericCSV(payrollRun, payslips, employees, company);
  }
}

function generateFidelityFile(payrollRun, payslips, employees, company) {
  const lines = [];
  const today = new Date();
  const companyCode = company.registrationNumber?.slice(-4) || '0000';
  const batchSeq = String(Date.now()).slice(-6);
  const batchNumber = `FDB${today.toISOString().slice(0, 10).replace(/-/g, '')}${companyCode}${batchSeq}`;
  
  const bankEmployees = payslips.filter(p => {
    const emp = employees.find(e => e.id === p.employeeId);
    return emp && emp.paymentMethod === 'BANK';
  });
  
  const totalAmount = bankEmployees.reduce((sum, p) => {
    const amount = payrollRun.currency === 'ZiG' ? (p.netPayZIG || p.netPay) : p.netPay;
    return sum + (amount || 0);
  }, 0);
  
  lines.push([
    'H',
    'HEADER',
    company.registrationNumber || '',
    company.name.substring(0, 40).padEnd(40),
    today.toISOString().slice(0, 10).replace(/-/g, ''),
    payrollRun.startDate.toISOString().slice(0, 7).replace('-', ''),
    bankEmployees.length.toString().padStart(6, '0'),
    formatFidelityAmount(totalAmount),
    'BATCH',
    batchNumber,
  ].join('|'));

  for (const payslip of bankEmployees) {
    const emp = employees.find(e => e.id === payslip.employeeId);
    if (!emp) continue;
    
    const netPay = payslip.netPay || 0;
    const netPayZIG = payslip.netPayZIG;
    
    const amount = payrollRun.currency === 'ZiG' ? (netPayZIG || netPay) : netPay;
    
    lines.push([
      'D',
      (emp.accountNumber || '').padEnd(15, ' '),
      formatFidelityAmount(amount),
      '1',
      'ZWL',
      emp.firstName.substring(0, 15).padEnd(15),
      emp.lastName.substring(0, 15).padEnd(15),
      emp.idPassport || emp.tin || '',
      (emp.bankBranch || '').padEnd(10, ' '),
      (emp.employeeCode || payslip.employeeId.slice(0, 10)).padEnd(10),
      'SALARY',
    ].join('|'));
  }

  lines.push([
    'T',
    bankEmployees.length.toString().padStart(6, '0'),
    formatFidelityAmount(totalAmount),
  ].join('|'));

  return lines.join('\n');
}

function formatFidelityAmount(amount) {
  const cents = Math.round(amount * 100);
  return cents.toString().padStart(15, '0');
}

function generateStanbicFile(payrollRun, payslips, employees, company) {
  const lines = [];
  const today = new Date();
  
  lines.push([
    'STANBIC',
    company.registrationNumber || '',
    company.name.substring(0, 40),
    today.toISOString().slice(0, 10).replace(/-/g, ''),
    '01',
  ].join(','));

  for (const payslip of payslips) {
    const emp = employees.find(e => e.id === payslip.employeeId);
    if (!emp || emp.paymentMethod !== 'BANK') continue;
    
    const netPay = payslip.netPay || 0;
    const netPayUSD = payslip.netPayUSD;
    const netPayZIG = payslip.netPayZIG;
    
    const amount = payrollRun.currency === 'ZiG' ? (netPayZIG || netPay) : netPay;
    
    lines.push([
      emp.accountNumber || '',
      amount.toFixed(2),
      '1',
      'Zimbabwe',
      (emp.firstName + ' ' + emp.lastName).substring(0, 30),
      emp.idPassport || emp.tin || '',
      'SALARY',
      emp.bankBranch || '',
      emp.employeeCode || '',
    ].join(','));
  }

  const totalAmount = payslips.reduce((sum, p) => {
    const emp = employees.find(e => e.id === p.employeeId);
    if (!emp || emp.paymentMethod !== 'BANK') return sum;
    const amount = payrollRun.currency === 'ZiG' ? (p.netPayZIG || p.netPay) : p.netPay;
    return sum + amount;
  }, 0);

  lines.push([
    'TOTAL',
    payslips.filter(p => {
      const emp = employees.find(e => e.id === p.employeeId);
      return emp && emp.paymentMethod === 'BANK';
    }).length.toString(),
    totalAmount.toFixed(2),
  ].join(','));

  return lines.join('\n');
}

function generateCBZFile(payrollRun, payslips, employees, company) {
  const lines = [];
  const today = new Date();
  
  lines.push([
    'CBZHEADER',
    company.registrationNumber || '',
    company.name.substring(0, 40),
    today.toISOString().slice(0, 10).replace(/-/g, ''),
    'N',
    '1',
  ].join(','));

  for (const payslip of payslips) {
    const emp = employees.find(e => e.id === payslip.employeeId);
    if (!emp || emp.paymentMethod !== 'BANK') continue;
    
    const netPay = payslip.netPay || 0;
    const netPayUSD = payslip.netPayUSD;
    const netPayZIG = payslip.netPayZIG;
    
    const amount = payrollRun.currency === 'ZiG' ? (netPayZIG || netPay) : netPay;
    
    lines.push([
      emp.accountNumber || '',
      emp.bankName || '',
      emp.bankBranch || '',
      amount.toFixed(2),
      (emp.firstName + ' ' + emp.lastName).substring(0, 50),
      emp.idPassport || emp.tin || '',
      'SALARY',
      emp.employeeCode || payslip.employeeId.slice(0, 10),
    ].join(','));
  }

  const totalCount = payslips.filter(p => {
    const emp = employees.find(e => e.id === p.employeeId);
    return emp && emp.paymentMethod === 'BANK';
  }).length;
  
  const totalAmount = payslips.reduce((sum, p) => {
    const emp = employees.find(e => e.id === p.employeeId);
    if (!emp || emp.paymentMethod !== 'BANK') return sum;
    const amount = payrollRun.currency === 'ZiG' ? (p.netPayZIG || p.netPay) : p.netPay;
    return sum + amount;
  }, 0);

  lines.push([
    'CBZTRAILER',
    totalCount.toString(),
    totalAmount.toFixed(2),
    today.toISOString().slice(0, 10).replace(/-/g, ''),
  ].join(','));

  return lines.join('\n');
}

function generateZBFile(payrollRun, payslips, employees, company) {
  const lines = [];
  const today = new Date();
  
  const bankEmployees = payslips.filter(p => {
    const emp = employees.find(e => e.id === p.employeeId);
    return emp && emp.paymentMethod === 'BANK';
  });
  
  const totalAmount = bankEmployees.reduce((sum, p) => {
    const amount = payrollRun.currency === 'ZiG' ? (p.netPayZIG || p.netPay) : p.netPay;
    return sum + (amount || 0);
  }, 0);
  
  lines.push([
    'ZB',
    company.registrationNumber || '',
    company.name.substring(0, 40),
    today.toISOString().slice(0, 10).replace(/-/g, ''),
    bankEmployees.length.toString(),
    totalAmount.toFixed(2),
  ].join(','));

  for (const payslip of bankEmployees) {
    const emp = employees.find(e => e.id === payslip.employeeId);
    if (!emp) continue;
    
    const netPay = payslip.netPay || 0;
    const amount = payrollRun.currency === 'ZiG' ? (payslip.netPayZIG || netPay) : netPay;
    
    lines.push([
      emp.accountNumber || '',
      amount.toFixed(2),
      (emp.firstName + ' ' + emp.lastName).substring(0, 30),
      emp.idPassport || '',
      'SALARY',
    ].join(','));
  }

  lines.push([
    'TOTALS',
    bankEmployees.length.toString(),
    totalAmount.toFixed(2),
  ].join(','));

  return lines.join('\n');
}

function generateGenericCSV(payrollRun, payslips, employees, company) {
  const header = 'EmployeeCode,EmployeeName,AccountNumber,BankName,BankBranch,NetPay,Currency,PaymentReference';
  const rows = [];

  for (const payslip of payslips) {
    const emp = employees.find(e => e.id === payslip.employeeId);
    if (!emp || emp.paymentMethod !== 'BANK') continue;
    
    const netPay = payslip.netPay || 0;
    const netPayUSD = payslip.netPayUSD;
    const netPayZIG = payslip.netPayZIG;
    
    let amount = netPay;
    let currency = payrollRun.currency;
    
    if (payrollRun.dualCurrency) {
      if (emp.splitUsdPercent && emp.splitUsdPercent > 0) {
        amount = netPayUSD || netPay;
        currency = 'USD';
      } else {
        amount = netPayZIG || netPay;
        currency = 'ZiG';
      }
    }
    
    rows.push([
      emp.employeeCode || '',
      `${emp.firstName} ${emp.lastName}`,
      emp.accountNumber || '',
      emp.bankName || '',
      emp.bankBranch || '',
      amount.toFixed(2),
      currency,
      `SAL-${payrollRun.startDate.toISOString().slice(0, 7)}-${emp.employeeCode || payslip.employeeId.slice(0, 8)}`,
    ].join(','));
  }

  return [header, ...rows].join('\n');
}

function generateThirdPartyPayments(payrollRun, totals, company) {
  const lines = [];
  const today = new Date();
  
  lines.push([
    'THIRDPARTY',
    company.registrationNumber || '',
    company.name,
    today.toISOString().slice(0, 10).replace(/-/g, ''),
    payrollRun.startDate.toISOString().slice(0, 7).replace('-', ''),
  ].join(','));

  if (totals.nssaEmployee > 0 || totals.nssaEmployer > 0) {
    lines.push([
      'NSSA',
      totals.nssaEmployee.toFixed(2),
      totals.nssaEmployer.toFixed(2),
      (totals.nssaEmployee + totals.nssaEmployer).toFixed(2),
      'NSSA_CONTRIBUTION',
    ].join(','));
  }

  if (totals.paye > 0) {
    lines.push([
      'ZIMRA_PAYE',
      totals.paye.toFixed(2),
      '0.00',
      totals.paye.toFixed(2),
      'PAYE',
    ].join(','));
  }

  if (totals.necLevy > 0) {
    lines.push([
      'NEC_LEVY',
      totals.necLevy.toFixed(2),
      '0.00',
      totals.necLevy.toFixed(2),
      'NEC_LEVY',
    ].join(','));
  }

  if (totals.wcifEmployer > 0) {
    lines.push([
      'WCIF',
      '0.00',
      totals.wcifEmployer.toFixed(2),
      totals.wcifEmployer.toFixed(2),
      'WORKERS_COMPENSATION_INSURANCE_FUND',
    ].join(','));
  }

  if (totals.sdfContribution > 0) {
    lines.push([
      'SDF',
      '0.00',
      totals.sdfContribution.toFixed(2),
      totals.sdfContribution.toFixed(2),
      'SKILLS_DEVELOPMENT_LEVY',
    ].join(','));
  }

  if (totals.uifEmployee > 0 || totals.uifEmployer > 0) {
    lines.push([
      'UIF',
      totals.uifEmployee.toFixed(2),
      totals.uifEmployer.toFixed(2),
      (totals.uifEmployee + totals.uifEmployer).toFixed(2),
      'UNEMPLOYMENT_INSURANCE_FUND',
    ].join(','));
  }

  return lines.join('\n');
}

module.exports = {
  generateBankFile,
  generateFidelityFile,
  generateStanbicFile,
  generateCBZFile,
  generateZBFile,
  generateGenericCSV,
  generateThirdPartyPayments,
};
