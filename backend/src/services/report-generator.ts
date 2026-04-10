import { PrismaClient } from '@prisma/client';
import { downloadFile, uploadFile } from './storage';

const DocxMerger: {
  new (options: Record<string, unknown>, files: string[]): {
    save: (type: 'nodebuffer', callback: (data: Buffer) => void) => void;
  };
} = require('docx-merger');

const prisma = new PrismaClient();

async function mergeDocxBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) {
    return buffers[0];
  }

  const binaryFiles = buffers.map((buffer) => buffer.toString('binary'));
  const merger = new DocxMerger({}, binaryFiles);

  return new Promise<Buffer>((resolve, reject) => {
    try {
      merger.save('nodebuffer', (data: Buffer) => {
        resolve(Buffer.isBuffer(data) ? data : Buffer.from(data));
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
  status: 'completed' | 'failed';
  log: string;
}

/**
 * Build a preview report by collecting all section documents.
 */
export async function buildPreviewReport(triggeredById: number): Promise<ReportBuildResult> {
  const build = await prisma.reportBuild.create({
    data: {
      buildType: 'preview',
      status: 'building',
      triggeredById,
    },
  });

  const logs: string[] = [];

  try {
    // Get all sections ordered by sortOrder
    const sections = await prisma.section.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { documents: true },
    });

    const sectionBuffers: Array<{ code: string; buffer: Buffer }> = [];
    const missingSections: string[] = [];

    for (const section of sections) {
      const doc = section.documents[0];
      if (!doc) {
        const msg = `Section ${section.code}: No document found`;
        logs.push(`❌ ${msg}`);
        missingSections.push(section.code);
        continue;
      }

      try {
        const buffer = await downloadFile(doc.currentStorageKey);
        sectionBuffers.push({ code: section.code, buffer });
        logs.push(`✅ Section ${section.code}: Downloaded (${buffer.length} bytes)`);
      } catch (error) {
        logs.push(`❌ Section ${section.code}: Download failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
        missingSections.push(section.code);
      }
    }

    if (missingSections.length > 0) {
      throw new Error(`Missing or unreadable documents for sections: ${missingSections.join(', ')}`);
    }

    if (sectionBuffers.length === 0) {
      throw new Error('No section documents available for report generation');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const previewKey = `reports/previews/report-preview-${timestamp}.docx`;

    // Upload each section individually to the reports directory
    for (const { code, buffer } of sectionBuffers) {
      const sectionKey = `reports/previews/${timestamp}/section-${code}.docx`;
      await uploadFile(sectionKey, buffer);
      logs.push(`📁 Uploaded section ${code} to preview bundle`);
    }

    const mergedBuffer = await mergeDocxBuffers(sectionBuffers.map((s) => s.buffer));
    logs.push(
      `🧩 Merged ${sectionBuffers.length} sections into preview document (${mergedBuffer.length} bytes)`
    );

    await uploadFile(previewKey, mergedBuffer);

    const result = await prisma.reportBuild.update({
      where: { id: build.id },
      data: {
        status: 'completed',
        storageKeyDocx: previewKey,
        buildLog: logs.join('\n'),
        completedAt: new Date(),
      },
    });

    return {
      buildId: result.id,
      storageKeyDocx: previewKey,
      storageKeyPdf: null,
      status: 'completed',
      log: logs.join('\n'),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`❌ Build failed: ${errorMsg}`);

    await prisma.reportBuild.update({
      where: { id: build.id },
      data: {
        status: 'failed',
        buildLog: logs.join('\n'),
        completedAt: new Date(),
      },
    });

    return {
      buildId: build.id,
      storageKeyDocx: null,
      storageKeyPdf: null,
      status: 'failed',
      log: logs.join('\n'),
    };
  }
}
