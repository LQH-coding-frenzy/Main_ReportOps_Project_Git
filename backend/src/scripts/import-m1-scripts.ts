import { PrismaClient, Role } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents';
const SCRIPTS_DIR = path.join(__dirname, '../../../m1_audit_scripts_almalinux9/sections');

async function importScripts() {
  console.log('🚀 Starting M1 Scripts Import (Whole File Strategy)...');

  const leader = await prisma.user.findFirst({ where: { role: Role.LEADER } });
  if (!leader) {
    console.error('❌ No leader found.');
    return;
  }

  const pack = await prisma.auditPack.upsert({
    where: { packId: 'm1-standard' },
    update: {},
    create: {
      packId: 'm1-standard',
      ownerSection: 'M1',
      title: 'M1 Standard Audit Pack',
      sections: ['1.1', '1.2', '1.4', '1.5', '1.6', '2.3', '2.4'],
    },
  });

  const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.sh'));

  for (const file of files) {
    console.log(`\nProcessing section file ${file}...`);
    const fullPath = path.join(SCRIPTS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Find all control IDs in this file using regex
    const controlMatches = content.matchAll(/["']([0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)*)["']/g);
    const controlIds = new Set<string>();
    
    for (const match of controlMatches) {
        controlIds.add(match[1]);
    }

    if (controlIds.size === 0) {
        console.warn(`⚠️ No control IDs found in ${file}`);
        continue;
    }

    console.log(`  - Found ${controlIds.size} controls in this file.`);

    for (const controlId of controlIds) {
      // Find the title for this control (usually on the same line or next line)
      const titleRegex = new RegExp(`["']${controlId.replace(/\./g, '\\.')}["']\\s*,?\\s*["']([^"']+)["']`);
      const titleMatch = content.match(titleRegex);
      const title = titleMatch ? titleMatch[1] : `Audit Control ${controlId}`;
      
      const section = controlId.split('.').slice(0, 2).join('.');
      
      console.log(`    - Registering ${controlId}: ${title}`);

      const storagePath = `audit-scripts/m1/${controlId}.sh`;

      // Upload the WHOLE file content
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, Buffer.from(content), {
          contentType: 'text/x-shellscript',
          upsert: true,
        });

      if (uploadError) {
        console.error(`      ❌ Upload failed for ${controlId}:`, uploadError.message);
        continue;
      }

      // Register in DB
      await prisma.auditScript.upsert({
        where: {
          packId_controlId: {
            packId: pack.id,
            controlId: controlId,
          },
        },
        update: {
          title: title,
          section: section,
          scriptStoragePath: storagePath,
        },
        create: {
          packId: pack.id,
          controlId: controlId,
          title: title,
          section: section,
          assessmentType: 'Automated',
          scriptStoragePath: storagePath,
          createdById: leader.id,
        },
      });
    }
  }

  console.log('\n✨ All M1 scripts imported using Whole File Strategy!');
}

importScripts()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
