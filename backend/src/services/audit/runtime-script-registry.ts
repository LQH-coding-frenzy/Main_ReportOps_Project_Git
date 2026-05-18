import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { env } from '../../config/env';
import { SECTION_DEFINITIONS } from '../../config/section-definitions';
import { resolveProjectRoot } from '../../config/project-answers';
import { supabase } from '../../config/supabase';
import { buildPackMetadata, getSectionDefinition } from './pack-registry';

export const LOCAL_MASTER_SCRIPT_PREFIX = 'local-master:';

export function buildTargetedControlScript(content: string, controlId: string): string {
  const scriptBody = content.replace(/^#!\/usr\/bin\/env bash\s*/, '');
  return ['#!/usr/bin/env bash', `export TARGET_CONTROL_ID="${controlId}"`, '', scriptBody].join('\n');
}

export function buildLocalMasterScriptStoragePath(relativePath: string): string {
  return `${LOCAL_MASTER_SCRIPT_PREFIX}${relativePath}`;
}

export function resolveLocalMasterScriptStoragePath(storagePath: string | null | undefined): string | null {
  if (!storagePath || !storagePath.startsWith(LOCAL_MASTER_SCRIPT_PREFIX)) {
    return null;
  }

  const relativePath = storagePath.slice(LOCAL_MASTER_SCRIPT_PREFIX.length).trim();
  return relativePath || null;
}

export function resolveLocalMasterScriptAbsolutePath(relativePath: string): string {
  return path.resolve(resolveProjectRoot(), relativePath);
}

export function localMasterScriptExists(relativePath: string | null | undefined): boolean {
  return Boolean(relativePath && fs.existsSync(resolveLocalMasterScriptAbsolutePath(relativePath)));
}

function buildStorageScriptPath(ownerSection: string, controlId: string): string {
  return `audit-scripts/${ownerSection.toLowerCase()}/${controlId}.sh`;
}

async function uploadRuntimeScript(storagePath: string, content: string): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  const { error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, Buffer.from(content, 'utf-8'), {
      contentType: 'text/x-shellscript',
      upsert: true,
    });

  return !error;
}

export async function ensureSectionRuntimeScripts(prisma: PrismaClient, ownerSection: string, createdById: number): Promise<number> {
  const metadata = buildPackMetadata(ownerSection);
  const definition = getSectionDefinition(ownerSection);

  if (!metadata || !definition || !localMasterScriptExists(definition.scriptPath)) {
    return 0;
  }

  const pack = await prisma.auditPack.findUnique({ where: { packId: metadata.packId } });
  if (!pack) {
    return 0;
  }

  const masterContent = fs.readFileSync(resolveLocalMasterScriptAbsolutePath(definition.scriptPath), 'utf-8');
  const localStoragePath = buildLocalMasterScriptStoragePath(definition.scriptPath);
  const existingScripts = await prisma.auditScript.findMany({
    where: { packId: pack.id },
    select: { id: true, controlId: true, scriptStoragePath: true, scriptSha256: true },
  });
  const existingScriptMap = new Map(existingScripts.map((script) => [script.controlId, script]));

  for (const control of definition.controls) {
    const targetedContent = buildTargetedControlScript(masterContent, control.id);
    const scriptSha256 = crypto.createHash('sha256').update(targetedContent).digest('hex');
    const storagePath = buildStorageScriptPath(ownerSection, control.id);
    const existingScript = existingScriptMap.get(control.id);

    let resolvedStoragePath = storagePath;
    const needsUpload = existingScript?.scriptStoragePath !== storagePath || existingScript.scriptSha256 !== scriptSha256;
    if (needsUpload) {
      const uploaded = await uploadRuntimeScript(storagePath, targetedContent);
      if (!uploaded) {
        resolvedStoragePath = localStoragePath;
      }
    }

    await prisma.auditScript.upsert({
      where: {
        packId_controlId: {
          packId: pack.id,
          controlId: control.id,
        },
      },
        create: {
          packId: pack.id,
          controlId: control.id,
          title: control.title,
          section: control.section,
          assessmentType: 'Automated',
          scriptStoragePath: resolvedStoragePath,
          scriptSha256,
          createdById,
        },
        update: {
          title: control.title,
          section: control.section,
          assessmentType: 'Automated',
          scriptStoragePath: resolvedStoragePath,
          scriptSha256,
          enabled: true,
        },
      });
  }

  return definition.controls.length;
}

export async function ensureManagedSectionRuntimeScripts(prisma: PrismaClient, createdById: number): Promise<void> {
  for (const definition of SECTION_DEFINITIONS) {
    await ensureSectionRuntimeScripts(prisma, definition.code, createdById);
  }
}
