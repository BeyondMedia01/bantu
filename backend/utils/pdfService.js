const PDFDocument = require('pdfkit');

/**
 * Generates a payslip PDF for an employee.
 *
 * data fields:
 *   companyName, period, employeeName, nationalId, jobTitle, currency
 *   baseSalary, overtimeAmount, bonus, exemptBonus, taxableBenefits
 *   severanceAmount, exemptSeverance
 *   paye, aidsLevy, nssaEmployee, nssaEmployer, pensionEmployee, medicalAid, loanDeductions
 *   wcifEmployer, sdfContribution, necLevy   (employer-only — shown in info section)
 *   netSalary
 *   netPayUSD, netPayZIG                     (set when employee has a split-currency arrangement)
 */
const generatePayslipPDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(stream);

  const ccy = data.currency || 'USD';
  const fmt = (n) => Number(n || 0).toFixed(2);
  const LEFT = 60;
  const RIGHT_LABEL_END = 360;
  const PAGE_RIGHT = 545;
  const ROW_H = 18;

  // Draws a label + right-aligned value on the current doc.y
  const row = (label, value, opts = {}) => {
    const y = doc.y;
    const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
    const size = opts.size || 11;
    doc.font(font).fontSize(size);
    doc.text(label, LEFT, y, { width: RIGHT_LABEL_END - LEFT });
    doc.text(value, RIGHT_LABEL_END, y, { width: PAGE_RIGHT - RIGHT_LABEL_END, align: 'right' });
    doc.moveDown(opts.gap || 0.25);
  };

  const note = (text) => {
    doc.font('Helvetica').fontSize(8).fillColor('#777777')
      .text(text, LEFT + 12, doc.y, { width: PAGE_RIGHT - LEFT - 12 });
    doc.fillColor('black');
    doc.moveDown(0.2);
  };

  const sectionTitle = (title) => {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a2e4a').text(title, LEFT);
    doc.fillColor('black');
    doc.moveDown(0.3);
    doc.moveTo(LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.5).stroke('#dddddd');
    doc.moveDown(0.4);
  };

  const divider = (heavy = false) => {
    doc.moveTo(LEFT, doc.y)
      .lineTo(PAGE_RIGHT, doc.y)
      .lineWidth(heavy ? 1 : 0.5)
      .stroke(heavy ? '#1a2e4a' : '#dddddd');
    doc.moveDown(0.5);
  };

  // ── Header ────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a2e4a')
    .text('PAYSLIP', LEFT, 50, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.fillColor('black');
  doc.font('Helvetica').fontSize(10).moveDown(0.4);
  doc.text(data.companyName, LEFT, doc.y, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.text(`Pay Period: ${data.period}`, LEFT, doc.y, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.moveDown(0.6);
  divider(true);

  // ── Employee Details ───────────────────────────────────────────────────────
  const detailY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).text('Employee Name', LEFT, detailY);
  doc.font('Helvetica').fontSize(10).text(data.employeeName, LEFT, detailY + ROW_H);

  doc.font('Helvetica-Bold').fontSize(10).text('National ID', 220, detailY);
  doc.font('Helvetica').fontSize(10).text(data.nationalId || '—', 220, detailY + ROW_H);

  doc.font('Helvetica-Bold').fontSize(10).text('Job Title', 380, detailY);
  doc.font('Helvetica').fontSize(10).text(data.jobTitle || '—', 380, detailY + ROW_H);

  doc.y = detailY + ROW_H * 2 + 6;
  doc.moveDown(0.5);
  divider();

  // ── Earnings ──────────────────────────────────────────────────────────────
  sectionTitle('Earnings');
  row('Basic Salary', `${ccy} ${fmt(data.baseSalary)}`);
  if (data.overtimeAmount) row('Overtime', `${ccy} ${fmt(data.overtimeAmount)}`);
  if (data.bonus) {
    row('Bonus', `${ccy} ${fmt(data.bonus)}`);
    if (data.exemptBonus) note(`Tax-exempt portion: ${ccy} ${fmt(data.exemptBonus)}`);
  }
  if (data.severanceAmount) {
    row('Severance / Retrenchment', `${ccy} ${fmt(data.severanceAmount)}`);
    if (data.exemptSeverance) note(`Tax-exempt portion: ${ccy} ${fmt(data.exemptSeverance)}`);
  }
  if (data.taxableBenefits) row('Taxable Benefits', `${ccy} ${fmt(data.taxableBenefits)}`);

  doc.moveDown(0.3);
  divider();

  // ── Employee Deductions ───────────────────────────────────────────────────
  sectionTitle('Employee Deductions');
  row('PAYE', `${ccy} ${fmt(data.paye)}`);
  row('AIDS Levy (3% of PAYE)', `${ccy} ${fmt(data.aidsLevy)}`);
  row('NSSA Employee (4.5%)', `${ccy} ${fmt(data.nssaEmployee)}`);
  if (data.pensionEmployee) row('Pension Fund', `${ccy} ${fmt(data.pensionEmployee)}`);
  if (data.medicalAid) row('Medical Aid', `${ccy} ${fmt(data.medicalAid)}`);
  if (data.loanDeductions) row('Loan Deductions', `${ccy} ${fmt(data.loanDeductions)}`);

  doc.moveDown(0.3);
  divider();

  // ── Employer Contributions (informational) ────────────────────────────────
  const hasEmployerItems = data.nssaEmployer || data.wcifEmployer || data.sdfContribution || data.necLevy;
  if (hasEmployerItems) {
    sectionTitle('Employer Contributions');
    note('These contributions are borne by your employer and do not reduce your net pay.');
    if (data.nssaEmployer) row('NSSA Employer (4.5%)', `${ccy} ${fmt(data.nssaEmployer)}`);
    if (data.wcifEmployer) row('WCIF (Workers Compensation)', `${ccy} ${fmt(data.wcifEmployer)}`);
    if (data.sdfContribution) row('SDF / Training Levy', `${ccy} ${fmt(data.sdfContribution)}`);
    if (data.necLevy) row('NEC Levy', `${ccy} ${fmt(data.necLevy)}`);
    doc.moveDown(0.3);
    divider();
  }

  // ── Net Pay Summary ───────────────────────────────────────────────────────
  sectionTitle('Net Pay');

  if (data.netPayUSD != null && data.netPayZIG != null) {
    // ── Split-currency layout ──────────────────────────────────────────────
    // Draw a highlighted box for the split amounts
    const boxY = doc.y;
    const boxH = ROW_H * 2 + 20;
    doc.rect(LEFT, boxY, PAGE_RIGHT - LEFT, boxH)
      .fillAndStroke('#f0f6ff', '#3b82f6');

    // USD row
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a2e4a');
    doc.text('Net Pay (USD)', LEFT + 10, boxY + 8, { width: 200 });
    doc.text(`USD ${fmt(data.netPayUSD)}`, RIGHT_LABEL_END, boxY + 8,
      { width: PAGE_RIGHT - RIGHT_LABEL_END - 10, align: 'right' });

    // ZiG row
    doc.text('Net Pay (ZiG)', LEFT + 10, boxY + 8 + ROW_H, { width: 200 });
    doc.text(`ZiG ${fmt(data.netPayZIG)}`, RIGHT_LABEL_END, boxY + 8 + ROW_H,
      { width: PAGE_RIGHT - RIGHT_LABEL_END - 10, align: 'right' });

    doc.fillColor('black');
    doc.y = boxY + boxH + 6;

    // Equivalent total in run currency as a footnote
    doc.font('Helvetica').fontSize(8).fillColor('#555555')
      .text(`Equivalent total: ${ccy} ${fmt(data.netSalary)}`, LEFT, doc.y);
    doc.fillColor('black');
  } else {
    // ── Single-currency layout ─────────────────────────────────────────────
    const boxY = doc.y;
    const boxH = ROW_H + 16;
    doc.rect(LEFT, boxY, PAGE_RIGHT - LEFT, boxH)
      .fillAndStroke('#f0f9f4', '#22c55e');

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#14532d');
    doc.text(`Net Pay (${ccy})`, LEFT + 10, boxY + 8, { width: 200 });
    doc.text(`${ccy} ${fmt(data.netSalary)}`, RIGHT_LABEL_END, boxY + 8,
      { width: PAGE_RIGHT - RIGHT_LABEL_END - 10, align: 'right' });

    doc.fillColor('black');
    doc.y = boxY + boxH + 6;
  }

  doc.end();
};

/**
 * Generates a ZIMRA P16 Annual Summary PDF
 *
 * data fields:
 *   company  { name, taxId }
 *   year     number
 *   rows[]   { employee { firstName, lastName, idPassport, tin },
 *              totalGross, totalPaye, totalAidsLevy, totalNssa, totalNet,
 *              totalWcif, totalSdf, totalNecLevy }
 */
const generateP16PDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 30, layout: 'landscape', size: 'A3' });
  doc.pipe(stream);

  const fmt = (n) => Number(n || 0).toFixed(2);

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a2e4a')
    .text('ZIMRA P16 — ANNUAL SUMMARY OF REMUNERATION AND TAX DEDUCTED', { align: 'center' });
  doc.fillColor('black').font('Helvetica').fontSize(10).moveDown(0.4);
  doc.text(`Tax Year: ${data.year}   |   Employer: ${data.company?.name || ''}   |   BP Number: ${data.company?.taxId || '—'}`,
    { align: 'center' });
  doc.moveDown(0.8);

  // ── Column definitions ──────────────────────────────────────────────────────
  const COLS = [
    { label: 'Employee',        key: 'name',          x: 30,  w: 130 },
    { label: 'ID / Passport',   key: 'idPassport',    x: 162, w: 80 },
    { label: 'TIN',             key: 'tin',           x: 244, w: 70 },
    { label: 'Gross Pay',       key: 'totalGross',    x: 316, w: 75 },
    { label: 'NSSA Employee',   key: 'totalNssa',     x: 393, w: 75 },
    { label: 'PAYE',            key: 'totalPaye',     x: 470, w: 70 },
    { label: 'AIDS Levy',       key: 'totalAidsLevy', x: 542, w: 65 },
    { label: 'Net Pay',         key: 'totalNet',      x: 609, w: 75 },
    { label: 'WCIF (Employer)', key: 'totalWcif',     x: 686, w: 70 },
    { label: 'SDF (Employer)',  key: 'totalSdf',      x: 758, w: 65 },
    { label: 'NEC Levy',        key: 'totalNecLevy',  x: 825, w: 65 },
  ];

  const ROW_H = 18;
  const PAGE_BOTTOM = 540;

  const drawHeader = (y) => {
    // Header background
    doc.rect(28, y - 3, 862, ROW_H + 2).fill('#1a2e4a');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white');
    COLS.forEach(col => {
      doc.text(col.label, col.x, y, { width: col.w, align: col.key === 'name' || col.key === 'idPassport' || col.key === 'tin' ? 'left' : 'right' });
    });
    doc.fillColor('black');
    return y + ROW_H;
  };

  let y = doc.y;
  y = drawHeader(y);

  doc.font('Helvetica').fontSize(8);

  (data.rows || []).forEach((row, i) => {
    if (y > PAGE_BOTTOM) {
      doc.addPage({ layout: 'landscape', size: 'A3', margin: 30 });
      y = 40;
      y = drawHeader(y);
      doc.font('Helvetica').fontSize(8);
    }

    const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(28, y - 2, 862, ROW_H).fill(bg);
    doc.fillColor('#1a2e4a');

    const emp = row.employee || {};
    const cells = {
      name:           `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      idPassport:     emp.idPassport || '—',
      tin:            emp.tin || '—',
      totalGross:     fmt(row.totalGross),
      totalNssa:      fmt(row.totalNssa),
      totalPaye:      fmt(row.totalPaye),
      totalAidsLevy:  fmt(row.totalAidsLevy),
      totalNet:       fmt(row.totalNet),
      totalWcif:      fmt(row.totalWcif),
      totalSdf:       fmt(row.totalSdf),
      totalNecLevy:   fmt(row.totalNecLevy),
    };

    COLS.forEach(col => {
      const isNum = !['name', 'idPassport', 'tin'].includes(col.key);
      doc.text(cells[col.key], col.x, y, { width: col.w, align: isNum ? 'right' : 'left' });
    });

    doc.fillColor('black');
    y += ROW_H;
  });

  // ── Totals row ───────────────────────────────────────────────────────────────
  if ((data.rows || []).length > 0) {
    const totals = (data.rows || []).reduce((acc, r) => {
      acc.totalGross    += r.totalGross    || 0;
      acc.totalNssa     += r.totalNssa     || 0;
      acc.totalPaye     += r.totalPaye     || 0;
      acc.totalAidsLevy += r.totalAidsLevy || 0;
      acc.totalNet      += r.totalNet      || 0;
      acc.totalWcif     += r.totalWcif     || 0;
      acc.totalSdf      += r.totalSdf      || 0;
      acc.totalNecLevy  += r.totalNecLevy  || 0;
      return acc;
    }, { totalGross: 0, totalNssa: 0, totalPaye: 0, totalAidsLevy: 0, totalNet: 0, totalWcif: 0, totalSdf: 0, totalNecLevy: 0 });

    y += 4;
    doc.moveTo(28, y).lineTo(890, y).lineWidth(1).stroke('#1a2e4a');
    y += 6;
    doc.rect(28, y - 2, 862, ROW_H).fill('#e8f0fe');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1a2e4a');

    const totalCells = {
      name: 'TOTALS', idPassport: '', tin: '',
      totalGross:    fmt(totals.totalGross),
      totalNssa:     fmt(totals.totalNssa),
      totalPaye:     fmt(totals.totalPaye),
      totalAidsLevy: fmt(totals.totalAidsLevy),
      totalNet:      fmt(totals.totalNet),
      totalWcif:     fmt(totals.totalWcif),
      totalSdf:      fmt(totals.totalSdf),
      totalNecLevy:  fmt(totals.totalNecLevy),
    };
    COLS.forEach(col => {
      const isNum = !['name', 'idPassport', 'tin'].includes(col.key);
      doc.text(totalCells[col.key], col.x, y, { width: col.w, align: isNum ? 'right' : 'left' });
    });
    doc.fillColor('black');
  }

  // ── Footer note ──────────────────────────────────────────────────────────────
  doc.moveDown(2);
  doc.font('Helvetica').fontSize(7.5).fillColor('#777777')
    .text('WCIF, SDF and NEC Levy are employer-borne contributions and do not reduce employee net pay.', 30);
  doc.fillColor('black');

  doc.end();
};

/**
 * Generates an NSSA P4A Monthly Return PDF
 */
const generateNSSA_P4A = (data, stream) => {
  const doc = new PDFDocument({ margin: 50 });

  doc.pipe(stream);

  doc.fontSize(16).text('NSSA FORM P4A - MONTHLY RETURN', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Employer: ${data.companyName}`);
  doc.text(`NSSA Number: ${data.nssaNumber || 'N/A'}`);
  doc.text(`Month: ${data.month}`);
  doc.text(`Year: ${data.year}`);
  doc.moveDown();

  doc.text('Contribution Summary', { underline: true });
  doc.moveDown(0.5);
  doc.text(`Total Insurable Earnings: ${data.currency} ${data.totalInsurableEarnings.toFixed(2)}`);
  doc.text(`Employee Contributions (4.5%): ${data.currency} ${data.totalEmployeeNssa.toFixed(2)}`);
  doc.text(`Employer Contributions (4.5%): ${data.currency} ${data.totalEmployerNssa.toFixed(2)}`);
  doc.moveDown();

  doc.fontSize(14).text(`Total Remittance: ${data.currency} ${data.totalRemittance.toFixed(2)}`, { bold: true });

  doc.end();
};

module.exports = { generatePayslipPDF, generateP16PDF, generateNSSA_P4A };
