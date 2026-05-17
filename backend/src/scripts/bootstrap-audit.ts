import { PrismaClient, Role } from '@prisma/client';
import * as dotenv from 'dotenv';
import { syncSectionPacks } from '../services/audit/pack-registry';

dotenv.config();

const prisma = new PrismaClient();

async function bootstrap() {
  console.log('Bootstrapping audit pack registry...');

  const leader = await prisma.user.findFirst({ where: { role: Role.LEADER } });
  if (!leader) {
    console.error('No leader found. Please seed users first.');
    return;
  }

  const packs = await syncSectionPacks(prisma);
  for (const pack of packs) {
    console.log(`Pack ready: ${pack.packId} (${pack.ownerSection}) placeholder=${pack.isPlaceholder}`);
  }

  console.log('Audit pack bootstrap complete. Run audit:import-all to register all control scripts (M1-M4).');
}

bootstrap()
  .catch((error) => console.error(error))
  .finally(() => prisma.$disconnect());
