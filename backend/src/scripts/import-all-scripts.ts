import { PrismaClient, Role } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectRoot } from '../config/project-answers';
import { env } from '../config/env';
import { SECTION_DEFINITION_MAP } from '../config/section-definitions';
import { buildPackMetadata, syncSectionPacks } from '../services/audit/pack-registry';

dotenv.config();

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BUCKET = env.SUPABASE_STORAGE_BUCKET;

const SCRIPT_PATH_MAP: Record<string, string> = {
  M1: path.join(resolveProjectRoot(), 'scripts', 'm1_base_server.sh'),
  M2: path.join(resolveProjectRoot(), 'scripts', 'm2_attack_surface.sh'),
  M3: path.join(resolveProjectRoot(), 'scripts', 'm3_admin_access.sh'),
  M4: path.join(resolveProjectRoot(), 'scripts', 'm4_identity_logging_audit.sh'),
};

const SECTIONS_TO_IMPORT = (process.env.IMPORT_SECTIONS || 'M1,M2,M3,M4').split(',').map((s) => s.trim().toUpperCase());

function buildTargetedControlScript(content: string, controlId: string): string {
  const scriptBody = content.replace(/^#!\/usr\/bin\/env bash\s*/, '');
  return ['#!/usr/bin/env bash', `export TARGET_CONTROL_ID="${controlId}"`, '', scriptBody].join('\n');
}

async function importSectionScripts(sectionCode: string, leaderId: number) {
  console.log(`\n--- Importing ${sectionCode} scripts ---`);

  const scriptFilePath = SCRIPT_PATH_MAP[sectionCode];
  if (!scriptFilePath || !fs.existsSync(scriptFilePath)) {
    console.error(`  Script not found for ${sectionCode}: ${scriptFilePath || 'no path configured'}`);
    return;
  }

  const metadata = buildPackMetadata(sectionCode);
  if (!metadata) {
    console.error(`  Pack metadata missing for ${sectionCode}.`);
    return;
  }

  const pack = await prisma.auditPack.findUnique({ where: { packId: metadata.packId } });
  if (!pack) {
    console.error(`  Audit pack not found for ${sectionCode}. Run audit:bootstrap first.`);
    return;
  }

  const definition = SECTION_DEFINITION_MAP[sectionCode as keyof typeof SECTION_DEFINITION_MAP];
  if (!definition) {
    console.error(`  Section definition not found for ${sectionCode}.`);
    return;
  }

  const content = fs.readFileSync(scriptFilePath, 'utf-8');
  const sectionSlug = sectionCode.toLowerCase();

  for (const control of definition.controls) {
    console.log(`  Registering ${control.id}: ${control.title}`);

    const isolatedScript = buildTargetedControlScript(content, control.id);
    const storagePath = `audit-scripts/${sectionSlug}/${control.id}.sh`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(isolatedScript), {
        contentType: 'text/x-shellscript',
        upsert: true,
      });

    if (uploadError) {
      console.error(`  Upload failed for ${control.id}: ${uploadError.message}`);
      continue;
    }

    await prisma.auditScript.upsert({
      where: {
        packId_controlId: {
          packId: pack.id,
          controlId: control.id,
        },
      },
      update: {
        title: control.title,
        section: control.section,
        scriptStoragePath: storagePath,
      },
      create: {
        packId: pack.id,
        controlId: control.id,
        title: control.title,
        section: control.section,
        assessmentType: 'Automated',
        scriptStoragePath: storagePath,
        createdById: leaderId,
      },
    });
  }

  console.log(`  ${sectionCode}: ${definition.controls.length} controls imported successfully.`);
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
