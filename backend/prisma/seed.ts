import { PrismaClient, Role } from '@prisma/client';

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
      githubId: 'placeholder-lqh', // TODO: Auto-populated on first login
      email: null,
    },
    {
      githubUsername: 'baongdqu',
      displayName: 'Bao Nguyên',
      role: Role.MEMBER,
      githubId: 'placeholder-bao', // TODO: Auto-populated on first login
      email: null,
    },
    {
      githubUsername: 'truongdaoanhduy',
      displayName: 'Trương Duy',
      role: Role.MEMBER,
      githubId: 'placeholder-duy', // TODO: Auto-populated on first login
      email: null,
    },
    {
      githubUsername: 'hpuoc',
      displayName: 'Lâm Hoàng Phước',
      role: Role.MEMBER,
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
      },
      create: userData,
    });
    createdUsers.push(user);
    console.log(`  ✅ User: ${user.displayName} (${user.githubUsername}) [${user.role}]`);
  }

  // ── Sections ──
  const sections = [
    {
      code: 'M1',
      title: 'Filesystem, Package, Boot, Process Hardening, Crypto, Time Sync, Scheduler',
      description:
        'CIS sections covering filesystem configuration, package management, bootloader hardening, process hardening, crypto policy, time synchronization, and job schedulers.',
      cisChapters: ['1.1', '1.2', '1.4', '1.5', '1.6', '2.3', '2.4'],
      sortOrder: 1,
      assigneeUsername: 'LQH-coding-frenzy',
    },
    {
      code: 'M2',
      title: 'SELinux, Services, Network, Firewall',
      description:
        'CIS sections covering SELinux configuration, service hardening, network parameters, and host-based firewall rules.',
      cisChapters: ['1.3', '2.1', '2.2', '3', '4'],
      sortOrder: 2,
      assigneeUsername: 'baongdqu',
    },
    {
      code: 'M3',
      title: 'SSH, Privilege Escalation, PAM, User Accounts',
      description:
        'CIS sections covering SSH server configuration, sudo/privilege escalation, pluggable authentication modules, and user account policies.',
      cisChapters: ['5.1', '5.2', '5.3', '5.4'],
      sortOrder: 3,
      assigneeUsername: 'truongdaoanhduy',
    },
    {
      code: 'M4',
      title: 'Banners, GDM, Logging/Auditing, System Maintenance',
      description:
        'CIS sections covering command line warning banners, GNOME Display Manager, system logging/auditing, and file integrity/maintenance.',
      cisChapters: ['1.7', '1.8', '6', '7'],
      sortOrder: 4,
      assigneeUsername: 'hpuoc',
    },
  ];

  for (const sectionData of sections) {
    const { assigneeUsername, ...data } = sectionData;

    const section = await prisma.section.upsert({
      where: { code: data.code },
      update: {
        title: data.title,
        description: data.description,
        cisChapters: data.cisChapters,
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
        fileName: `${section.code}-${section.title.split(',')[0].trim()}.docx`,
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
