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
  console.log('🚀 Starting M1 Scripts Import...');

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
    console.log(`\nProcessing ${file}...`);
    const fullPath = path.join(SCRIPTS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    // 1. Extract Header (everything before the first check call)
    let header = '';
    let firstCheckLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // A check call starts with check_ or print_ and has arguments, but NO opening brace
      if (line.match(/^(check_|print_)[a-zA-Z0-9_]+\s+"[0-9.]+"/) && !line.includes('{')) {
        firstCheckLineIndex = i;
        break;
      }
    }

    if (firstCheckLineIndex === -1) {
        console.warn(`⚠️ No check calls found in ${file}. Checking for direct calls...`);
        // Try even more lenient
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^[a-zA-Z0-9_]+\s+"[0-9.]+"/) && !lines[i].includes('{')) {
                firstCheckLineIndex = i;
                break;
            }
        }
    }

    if (firstCheckLineIndex === -1) {
        console.warn(`❌ Still no check calls found in ${file}`);
        continue;
    }

    header = lines.slice(0, firstCheckLineIndex).join('\n');

    // 2. Identify individual check calls
    for (let i = firstCheckLineIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#') || line === '') continue;

      // Match: func "control_id" "title" ...
      const match = line.match(/^([a-zA-Z0-9_]+)\s+"([0-9.]+)"\s+"([^"]+)"/);
      
      if (match) {
        const [fullCall, func, controlId, title] = match;
        
        const section = controlId.split('.').slice(0, 2).join('.');
        console.log(`  - Found control ${controlId}: ${title}`);

        const individualScriptContent = `#!/usr/bin/env bash\n${header}\n\n${line}\n`;
        const storagePath = `audit-scripts/m1/${controlId}.sh`;

        // Upload to Supabase
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, Buffer.from(individualScriptContent), {
            contentType: 'text/x-shellscript',
            upsert: true,
          });

        if (uploadError) {
          console.error(`    ❌ Upload failed for ${controlId}:`, uploadError.message);
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
  }

  console.log('\n✨ All M1 scripts imported successfully!');
}

importScripts()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
