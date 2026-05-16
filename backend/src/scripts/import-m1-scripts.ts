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
const M1_SCRIPT_PATH = path.join(resolveProjectRoot(), 'scripts', 'm1_base_server.sh');

function buildTargetedControlScript(content: string, controlId: string): string {
  const scriptBody = content.replace(/^#!\/usr\/bin\/env bash\s*/, '');
  return ['#!/usr/bin/env bash', `export TARGET_CONTROL_ID="${controlId}"`, '', scriptBody].join('\n');
}

async function importScripts() {
  console.log('Starting M1 script import from scripts/m1_base_server.sh...');

  const leader = await prisma.user.findFirst({ where: { role: Role.LEADER } });
  if (!leader) {
    console.error('No leader found. Seed users first.');
    return;
  }

  await syncSectionPacks(prisma);

  const metadata = buildPackMetadata('M1');
  if (!metadata) {
    console.error('M1 pack metadata is missing.');
    return;
  }

  const pack = await prisma.auditPack.findUnique({ where: { packId: metadata.packId } });
  if (!pack) {
    console.error('M1 audit pack was not created.');
    return;
  }

  const definition = SECTION_DEFINITION_MAP.M1;
  const content = fs.readFileSync(M1_SCRIPT_PATH, 'utf-8');

  for (const control of definition.controls) {
    console.log(`Registering ${control.id}: ${control.title}`);

    const isolatedScript = buildTargetedControlScript(content, control.id);
    const storagePath = `audit-scripts/m1/${control.id}.sh`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(isolatedScript), {
        contentType: 'text/x-shellscript',
        upsert: true,
      });

    if (uploadError) {
      console.error(`Upload failed for ${control.id}: ${uploadError.message}`);
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
        createdById: leader.id,
      },
    });
  }

  console.log('M1 controls imported successfully.');
}

importScripts()
  .catch((error) => console.error(error))
  .finally(() => prisma.$disconnect());
