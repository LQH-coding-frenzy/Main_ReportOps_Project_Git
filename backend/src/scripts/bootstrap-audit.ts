import { PrismaClient, Role } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents';

const M1_SCRIPTS = [
  {
    controlId: '1.1.1.1',
    title: 'Ensure mounting of cramfs filesystems is disabled',
    section: '1.1',
    content: `#!/bin/bash
echo "§1.1.1.1 Ensure mounting of cramfs filesystems is disabled"
output=$(modprobe -n -v cramfs 2>/dev/null)
if [[ "$output" == "install /bin/false" ]] || [[ -z "$output" ]]; then
  echo "PASS: cramfs is disabled"
  exit 0
else
  echo "FAIL: cramfs is enabled"
  echo "Current configuration: $output"
  exit 1
fi`,
  },
  {
    controlId: '1.2.1.2',
    title: 'Ensure gpgcheck is globally activated',
    section: '1.2',
    content: `#!/bin/bash
echo "§1.2.1.2 Ensure gpgcheck is globally activated"
if grep -q "^gpgcheck=1" /etc/dnf/dnf.conf; then
  echo "PASS: gpgcheck is enabled in /etc/dnf/dnf.conf"
  exit 0
else
  echo "FAIL: gpgcheck is NOT enabled in /etc/dnf/dnf.conf"
  exit 1
fi`,
  },
  {
    controlId: '2.3.1',
    title: 'Ensure chrony is configured',
    section: '2.3',
    content: `#!/bin/bash
echo "§2.3.1 Ensure chrony is configured"
if systemctl is-active --quiet chronyd; then
  echo "PASS: chronyd is active"
  exit 0
else
  echo "FAIL: chronyd is NOT active"
  exit 1
fi`,
  },
];

async function bootstrap() {
  console.log('🚀 Bootstrapping Audit Data...');

  // 1. Ensure Leader User exists
  const leader = await prisma.user.findFirst({ where: { role: Role.LEADER } });
  if (!leader) {
    console.error('❌ No leader found. Please seed users first.');
    return;
  }

  // 2. Create Audit Pack for M1
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
  console.log(`✅ Audit Pack created: ${pack.packId}`);

  // 3. Upload Scripts and Create Records
  for (const s of M1_SCRIPTS) {
    const storagePath = `audit-scripts/m1/${s.controlId}.sh`;

    // Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(s.content), {
        contentType: 'text/x-shellscript',
        upsert: true,
      });

    if (uploadError) {
      console.error(`❌ Failed to upload ${s.controlId}:`, uploadError.message);
      continue;
    }

    // Create DB record
    await prisma.auditScript.upsert({
      where: {
        packId_controlId: {
          packId: pack.id,
          controlId: s.controlId,
        },
      },
      update: {
        title: s.title,
        section: s.section,
        scriptStoragePath: storagePath,
      },
      create: {
        packId: pack.id,
        controlId: s.controlId,
        title: s.title,
        section: s.section,
        assessmentType: 'Automated',
        scriptStoragePath: storagePath,
        createdById: leader.id,
      },
    });

    console.log(`✅ Script ${s.controlId} uploaded and registered.`);
  }

  console.log('\n✨ Audit bootstrap complete!');
}

bootstrap()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
