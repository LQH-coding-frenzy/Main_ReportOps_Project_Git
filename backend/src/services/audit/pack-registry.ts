import type { PrismaClient } from '@prisma/client';
import { SECTION_DEFINITION_MAP, SECTION_DEFINITIONS } from '../../config/section-definitions';

const REAL_PACK_CODES = new Set(['M1', 'M2', 'M3', 'M4']);

export const MANAGED_PACK_IDS = SECTION_DEFINITIONS.map((definition) => buildManagedPackId(definition.code, definition.title));

function buildManagedPackId(code: string, title: string): string {
  return `${code.toLowerCase()}-${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;
}

export function getSectionDefinition(ownerSection: string) {
  return SECTION_DEFINITION_MAP[ownerSection as keyof typeof SECTION_DEFINITION_MAP] || null;
}

export function buildPackMetadata(ownerSection: string) {
  const definition = getSectionDefinition(ownerSection);
  if (!definition) {
    return null;
  }

  return {
    packId: buildManagedPackId(definition.code, definition.title),
    ownerSection: definition.code,
    title: definition.title,
    sections: definition.cisChapters,
    manifestPath: definition.manifestPath,
    auditScriptPath: definition.scriptPath,
    remediationPath: definition.remediationPath,
    isPlaceholder: !REAL_PACK_CODES.has(definition.code),
  };
}

export async function syncSectionPacks(prisma: PrismaClient) {
  const results = [];

  await prisma.auditPack.updateMany({
    where: {
      ownerSection: { in: SECTION_DEFINITIONS.map((definition) => definition.code) },
      packId: { notIn: MANAGED_PACK_IDS },
    },
    data: {
      enabled: false,
    },
  });

  for (const definition of SECTION_DEFINITIONS) {
    const metadata = buildPackMetadata(definition.code);
    if (!metadata) {
      continue;
    }

    const pack = await prisma.auditPack.upsert({
      where: { packId: metadata.packId },
      create: {
        packId: metadata.packId,
        ownerSection: metadata.ownerSection,
        title: metadata.title,
        sections: metadata.sections,
        manifestPath: metadata.manifestPath,
        auditScriptPath: metadata.auditScriptPath,
        remediationPath: metadata.remediationPath,
        isPlaceholder: metadata.isPlaceholder,
      },
      update: {
        ownerSection: metadata.ownerSection,
        title: metadata.title,
        sections: metadata.sections,
        manifestPath: metadata.manifestPath,
        auditScriptPath: metadata.auditScriptPath,
        remediationPath: metadata.remediationPath,
        isPlaceholder: metadata.isPlaceholder,
        enabled: true,
      },
    });

    results.push(pack);
  }

  return results;
}
