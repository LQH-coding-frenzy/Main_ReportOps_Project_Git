import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { downloadFile } from './storage';
import { isCanonicalPreviewDocxStorageKey } from './report-artifacts';

const prisma = new PrismaClient();

interface ReleaseResult {
  releaseId: number;
  version: string;
  githubReleaseUrl: string | null;
  success: boolean;
  error?: string;
}

/**
 * Create a GitHub Release with the report artifact.
 */
export async function createGitHubRelease(
  reportBuildId: number,
  version: string,
  notes: string
): Promise<ReleaseResult> {
  try {
    const build = await prisma.reportBuild.findUnique({
      where: { id: reportBuildId },
    });

    if (!build || build.status !== 'completed') {
      throw new Error('Report build not found or not completed');
    }

    if (build.buildType !== 'preview') {
      throw new Error('Only preview builds can be frozen into a release');
    }

    if (!build.storageKeyDocx) {
      throw new Error('Completed build has no DOCX artifact to release');
    }

    if (!isCanonicalPreviewDocxStorageKey(build.storageKeyDocx)) {
      throw new Error(
        'Build DOCX is not canonicalized via ONLYOFFICE yet. Open report viewer and use DOCX download once before freezing release.'
      );
    }

    // Sanitize tag name (GitHub doesn't allow spaces or special chars in tags)
    const sanitizedTag = version
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[^a-zA-Z0-9._-]/g, ''); // Remove other special chars except . and _

    if (!sanitizedTag) {
      throw new Error('Invalid version format: tag name cannot be empty after sanitization');
    }

    let githubReleaseUrl: string | null = null;

    // Create GitHub Release if token is configured
    if (env.GITHUB_TOKEN) {
      if (!env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) {
        throw new Error('GITHUB_REPO_OWNER and GITHUB_REPO_NAME must be configured to create a GitHub Release');
      }
      const releaseResponse = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/releases`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ReportOps-App',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tag_name: sanitizedTag,
            name: `CIS Benchmark Report ${version}`,
            body: notes || `Report released at ${new Date().toISOString()}`,
            draft: false,
            prerelease: false,
          }),
        }
      );

      if (releaseResponse.ok) {
        const releaseData = (await releaseResponse.json()) as { html_url: string; upload_url: string };
        githubReleaseUrl = releaseData.html_url;

        // Upload the .docx artifact to the release
        try {
          const fileBuffer = await downloadFile(build.storageKeyDocx);
          const uploadUrl = releaseData.upload_url.replace('{?name,label}', '');

          const uploadResponse = await fetch(`${uploadUrl}?name=CIS-Report-${version}.docx`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.GITHUB_TOKEN}`,
              'User-Agent': 'ReportOps-App',
              Accept: 'application/vnd.github+json',
              'Content-Type':
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
            body: new Uint8Array(fileBuffer),
          });

          if (!uploadResponse.ok) {
            const uploadErrorBody = await uploadResponse.text();
            throw new Error(`Failed to upload release artifact: ${uploadErrorBody}`);
          }
        } catch (uploadError) {
          throw new Error(
            uploadError instanceof Error
              ? uploadError.message
              : 'Failed to upload DOCX artifact to GitHub Release'
          );
        }
      } else {
        const errorBody = await releaseResponse.text();
        if (releaseResponse.status === 403) {
          throw new Error(
            `GitHub Release failed (403): Missing 'repo' scope or 'Contents:Write' permission on the token.`
          );
        }
        throw new Error(`GitHub Release creation failed: ${errorBody}`);
      }
    }

    // Generate checksum
    const crypto = await import('crypto');
    const buffer = await downloadFile(build.storageKeyDocx);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // Copy preview to final
    const finalKey = build.storageKeyDocx.replace('previews', 'final').replace('preview', 'final');
    const { uploadFile } = await import('./storage');
    await uploadFile(finalKey, buffer);

    await prisma.reportBuild.update({
      where: { id: build.id },
      data: {
        buildType: 'final',
        storageKeyDocx: finalKey,
      },
    });

    const release = await prisma.release.create({
      data: {
        reportBuildId: build.id,
        version,
        githubReleaseUrl,
        checksum,
        notes,
      },
    });

    return {
      releaseId: release.id,
      version,
      githubReleaseUrl,
      success: true,
    };
  } catch (error) {
    return {
      releaseId: 0,
      version,
      githubReleaseUrl: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
