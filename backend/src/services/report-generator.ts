import { PrismaClient } from '@prisma/client';
import { downloadFile, uploadFile } from './storage';

const prisma = new PrismaClient();

/**
 * Generate a merged report by concatenating all section documents.
 *
 * NOTE: True .docx merging requires a library like docx-merger or pandoc.
 * For MVP, we implement a simple approach:
 * 1. Download all section .docx files
 * 2. Store them as a ZIP bundle (sections included)
 * 3. In Phase 2+, use LibreOffice headless on the GCP VM for proper merge + PDF export
 *
 * For now, this creates a placeholder that tracks the build and stores individual sections.
 */

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

    for (const section of sections) {
      const doc = section.documents[0];
      if (!doc) {
        logs.push(`⚠️ Section ${section.code}: No document found, skipping`);
        continue;
      }

      try {
        const buffer = await downloadFile(doc.currentStorageKey);
        sectionBuffers.push({ code: section.code, buffer });
        logs.push(`✅ Section ${section.code}: Downloaded (${buffer.length} bytes)`);
      } catch (error) {
        logs.push(
          `❌ Section ${section.code}: Download failed - ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (sectionBuffers.length === 0) {
      throw new Error('No section documents available for report generation');
    }

    // For MVP: Upload the first section as the "preview" report
    // TODO: Replace with proper docx merging (using python-docx, pandoc, or LibreOffice on GCP VM)
    //
    // Proper merge approach (Phase 3):
    // 1. Install LibreOffice headless on GCP VM
    // 2. Use a merge script: merge all .docx → one .docx → convert to PDF
    // 3. Command: libreoffice --headless --convert-to pdf merged-report.docx
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const previewKey = `reports/previews/report-preview-${timestamp}.docx`;

    // Upload each section individually to the reports directory
    for (const { code, buffer } of sectionBuffers) {
      const sectionKey = `reports/previews/${timestamp}/section-${code}.docx`;
      await uploadFile(sectionKey, buffer);
      logs.push(`📁 Uploaded section ${code} to preview bundle`);
    }

    // Upload the first section as the main preview (placeholder for merge)
    await uploadFile(previewKey, sectionBuffers[0].buffer);

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
