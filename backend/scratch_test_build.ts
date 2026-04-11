import { PrismaClient } from '@prisma/client';
import { buildPreviewReport } from './src/services/report-generator';

const prisma = new PrismaClient();

async function testBuild() {
  console.log('🚀 Triggering test preview build on server...');
  
  try {
    const result = await buildPreviewReport(1); // Triggered by leader (ID 1)
    console.log(`✅ Build #${result.buildId} initialized. Starting status polling...`);

    let status = result.status;
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds

    while ((status === 'pending' || status === 'building') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const build = await prisma.reportBuild.findUnique({
        where: { id: result.buildId },
        select: { status: true, buildLog: true }
      });
      
      status = build?.status as any;
      attempts++;
      console.log(`[Attempt ${attempts}] Current status: ${status}`);
    }

    const finalBuild = await prisma.reportBuild.findUnique({
      where: { id: result.buildId }
    });

    console.log('\n--- Final Build Results ---');
    console.log(`ID: ${finalBuild?.id}`);
    console.log(`Status: ${finalBuild?.status}`);
    console.log(`Completed At: ${finalBuild?.completedAt}`);
    console.log('Log Output:');
    console.log(finalBuild?.buildLog);
    console.log('---------------------------\n');

    if (finalBuild?.status === 'completed') {
      console.log('🏁 SUCCESS: Test build completed perfectly.');
    } else {
      console.log('❌ FAILED: Test build did not complete successfully.');
    }

  } catch (error) {
    console.error('❌ Error during test build:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBuild();
