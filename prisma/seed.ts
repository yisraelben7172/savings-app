import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', name: 'Admin', role: 'ADMIN' },
  });

  await prisma.product.upsert({
    where: { sku: 'DEMO-001' },
    update: {},
    create: { sku: 'DEMO-001', name: 'Demo Product', price: 19.99, stock: 100 },
  });

  await prisma.customer.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: { name: 'Demo Customer', email: 'customer@example.com', ownerId: admin.id },
  });

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
