const express = require('express');
const multer = require('multer');
const { parse: parseCSV } = require('csv-parse/sync');
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { checkEmployeeCap } = require('../lib/license');
const { audit } = require('../lib/audit');
const { validate } = require('../lib/validate');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Column definitions for import template
const IMPORT_COLUMNS = [
  { header: 'Employee Code *',            key: 'employeeCode' },
  { header: 'Title',                      key: 'title',             hint: 'Mr/Mrs/Miss/Ms/Dr/Prof/Rev' },
  { header: 'First Name *',               key: 'firstName' },
  { header: 'Last Name *',                key: 'lastName' },
  { header: 'Maiden Name',                key: 'maidenName' },
  { header: 'Nationality *',              key: 'nationality' },
  { header: 'ID/Passport Number *',       key: 'idPassport' },
  { header: 'Date of Birth *',            key: 'dateOfBirth',       hint: 'YYYY-MM-DD' },
  { header: 'Gender *',                   key: 'gender',            hint: 'MALE/FEMALE/OTHER' },
  { header: 'Marital Status *',           key: 'maritalStatus',     hint: 'SINGLE/MARRIED/DIVORCED/WIDOWED' },
  { header: 'Home Address',               key: 'homeAddress' },
  { header: 'Postal Address',             key: 'postalAddress' },
  { header: 'Next of Kin Name',           key: 'nextOfKinName' },
  { header: 'Next of Kin Contact',        key: 'nextOfKinContact' },
  { header: 'Social Security Number',     key: 'socialSecurityNum' },
  { header: 'Start Date *',               key: 'startDate',         hint: 'YYYY-MM-DD' },
  { header: 'Occupation',                 key: 'occupation' },
  { header: 'Position/Job Title *',       key: 'position' },
  { header: 'Department Name',            key: '_departmentName',   hint: 'Must match existing department' },
  { header: 'Branch Name',                key: '_branchName',       hint: 'Must match existing branch' },
  { header: 'Cost Center',               key: 'costCenter' },
  { header: 'Employment Type *',          key: 'employmentType',    hint: 'PERMANENT/CONTRACT/TEMPORARY/PART_TIME' },
  { header: 'Leave Entitlement (days)',   key: 'leaveEntitlement' },
  { header: 'Payment Method *',           key: 'paymentMethod',     hint: 'BANK/CASH' },
  { header: 'Payment Basis *',            key: 'paymentBasis',      hint: 'MONTHLY/DAILY/HOURLY' },
  { header: 'Rate Source',               key: 'rateSource',         hint: 'MANUAL/NEC_GRADE' },
  { header: 'Base Rate *',                key: 'baseRate' },
  { header: 'Currency *',                 key: 'currency',          hint: 'USD/ZiG' },
  { header: 'Hours Per Period',           key: 'hoursPerPeriod' },
  { header: 'Days Per Period',            key: 'daysPerPeriod' },
  { header: 'Bank Name',                  key: 'bankName' },
  { header: 'Bank Branch',               key: 'bankBranch' },
  { header: 'Account Number',            key: 'accountNumber' },
  { header: 'Tax Method *',               key: 'taxMethod',         hint: 'NON_FDS/FDS_AVERAGE/FDS_FORECASTING' },
  { header: 'Tax Table *',                key: 'taxTable',          hint: 'e.g. USD 2024' },
  { header: 'Accumulative Setting',       key: 'accumulativeSetting', hint: 'YES/NO' },
  { header: 'Tax Credits',               key: 'taxCredits' },
  { header: 'TIN',                        key: 'tin' },
  { header: 'Motor Vehicle Benefit',      key: 'motorVehicleBenefit' },
  { header: 'Motor Vehicle Type',         key: 'motorVehicleType' },
  { header: 'Tax Directive %',            key: 'taxDirectivePerc' },
  { header: 'Tax Directive Amount',       key: 'taxDirectiveAmt' },
  { header: 'Annual Leave Accrued',       key: 'annualLeaveAccrued' },
  { header: 'Annual Leave Taken',         key: 'annualLeaveTaken' },
];

const EMPLOYEE_CREATE_SCHEMA = {
  firstName:      { required: true, type: 'string', minLength: 1 },
  lastName:       { required: true, type: 'string', minLength: 1 },
  position:       { required: true, type: 'string', minLength: 1 },
  startDate:      { required: true, isDate: true },
  baseRate:       { required: true, type: 'number', min: 0 },
  employmentType: { enum: ['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME'] },
  currency:       { enum: ['USD', 'ZiG'] },
  paymentMethod:  { enum: ['BANK', 'CASH'] },
  paymentBasis:   { enum: ['MONTHLY', 'DAILY', 'HOURLY'] },
  taxMethod:      { enum: ['FDS_AVERAGE', 'FDS_FORECASTING', 'NON_FDS'] },
};

const router = express.Router();

const pickEmployeeFields = (body) => ({
  // Personal
  employeeCode:      body.employeeCode,
  title:             body.title,
  firstName:         body.firstName,
  lastName:          body.lastName,
  maidenName:        body.maidenName,
  nationality:       body.nationality,
  idPassport:        body.idPassport,
  socialSecurityNum: body.socialSecurityNum,
  dateOfBirth:       body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
  gender:            body.gender || undefined,
  maritalStatus:     body.maritalStatus || undefined,
  homeAddress:       body.homeAddress,
  postalAddress:     body.postalAddress,
  nextOfKin:         body.nextOfKin,
  nextOfKinName:     body.nextOfKinName,
  nextOfKinContact:  body.nextOfKinContact,
  // Work
  occupation:        body.occupation,
  position:          body.position,
  employmentType:    body.employmentType || undefined,
  startDate:         body.startDate ? new Date(body.startDate) : undefined,
  branchId:          body.branchId || undefined,
  departmentId:      body.departmentId || undefined,
  costCenter:        body.costCenter,
  gradeId:           body.gradeId || undefined,
  leaveEntitlement:  body.leaveEntitlement !== undefined && body.leaveEntitlement !== '' ? parseFloat(body.leaveEntitlement) : undefined,
  dischargeDate:     body.dischargeDate ? new Date(body.dischargeDate) : undefined,
  dischargeReason:   body.dischargeReason,
  // Pay
  paymentMethod:     body.paymentMethod || undefined,
  paymentBasis:      body.paymentBasis || undefined,
  rateSource:        body.rateSource || undefined,
  baseRate:          body.baseRate !== undefined && body.baseRate !== '' ? parseFloat(body.baseRate) : undefined,
  currency:          body.currency,
  hoursPerPeriod:    body.hoursPerPeriod !== undefined && body.hoursPerPeriod !== '' ? parseFloat(body.hoursPerPeriod) : undefined,
  daysPerPeriod:     body.daysPerPeriod !== undefined && body.daysPerPeriod !== '' ? parseFloat(body.daysPerPeriod) : undefined,
  bankName:          body.bankName,
  bankBranch:        body.bankBranch,
  accountNumber:     body.accountNumber,
  // Tax
  taxMethod:         body.taxMethod || undefined,
  taxTable:          body.taxTable,
  taxDirective:      body.taxDirective,
  taxDirectivePerc:  body.taxDirectivePerc !== undefined && body.taxDirectivePerc !== '' ? parseFloat(body.taxDirectivePerc) : undefined,
  taxDirectiveAmt:   body.taxDirectiveAmt !== undefined && body.taxDirectiveAmt !== '' ? parseFloat(body.taxDirectiveAmt) : undefined,
  accumulativeSetting: body.accumulativeSetting,
  taxCredits:        body.taxCredits !== undefined && body.taxCredits !== '' ? parseFloat(body.taxCredits) : undefined,
  tin:               body.tin,
  motorVehicleBenefit: body.motorVehicleBenefit !== undefined && body.motorVehicleBenefit !== '' ? parseFloat(body.motorVehicleBenefit) : undefined,
  motorVehicleType:  body.motorVehicleType,
  // Leave balances
  leaveBalance:      body.annualLeaveAccrued !== undefined && body.annualLeaveAccrued !== '' ? parseFloat(body.annualLeaveAccrued) : undefined,
  leaveTaken:        body.annualLeaveTaken !== undefined && body.annualLeaveTaken !== '' ? parseFloat(body.annualLeaveTaken) : undefined,
});

// GET /api/employees
router.get('/', async (req, res) => {
  // EMPLOYEE role can only see their own record
  if (req.user.role === 'EMPLOYEE') {
    if (!req.employeeId) return res.status(403).json({ message: 'Employee profile not found' });
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: req.employeeId },
        include: {
          branch: { select: { name: true } },
          department: { select: { name: true } },
        },
      });
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      return res.json({ data: [employee], total: 1, page: 1, limit: 1 });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  const { page = 1, limit = 20, search, branchId, departmentId, employmentType, companyId } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const scopedCompanyId = req.companyId || companyId;

  try {
    const where = {
      ...(scopedCompanyId && { companyId: scopedCompanyId }),
      ...(branchId && { branchId }),
      ...(departmentId && { departmentId }),
      ...(employmentType && { employmentType }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
          { idPassport: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          branch: { select: { name: true } },
          department: { select: { name: true } },
        },
        skip,
        take: parseInt(limit),
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.employee.count({ where }),
    ]);

    res.json({ data: employees, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/employees
router.post('/', requirePermission('manage_employees'), async (req, res) => {
  const { companyId } = req.body;
  const scopedCompanyId = req.companyId || companyId;
  if (!scopedCompanyId) return res.status(400).json({ message: 'companyId is required' });

  const { ok, errors } = validate(req.body, EMPLOYEE_CREATE_SCHEMA);
  if (!ok) return res.status(400).json({ message: errors[0], errors });

  try {
    const company = await prisma.company.findUnique({ where: { id: scopedCompanyId } });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    const capCheck = await checkEmployeeCap(company.clientId);
    if (!capCheck.withinCap) {
      return res.status(403).json({
        message: `Employee cap reached (${capCheck.count}/${capCheck.cap}). Upgrade your subscription.`,
      });
    }

    const data = pickEmployeeFields(req.body);
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const employee = await prisma.employee.create({
      data: {
        ...data,
        companyId: scopedCompanyId,
        clientId: company.clientId,
        startDate: new Date(req.body.startDate),
        baseRate: parseFloat(req.body.baseRate),
      },
    });

    await audit({
      req,
      action: 'EMPLOYEE_CREATED',
      resource: 'employee',
      resourceId: employee.id,
      details: { name: `${employee.firstName} ${employee.lastName}`, position: employee.position },
    });

    res.status(201).json(employee);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/employees/import/template — download CSV or Excel template
router.get('/import/template', (req, res) => {
  const format = (req.query.format || 'csv').toLowerCase();
  const headers = IMPORT_COLUMNS.map((c) => c.header);
  const sample = [
    'EMP001', 'Mr', 'John', 'Doe', '', 'Zimbabwean', '63-123456A78',
    '1985-03-15', 'MALE', 'MARRIED', '1 Main St Harare', '',
    'Jane Doe', '0771234567', '3001234567', '2024-01-01',
    'Software Engineer', 'Developer', 'Engineering', 'Main Branch',
    'CC001', 'PERMANENT', '30', 'BANK', 'MONTHLY', 'MANUAL',
    '1500.00', 'USD', '176', '22', 'CBZ Bank', 'Harare Main', '1234567890',
    'NON_FDS', 'USD 2024', 'NO', '0', '', '0', '', '0', '0', '0', '0',
  ];

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    // Data sheet
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    // Hints sheet
    const hintsData = [['Column', 'Required', 'Allowed Values / Format']];
    IMPORT_COLUMNS.forEach((c) => {
      hintsData.push([c.header, c.header.endsWith('*') ? 'Yes' : 'No', c.hint || '']);
    });
    const wsHints = XLSX.utils.aoa_to_sheet(hintsData);
    wsHints['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsHints, 'Field Guide');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.xlsx"');
    return res.send(buf);
  }

  // Default: CSV
  const escape = (v) => (String(v).includes(',') ? `"${v}"` : v);
  const csv = [headers.map(escape).join(','), sample.map(escape).join(',')].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.csv"');
  return res.send(csv);
});

// POST /api/employees/import — bulk create from CSV or Excel
router.post('/import', requirePermission('manage_employees'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const scopedCompanyId = req.companyId;
  if (!scopedCompanyId) return res.status(400).json({ message: 'Company context required' });

  const company = await prisma.company.findUnique({ where: { id: scopedCompanyId } });
  if (!company) return res.status(404).json({ message: 'Company not found' });

  // Parse file into array of objects
  let rows = [];
  const ext = req.file.originalname.toLowerCase().split('.').pop();
  try {
    if (ext === 'csv') {
      rows = parseCSV(req.file.buffer.toString('utf8'), {
        columns: true, skip_empty_lines: true, trim: true,
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } else {
      return res.status(400).json({ message: 'Unsupported file. Upload a .csv or .xlsx file.' });
    }
  } catch (err) {
    return res.status(400).json({ message: 'Failed to parse file: ' + err.message });
  }

  if (!rows.length) return res.status(400).json({ message: 'No data rows found in file.' });

  // Resolve branch/department names → IDs for this company
  const [allBranches, allDepts] = await Promise.all([
    prisma.branch.findMany({ where: { companyId: scopedCompanyId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId: scopedCompanyId }, select: { id: true, name: true } }),
  ]);
  const branchMap = Object.fromEntries(allBranches.map((b) => [b.name.toLowerCase().trim(), b.id]));
  const deptMap   = Object.fromEntries(allDepts.map((d) => [d.name.toLowerCase().trim(), d.id]));

  // Helper: get cell value by column header (strip trailing * and spaces)
  const get = (row, header) => {
    const normalise = (s) => s.replace(/\s*\*$/, '').trim().toLowerCase();
    const needle = normalise(header);
    const key = Object.keys(row).find((k) => normalise(k) === needle);
    return key ? String(row[key] ?? '').trim() : '';
  };

  const results = { created: 0, failed: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // row 1 = headers

    try {
      const body = {
        employeeCode:       get(row, 'Employee Code'),
        title:              get(row, 'Title'),
        firstName:          get(row, 'First Name'),
        lastName:           get(row, 'Last Name'),
        maidenName:         get(row, 'Maiden Name'),
        nationality:        get(row, 'Nationality'),
        idPassport:         get(row, 'ID/Passport Number'),
        dateOfBirth:        get(row, 'Date of Birth'),
        gender:             get(row, 'Gender'),
        maritalStatus:      get(row, 'Marital Status'),
        homeAddress:        get(row, 'Home Address'),
        postalAddress:      get(row, 'Postal Address'),
        nextOfKinName:      get(row, 'Next of Kin Name'),
        nextOfKinContact:   get(row, 'Next of Kin Contact'),
        socialSecurityNum:  get(row, 'Social Security Number'),
        startDate:          get(row, 'Start Date'),
        occupation:         get(row, 'Occupation'),
        position:           get(row, 'Position/Job Title'),
        costCenter:         get(row, 'Cost Center'),
        employmentType:     get(row, 'Employment Type') || 'PERMANENT',
        leaveEntitlement:   get(row, 'Leave Entitlement (days)'),
        paymentMethod:      get(row, 'Payment Method') || 'BANK',
        paymentBasis:       get(row, 'Payment Basis') || 'MONTHLY',
        rateSource:         get(row, 'Rate Source') || 'MANUAL',
        baseRate:           get(row, 'Base Rate'),
        currency:           get(row, 'Currency') || 'USD',
        hoursPerPeriod:     get(row, 'Hours Per Period'),
        daysPerPeriod:      get(row, 'Days Per Period'),
        bankName:           get(row, 'Bank Name'),
        bankBranch:         get(row, 'Bank Branch'),
        accountNumber:      get(row, 'Account Number'),
        taxMethod:          get(row, 'Tax Method') || 'NON_FDS',
        taxTable:           get(row, 'Tax Table'),
        accumulativeSetting: get(row, 'Accumulative Setting') || 'NO',
        taxCredits:         get(row, 'Tax Credits'),
        tin:                get(row, 'TIN'),
        motorVehicleBenefit: get(row, 'Motor Vehicle Benefit'),
        motorVehicleType:   get(row, 'Motor Vehicle Type'),
        taxDirectivePerc:   get(row, 'Tax Directive %'),
        taxDirectiveAmt:    get(row, 'Tax Directive Amount'),
        annualLeaveAccrued: get(row, 'Annual Leave Accrued'),
        annualLeaveTaken:   get(row, 'Annual Leave Taken'),
      };

      if (!body.firstName)  throw new Error('First Name is required');
      if (!body.lastName)   throw new Error('Last Name is required');
      if (!body.position)   throw new Error('Position/Job Title is required');
      if (!body.startDate)  throw new Error('Start Date is required');
      if (!body.baseRate)   throw new Error('Base Rate is required');

      // Resolve branch/department names
      const branchName = get(row, 'Branch Name');
      const deptName   = get(row, 'Department Name');
      if (branchName) body.branchId = branchMap[branchName.toLowerCase()] || undefined;
      if (deptName)   body.departmentId = deptMap[deptName.toLowerCase()] || undefined;

      const data = pickEmployeeFields(body);
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

      await prisma.employee.create({
        data: {
          ...data,
          companyId: scopedCompanyId,
          clientId:  company.clientId,
          startDate: new Date(body.startDate),
          baseRate:  parseFloat(body.baseRate),
        },
      });

      results.created++;
    } catch (err) {
      const name = `${get(row, 'First Name')} ${get(row, 'Last Name')}`.trim() || `Row ${rowNum}`;
      results.failed.push({ row: rowNum, name, reason: err.message });
    }
  }

  res.json({
    message: `Import complete: ${results.created} created, ${results.failed.length} failed.`,
    created: results.created,
    failed:  results.failed,
  });
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        company: { select: { name: true } },
        branch: { select: { name: true } },
        department: { select: { name: true } },
        grade: { select: { name: true } },
      },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(employee);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/employees/:id
router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  // Partial update — only validate fields that are present
  const partialSchema = {};
  for (const [k, v] of Object.entries(EMPLOYEE_CREATE_SCHEMA)) {
    if (req.body[k] !== undefined) partialSchema[k] = { ...v, required: false };
  }
  const { ok, errors } = validate(req.body, partialSchema);
  if (!ok) return res.status(400).json({ message: errors[0], errors });

  try {
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const data = pickEmployeeFields(req.body);
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const employee = await prisma.employee.update({ where: { id: req.params.id }, data });

    // Log salary/rate changes with old and new values
    const auditDetails = { fields: Object.keys(data) };
    if (data.baseRate !== undefined && data.baseRate !== existing.baseRate) {
      auditDetails.salaryChange = {
        field: 'baseRate',
        oldValue: existing.baseRate,
        newValue: data.baseRate,
        effectiveDate: data.effectiveDate || new Date().toISOString().split('T')[0],
      };
    }
    if (data.position !== undefined && data.position !== existing.position) {
      auditDetails.positionChange = {
        oldValue: existing.position,
        newValue: data.position,
      };
    }

    await audit({
      req,
      action: 'EMPLOYEE_UPDATED',
      resource: 'employee',
      resourceId: employee.id,
      details: auditDetails,
    });

    res.json(employee);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Employee not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    await prisma.employee.delete({ where: { id: req.params.id } });

    await audit({
      req,
      action: 'EMPLOYEE_DELETED',
      resource: 'employee',
      resourceId: req.params.id,
      details: { name: `${existing.firstName} ${existing.lastName}` },
    });

    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Employee not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
