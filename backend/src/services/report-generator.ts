import { PrismaClient } from '@prisma/client';
import { createEmptyDocx, deleteFile, downloadFile, fileExists, uploadFile } from './storage';

/* eslint-disable @typescript-eslint/no-require-imports */
const DocxMerger: {
  new (options: Record<string, unknown>, files: unknown[]): {
    save: (type: 'nodebuffer', callback: (data: unknown) => void) => void;
  };
} = require('docx-merger');
/* eslint-enable @typescript-eslint/no-require-imports */

const prisma = new PrismaClient();

const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PARALLEL_SECTION_IO = 4;

async function runWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;

  let cursor = 0;
  const slots = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(slots);
}

async function mergeDocxBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) {
    return buffers[0];
  }

  // Convert buffers to binary strings for docx-merger compatibility
  const binaryFiles = buffers.map((buffer) => buffer.toString('binary'));
  const merger = new DocxMerger({}, binaryFiles);

  return new Promise<Buffer>((resolve, reject) => {
    try {
      merger.save('nodebuffer', (data: unknown) => {
        resolve(Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary'));
      });
    } catch (error) {
      reject(error);
    }
  });
}

interface ReportBuildResult {
  buildId: number;
  storageKeyDocx: string | null;
  storageKeyPdf: string | null;
  status: 'building' | 'completed' | 'failed';
  log: string;
}

async function ensureDocumentForSection(section: {
  id: number;
  code: string;
  title: string;
  documents: Array<{ id: number; currentStorageKey: string; fileName: string }>;
}): Promise<{ storageKey: string; fileName: string }> {
  const existing = section.documents[0];

  if (existing) {
    return {
      storageKey: existing.currentStorageKey,
      fileName: existing.fileName,
    };
  }

  const fallbackFileName = `${section.code}-${section.title.split(',')[0].trim()}.docx`;
  const fallbackStorageKey = `sections/${section.code}/current.docx`;

  const created = await prisma.document.create({
    data: {
      sectionId: section.id,
      currentStorageKey: fallbackStorageKey,
      fileName: fallbackFileName,
      fileSize: 0,
    },
  });

  return {
    storageKey: created.currentStorageKey,
    fileName: created.fileName,
  };
}

/**
 * Build a preview report by collecting all section documents.
 */
/**
 * Background task to process the report merging logic.
 */
async function processReportBuild(buildId: number): Promise<void> {
  const logs: string[] = [];
  let timedOut = false;
  let finalPreviewKey: string | null = null;
  const perSectionSnapshotKeys: string[] = [];
  const startedAt = Date.now();
  const buildTag = `[Build #${buildId}]`;
  
  const updateLogs = async (newLog: string) => {
    logs.push(newLog);
    await prisma.reportBuild.update({
      where: { id: buildId },
      data: { buildLog: logs.join('\n') },
    });
  };
  
  // 5 minute timeout for the entire process
  const timeout = setTimeout(async () => {
    timedOut = true;
    console.error(`${buildTag} Timed out after 5 minutes`);
    await prisma.reportBuild.update({
      where: { id: buildId },
      data: {
        status: 'failed',
        buildLog: logs.join('\n') + '\n❌ Error: Build timed out after 5 minutes.',
        completedAt: new Date(),
      },
    }).catch(console.error);
  }, BUILD_TIMEOUT_MS);

  try {
    const build = await prisma.reportBuild.findUnique({ where: { id: buildId } });
    if (!build) return;

    await updateLogs('🚀 Starting report generation process...');

    // Get all sections ordered by sortOrder
    const sections = await prisma.section.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { documents: true },
    });

    const sectionBuffers: Array<{ code: string; buffer: Buffer } | undefined> = [];
    const missingSections: string[] = [];

    const indexedSections = sections.map((section, index) => ({ section, index }));

    await runWithConcurrencyLimit(indexedSections, MAX_PARALLEL_SECTION_IO, async ({ section, index }) => {
      if (timedOut) return;

      const { storageKey } = await ensureDocumentForSection(section);
      const localEmptyDoc = createEmptyDocx();

      try {
        const exists = await fileExists(storageKey);
        if (!exists) {
          await uploadFile(storageKey, localEmptyDoc);
          await updateLogs(`🧱 Section ${section.code}: initialized missing document in storage`);
        }

        const buffer = await downloadFile(storageKey);
        sectionBuffers[index] = { code: section.code, buffer };
        await updateLogs(`✅ Section ${section.code}: Downloaded (${buffer.length} bytes)`);
      } catch (error) {
        try {
          await uploadFile(storageKey, localEmptyDoc);
          sectionBuffers[index] = { code: section.code, buffer: localEmptyDoc };
          await updateLogs(`⚠️ Section ${section.code}: recovered with empty document after download failure`);
        } catch {
          await updateLogs(
            `❌ Section ${section.code}: Download failed - ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          missingSections.push(section.code);
        }
      }
    });

    if (timedOut) {
      return;
    }

    const orderedSectionBuffers = sectionBuffers.filter(
      (item): item is { code: string; buffer: Buffer } => Boolean(item)
    );

    if (missingSections.length > 0) {
      throw new Error(`Missing or unreadable documents for sections: ${missingSections.join(', ')}`);
    }

    if (orderedSectionBuffers.length === 0) {
      throw new Error('No section documents available for report generation');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    finalPreviewKey = `reports/previews/report-preview-${timestamp}.docx`;

    // Upload each section individually to the reports directory
    for (const { code, buffer } of orderedSectionBuffers) {
      const sectionKey = `reports/previews/${timestamp}/section-${code}.docx`;
      await uploadFile(sectionKey, buffer);
      perSectionSnapshotKeys.push(sectionKey);
    }
    await updateLogs(`📁 Uploaded ${orderedSectionBuffers.length} sections to preview bundle metadata`);

    const validSections = orderedSectionBuffers.filter((s) => {
      // Skip placeholders that are known to be corrupted or empty
      if (s.buffer.length < 2000) {
        logs.push(
          `ℹ️ Section ${s.code}: Skipped merging. File size (${s.buffer.length} bytes) is below the 2KB threshold.`
        );
        return false;
      }
      return true;
    });

    if (validSections.length === 0) {
      const fallbackDoc = createEmptyDocx();
      await uploadFile(finalPreviewKey, fallbackDoc);
      await updateLogs('ℹ️ All sections are currently empty. Published an empty preview template.');

      await prisma.reportBuild.update({
        where: { id: buildId },
        data: {
          status: 'completed',
          storageKeyDocx: finalPreviewKey,
          buildLog: logs.join('\n'),
          completedAt: new Date(),
        },
      });
      return;
    }

    const mergedBuffer = await mergeDocxBuffers(validSections.map((s) => s.buffer));
    await updateLogs(`🧩 Merged ${validSections.length} sections into preview document (${mergedBuffer.length} bytes)`);

    await uploadFile(finalPreviewKey, mergedBuffer);
    await updateLogs('📤 Uploaded final merged document to storage.');

    const durationMs = Date.now() - startedAt;
    await updateLogs(`⏱️ Completed in ${(durationMs / 1000).toFixed(1)}s.`);

    await prisma.reportBuild.update({
      where: { id: buildId },
      data: {
        status: 'completed',
        storageKeyDocx: finalPreviewKey,
        buildLog: logs.join('\n'),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    if (timedOut) {
      return;
    }

    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${buildTag} Failed:`, errorMsg);
    logs.push(`❌ Build failed: ${errorMsg}`);

    if (finalPreviewKey) {
      await deleteFile(finalPreviewKey).catch(() => undefined);
    }
    if (perSectionSnapshotKeys.length > 0) {
      await Promise.all(perSectionSnapshotKeys.map((key) => deleteFile(key).catch(() => undefined)));
    }

    await prisma.reportBuild.update({
      where: { id: buildId },
      data: {
        status: 'failed',
        buildLog: logs.join('\n'),
        completedAt: new Date(),
      },
    }).catch(console.error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Delete a report build and its associated storage files.
 */
export async function deleteReportBuild(id: number): Promise<void> {
  const build = await prisma.reportBuild.findUnique({
    where: { id },
    include: { release: true },
  });

  if (!build) throw new Error('Report build not found');
  if (build.release) throw new Error('Cannot delete a build that is linked to a release');

  // Delete from storage
  const { deleteFile } = await import('./storage');
  if (build.storageKeyDocx) {
    await deleteFile(build.storageKeyDocx).catch(console.error);
  }
  if (build.storageKeyPdf) {
    await deleteFile(build.storageKeyPdf).catch(console.error);
  }

  // Delete from DB
  await prisma.reportBuild.delete({ where: { id } });
}

/**
 * Build a preview report by collecting all section documents.
 * This function is now asynchronous and returns the initial build record immediately.
 */
export async function buildPreviewReport(triggeredById: number): Promise<ReportBuildResult> {
  const build = await prisma.reportBuild.create({
    data: {
      buildType: 'preview',
      status: 'building',
      triggeredById,
    },
  });

  // Start background process without awaiting it
  processReportBuild(build.id).catch((err) => {
    console.error(`Fatal background build error for #${build.id}:`, err);
  });

  return {
    buildId: build.id,
    storageKeyDocx: null,
    storageKeyPdf: null,
    status: 'building', // Return current status
    log: 'Build initialized...',
  };
}
