const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createDemoAccount() {
  console.log('🚀 Creating demo account...\n');

  try {
    // Create demo client
    const client = await prisma.client.upsert({
      where: { id: 'demo-client' },
      update: {},
      create: {
        id: 'demo-client',
        name: 'Demo Company',
        isActive: true,
        defaultCurrency: 'USD',
      },
    });
    console.log('✅ Client created:', client.name);

    // Create license token
    await prisma.licenseToken.upsert({
      where: { clientId: client.id },
      update: {},
      create: {
        clientId: client.id,
        token: 'demo-license-token-2024',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        employeeCap: 100,
      },
    });
    console.log('✅ License token created');

    const password = await bcrypt.hash('demo123', 12);

    // Create admin user
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@demo.com' },
      update: {},
      create: {
        name: 'Demo Admin',
        email: 'admin@demo.com',
        password,
        role: 'CLIENT_ADMIN',
      },
    });
    console.log('✅ Admin user created: admin@demo.com / demo123');

    // Create ClientAdmin record linking user to client
    await prisma.clientAdmin.upsert({
      where: { userId: adminUser.id },
      update: {},
      create: {
        userId: adminUser.id,
        clientId: client.id,
      },
    });
    console.log('✅ ClientAdmin record created');

    // Create employee user
    await prisma.user.upsert({
      where: { email: 'employee@demo.com' },
      update: {},
      create: {
        name: 'Demo Employee',
        email: 'employee@demo.com',
        password,
        role: 'EMPLOYEE',
      },
    });
    console.log('✅ Employee user created: employee@demo.com / demo123');

    // Create demo company
    await prisma.company.upsert({
      where: { id: 'demo-company' },
      update: {},
      create: {
        id: 'demo-company',
        clientId: client.id,
        name: 'Acme Corporation',
        registrationNumber: 'REG123456',
        taxId: 'TAX987654321',
        address: '123 Demo Street, Tech City, TC 12345',
        contactEmail: 'hr@demo.com',
        contactPhone: '+1-555-123-4567',
        wcifRate: 0.005,
        sdfRate: 0.01,
      },
    });
    console.log('✅ Company created: Acme Corporation');

    console.log('\n═══════════════════════════════════════════');
    console.log('           DEMO CREDENTIALS');
    console.log('═══════════════════════════════════════════\n');
    console.log('🔐  Admin Login:');
    console.log('    Email:    admin@demo.com');
    console.log('    Password: demo123');
    console.log('    Role:     CLIENT_ADMIN');
    console.log('\n👤 Employee Login:');
    console.log('    Email:    employee@demo.com');
    console.log('    Password: demo123');
    console.log('    Role:     EMPLOYEE');
    console.log('\n🏢 Company:  Acme Corporation');
    console.log('\n═══════════════════════════════════════════\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

createDemoAccount();
