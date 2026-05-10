import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.labVm.deleteMany({
    where: {
      status: {
        in: ['ERROR', 'PROVISIONING', 'DESTROYING'],
      },
    },
  });
  console.log(`Deleted ${result.count} old or stuck VMs from database.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
