const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ZIMBABWE_STATUTORY_SETTINGS = [
  { settingName: 'AIDS_LEVY_RATE', settingValue: '3', description: 'AIDS Levy rate (percentage)' },
  { settingName: 'NSSA_EMPLOYEE_RATE', settingValue: '4.5', description: 'NSSA Employee contribution rate (percentage)' },
  { settingName: 'NSSA_EMPLOYER_RATE', settingValue: '4.5', description: 'NSSA Employer contribution rate (percentage)' },
  { settingName: 'NSSA_CEILING_USD', settingValue: '700', description: 'NSSA contribution ceiling for USD (monthly)' },
  { settingName: 'NSSA_CEILING_ZIG', settingValue: '7000', description: 'NSSA contribution ceiling for ZiG (monthly)' },
  { settingName: 'PENSION_CAP_RATE', settingValue: '15', description: 'Pension contribution cap (percentage of gross)' },
  { settingName: 'AIDS_LEVY_EXEMPTION_THRESHOLD_USD', settingValue: '500', description: 'AIDS Levy exemption threshold for USD' },
  { settingName: 'AIDS_LEVY_EXEMPTION_THRESHOLD_ZIG', settingValue: '20000', description: 'AIDS Levy exemption threshold for ZiG' },
  { settingName: 'MEDICAL_AID_CREDIT_RATE', settingValue: '25', description: 'Medical aid tax credit rate (percentage)' },
  { settingName: 'MEDICAL_AID_CREDIT_ANNUAL_CAP', settingValue: '600', description: 'Medical aid credit annual cap (USD)' },
  { settingName: 'UIF_EMPLOYEE_RATE', settingValue: '1', description: 'Unemployment Insurance Fund Employee rate (percentage)' },
  { settingName: 'UIF_EMPLOYER_RATE', settingValue: '1', description: 'Unemployment Insurance Fund Employer rate (percentage)' },
  { settingName: 'UIF_CEILING_USD', settingValue: '100', description: 'UIF contribution ceiling for USD' },
  { settingName: 'UIF_CEILING_ZIG', settingValue: '100000', description: 'UIF contribution ceiling for ZiG' },
  { settingName: 'SEVERANCE_EXEMPTION_USD', settingValue: '300000', description: 'Severance pay exemption threshold (USD)' },
  { settingName: 'SEVERANCE_EXEMPTION_ZIG', settingValue: '1500000', description: 'Severance pay exemption threshold (ZiG)' },
  { settingName: 'RBZ_MAX_SPREAD', settingValue: '0.5', description: 'Maximum allowed exchange rate spread (percentage)' },
  { settingName: 'RECONCILIATION_TOLERANCE', settingValue: '0.01', description: 'Reconciliation tolerance for rounding errors' },
  { settingName: 'STATUTORY_LEAVE_MAX_ANNUAL', settingValue: '24', description: 'Maximum annual leave days (Labour Act)' },
  { settingName: 'STATUTORY_LEAVE_MAX_SICK', settingValue: '90', description: 'Maximum sick leave days per year' },
  { settingName: 'STATUTORY_LEAVE_MAX_MATERNITY', settingValue: '98', description: 'Maximum maternity leave days' },
  { settingName: 'STATUTORY_LEAVE_MAX_PATERNITY', settingValue: '2', description: 'Maximum paternity leave days' },
  { settingName: 'WCIF_RATE', settingValue: '0.5', description: 'Workers Compensation Insurance Fund rate (percentage)' },
  { settingName: 'SDF_RATE', settingValue: '0.5', description: 'Skills Development Levy rate (percentage)' },
  { settingName: 'BONUS_EXEMPTION_USD', settingValue: '0', description: 'Bonus exemption threshold (USD)' },
  { settingName: 'BONUS_EXEMPTION_ZIG', settingValue: '0', description: 'Bonus exemption threshold (ZiG)' },
  { settingName: 'NEC_LEVY_RATE', settingValue: '0.5', description: 'NEC Levy rate for applicable grades' },
];

async function seedSystemSettings() {
  console.log('Seeding Zimbabwe statutory system settings...\n');

  for (const setting of ZIMBABWE_STATUTORY_SETTINGS) {
    try {
      const existing = await prisma.systemSetting.findFirst({
        where: { settingName: setting.settingName },
      });

      if (existing) {
        await prisma.systemSetting.update({
          where: { id: existing.id },
          data: {
            settingValue: setting.settingValue,
            description: setting.description,
            isActive: true,
          },
        });
        console.log(`  ✓ Updated: ${setting.settingName} = ${setting.settingValue}`);
      } else {
        await prisma.systemSetting.create({
          data: {
            settingName: setting.settingName,
            settingValue: setting.settingValue,
            description: setting.description,
            isActive: true,
            effectiveFrom: new Date(),
          },
        });
        console.log(`  + Created: ${setting.settingName} = ${setting.settingValue}`);
      }
    } catch (error) {
      console.error(`  ✗ Error with ${setting.settingName}:`, error.message);
    }
  }

  console.log('\nSeeding complete!');
}

seedSystemSettings()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
