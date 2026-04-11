const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.reportBuild.updateMany({
    where: { status: { in: ['pending', 'building'] } },
    data: { 
      status: 'failed',
      completedAt: new Date(),
      buildLog: {
        set: '❌ Build aborted due to manual cleanup.'
      }
    }
  });
  console.log(`Successfully cleaned up ${result.count} active builds.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
