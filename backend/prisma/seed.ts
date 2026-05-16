import { PrismaClient, Role } from '@prisma/client';
import { SECTION_DEFINITIONS } from '../src/config/section-definitions';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Users ──
  // NOTE: githubId will be auto-updated on first OAuth login.
  // For now, using placeholder values that will be replaced.
  const users = [
    {
      githubUsername: 'LQH-coding-frenzy',
      displayName: 'Lại Quang Huy',
      role: Role.LEADER,
      roles: [Role.LEADER],
      githubId: 'placeholder-lqh', // TODO: Auto-populated on first login
      email: null,
    },
    {
      githubUsername: 'baongdqu',
      displayName: 'Bao Nguyên',
      role: Role.MEMBER,
      roles: [Role.MEMBER],
      githubId: 'placeholder-bao', // TODO: Auto-populated on first login
      email: null,
    },
    {
      githubUsername: 'truongdaoanhduy',
      displayName: 'Trương Duy',
      role: Role.MEMBER,
      roles: [Role.MEMBER],
      githubId: 'placeholder-duy', // TODO: Auto-populated on first login
      email: null,
    },
    {
      githubUsername: 'hpuoc',
      displayName: 'Lâm Hoàng Phước',
      role: Role.MEMBER,
      roles: [Role.MEMBER],
      githubId: 'placeholder-phuoc', // TODO: Auto-populated on first login
      email: null,
    },
  ];

  const createdUsers = [];
  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { githubUsername: userData.githubUsername },
      update: {
        displayName: userData.displayName,
        role: userData.role,
        roles: userData.roles,
      },
      create: userData,
    });
    createdUsers.push(user);
    console.log(`  ✅ User: ${user.displayName} (${user.githubUsername}) [${user.role}]`);
  }

  // ── Sections ──
  const sectionAssignees: Record<string, string> = {
    M1: 'LQH-coding-frenzy',
    M2: 'baongdqu',
    M3: 'truongdaoanhduy',
    M4: 'hpuoc',
  };

  const sections = SECTION_DEFINITIONS.map((definition, index) => ({
    code: definition.code,
    title: definition.title,
    description: definition.description,
    cisChapters: definition.cisChapters,
    controlIds: definition.controls.map((control) => control.id),
    sortOrder: index + 1,
    assigneeUsername: sectionAssignees[definition.code],
  }));

  for (const sectionData of sections) {
    const { assigneeUsername, ...data } = sectionData;

    const section = await prisma.section.upsert({
      where: { code: data.code },
      update: {
        title: data.title,
        description: data.description,
        cisChapters: data.cisChapters,
        controlIds: data.controlIds,
        sortOrder: data.sortOrder,
      },
      create: data,
    });

    // Create assignment
    const assignee = createdUsers.find((u) => u.githubUsername === assigneeUsername);
    if (assignee) {
      await prisma.sectionAssignment.upsert({
        where: {
          userId_sectionId: {
            userId: assignee.id,
            sectionId: section.id,
          },
        },
        update: {},
        create: {
          userId: assignee.id,
          sectionId: section.id,
        },
      });
    }

    // Create initial empty document record
    await prisma.document.upsert({
      where: { sectionId: section.id },
        update: {},
        create: {
          sectionId: section.id,
          currentStorageKey: `sections/${section.code}/current.docx`,
          fileName: `${section.code.toLowerCase()}-section.docx`,
        },
      });

    console.log(`  ✅ Section: ${section.code} → ${assigneeUsername}`);
  }

  console.log('\n🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
