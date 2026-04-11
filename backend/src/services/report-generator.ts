import { PrismaClient } from '@prisma/client';
import { createEmptyDocx, deleteFile, downloadFile, fileExists, uploadFile } from './storage';
import { Worker } from 'worker_threads';
import path from 'path';

const prisma = new PrismaClient();

const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PARALLEL_SECTION_IO = 4;
const ACTIVE_PREVIEW_BUILD_STATUSES = ['pending', 'building'] as const;
const PREVIEW_BUILD_LOCK_KEY = 47261591;

type ActivePreviewBuildStatus = (typeof ACTIVE_PREVIEW_BUILD_STATUSES)[number];

const buildQueue: number[] = [];
let queueWorkerRunning = false;
let activeBuildId: number | null = null;

function splitBuildLog(buildLog: string | null): string[] {
  if (!buildLog) return [];
  return buildLog
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function serializeBuildLog(lines: string[]): string | null {
  return lines.length > 0 ? lines.join('\n') : null;
}

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

async function mergeDocxBuffers(
  sections: Array<{ code: string; buffer: Buffer }>,
  fallbackBuffer: Buffer
): Promise<{ buffer: Buffer; recovered: string[] }> {
  if (sections.length === 1) {
    return { buffer: sections[0].buffer, recovered: [] };
  }

  return new Promise((resolve, reject) => {
    const isTsNode = process.argv.some(arg => arg.includes('ts-node'));
    const workerPath = path.resolve(
      __dirname, 
      isTsNode ? 'report-merger-worker.ts' : 'report-merger-worker.js'
    );

    const worker = new Worker(workerPath, {
      workerData: { sections, fallbackBuffer },
      execArgv: isTsNode ? ['-r', 'ts-node/register'] : undefined
    });

    worker.on('message', (message) => {
      if (message.status === 'success') {
        resolve({ buffer: message.data, recovered: message.recovered || [] });
      } else {
        reject(new Error(message.error || 'Unknown worker error'));
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

interface ReportBuildResult {
  buildId: number;
  storageKeyDocx: string | null;
  storageKeyPdf: string | null;
  status: ActivePreviewBuildStatus | 'completed' | 'failed';
  log: string;
  reusedExisting: boolean;
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

function enqueueBuild(buildId: number): void {
  if (activeBuildId === buildId || buildQueue.includes(buildId)) {
    return;
  }

  buildQueue.push(buildId);
  void drainBuildQueue();
}

async function drainBuildQueue(): Promise<void> {
  if (queueWorkerRunning) {
    return;
  }

  queueWorkerRunning = true;

  try {
    while (buildQueue.length > 0) {
      const nextBuildId = buildQueue.shift();
      if (typeof nextBuildId !== 'number') {
        continue;
      }

      activeBuildId = nextBuildId;

      try {
        await processReportBuild(nextBuildId);
      } catch (error) {
        console.error(`[Build #${nextBuildId}] Queue worker failed:`, error);
      } finally {
        activeBuildId = null;
      }
    }
  } finally {
    queueWorkerRunning = false;

    if (buildQueue.length > 0) {
      void drainBuildQueue();
    }
  }
}

export async function resumeInFlightPreviewBuilds(): Promise<number> {
  const restartMessage = '♻️ Server restart detected. Re-queued preview build.';

  const activeBuilds = await prisma.reportBuild.findMany({
    where: {
      buildType: 'preview',
      status: {
        in: [...ACTIVE_PREVIEW_BUILD_STATUSES],
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const build of activeBuilds) {
    const logs = splitBuildLog(build.buildLog);
    if (logs[logs.length - 1] !== restartMessage) {
      logs.push(restartMessage);
    }

    await prisma.reportBuild.update({
      where: { id: build.id },
      data: {
        status: 'pending',
        buildLog: serializeBuildLog(logs),
      },
    });

    enqueueBuild(build.id);
  }

  return activeBuilds.length;
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
  let timeout: NodeJS.Timeout | null = null;
  
  const updateLogs = async (newLog: string) => {
    logs.push(newLog);
    await prisma.reportBuild.update({
      where: { id: buildId },
      data: { buildLog: serializeBuildLog(logs) },
    });
  };

  try {
    const build = await prisma.reportBuild.findUnique({ where: { id: buildId } });
    if (!build || build.status === 'completed' || build.status === 'failed') {
      return;
    }

    logs.push(...splitBuildLog(build.buildLog));

    await prisma.reportBuild.update({
      where: { id: buildId },
      data: {
        status: 'building',
        completedAt: null,
        buildLog: serializeBuildLog(logs),
      },
    });

    // 5 minute timeout for the entire process
    timeout = setTimeout(async () => {
      timedOut = true;
      console.error(`${buildTag} Timed out after 5 minutes`);
      await prisma.reportBuild
        .update({
          where: { id: buildId },
          data: {
            status: 'failed',
            buildLog: serializeBuildLog([...logs, '❌ Error: Build timed out after 5 minutes.']),
            completedAt: new Date(),
          },
        })
        .catch(console.error);
    }, BUILD_TIMEOUT_MS);

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

    const fallback = createEmptyDocx();
    const { buffer: mergedBuffer, recovered } = await mergeDocxBuffers(orderedSectionBuffers, fallback);
    
    if (recovered.length > 0) {
      await updateLogs(`⚠️ Warning: Recovered ${recovered.length} corrupt sections with blank pages: ${recovered.join(', ')}`);
    }
    
    await updateLogs(`🧩 Merged ${orderedSectionBuffers.length} sections into preview document (${mergedBuffer.length} bytes)`);

    await uploadFile(finalPreviewKey, mergedBuffer);
    await updateLogs('📤 Uploaded final merged document to storage.');

    const durationMs = Date.now() - startedAt;
    await updateLogs(`⏱️ Completed in ${(durationMs / 1000).toFixed(1)}s.`);

    await prisma.reportBuild.update({
      where: { id: buildId },
      data: {
        status: 'completed',
        storageKeyDocx: finalPreviewKey,
        buildLog: serializeBuildLog(logs),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    if (timedOut) {
      return;
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`${buildTag} Failed:`, error); // Log full error object to console
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
        buildLog: serializeBuildLog(logs),
        completedAt: new Date(),
      },
    }).catch(console.error);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
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
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PREVIEW_BUILD_LOCK_KEY})`;

    const activeBuild = await tx.reportBuild.findFirst({
      where: {
        buildType: 'preview',
        status: {
          in: [...ACTIVE_PREVIEW_BUILD_STATUSES],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        storageKeyDocx: true,
        storageKeyPdf: true,
        buildLog: true,
      },
    });

    if (activeBuild) {
      return {
        buildId: activeBuild.id,
        storageKeyDocx: activeBuild.storageKeyDocx,
        storageKeyPdf: activeBuild.storageKeyPdf,
        status: activeBuild.status as ActivePreviewBuildStatus,
        log: activeBuild.buildLog || 'A preview build is already in progress.',
        reusedExisting: true,
      } satisfies ReportBuildResult;
    }

    const build = await tx.reportBuild.create({
      data: {
        buildType: 'preview',
        status: 'pending',
        triggeredById,
        buildLog: '🕒 Build queued. Waiting for processing...',
      },
    });

    return {
      buildId: build.id,
      storageKeyDocx: null,
      storageKeyPdf: null,
      status: 'pending',
      log: build.buildLog ?? 'Build queued.',
      reusedExisting: false,
    } satisfies ReportBuildResult;
  });

  enqueueBuild(result.buildId);
  return result;
}
