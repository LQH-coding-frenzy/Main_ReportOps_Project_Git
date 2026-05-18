import { PrismaClient, Role } from '@prisma/client';
import * as dotenv from 'dotenv';
import { getSectionDefinition } from '../services/audit/pack-registry';
import { ensureSectionRuntimeScripts } from '../services/audit/runtime-script-registry';
import { syncSectionPacks } from '../services/audit/pack-registry';

dotenv.config();

const prisma = new PrismaClient();

const SECTIONS_TO_IMPORT = (process.env.IMPORT_SECTIONS || 'M1,M2,M3,M4').split(',').map((s) => s.trim().toUpperCase());

async function importSectionScripts(sectionCode: string, leaderId: number) {
  console.log(`\n--- Importing ${sectionCode} scripts ---`);

  const definition = getSectionDefinition(sectionCode);
  if (!definition) {
    console.error(`  Section definition not found for ${sectionCode}.`);
    return;
  }

  const importedCount = await ensureSectionRuntimeScripts(prisma, sectionCode, leaderId);
  if (importedCount === 0) {
    console.error(`  Script runtime not ready for ${sectionCode}. Check /scripts and storage env.`);
    return;
  }

  console.log(`  ${sectionCode}: ${importedCount} controls imported successfully.`);
}

async function importScripts() {
  console.log('Starting audit script import...');
  console.log(`Sections to import: ${SECTIONS_TO_IMPORT.join(', ')}`);

  const leader = await prisma.user.findFirst({ where: { role: Role.LEADER } });
  if (!leader) {
    console.error('No leader found. Seed users first.');
    return;
  }

  await syncSectionPacks(prisma);

  for (const sectionCode of SECTIONS_TO_IMPORT) {
    await importSectionScripts(sectionCode, leader.id);
  }

  console.log('\nAll requested sections imported successfully.');
}

importScripts()
  .catch((error) => console.error(error))
  .finally(() => prisma.$disconnect());
