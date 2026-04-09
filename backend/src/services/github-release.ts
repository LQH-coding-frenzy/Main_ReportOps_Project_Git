import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { downloadFile, getSignedUrl } from './storage';

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

    let githubReleaseUrl: string | null = null;

    // Create GitHub Release if token is configured
    if (env.GITHUB_TOKEN && env.GITHUB_REPO_OWNER && env.GITHUB_REPO_NAME) {
      const releaseResponse = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/releases`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tag_name: version,
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
        if (build.storageKeyDocx) {
          try {
            const fileBuffer = await downloadFile(build.storageKeyDocx);
            const uploadUrl = releaseData.upload_url.replace('{?name,label}', '');

            await fetch(`${uploadUrl}?name=CIS-Report-${version}.docx`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                'Content-Type':
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              },
              body: new Uint8Array(fileBuffer),
            });
          } catch (uploadError) {
            console.error('Failed to upload artifact to GitHub Release:', uploadError);
          }
        }
      } else {
        const errorBody = await releaseResponse.text();
        console.error('GitHub Release creation failed:', errorBody);
      }
    }

    // Generate checksum
    const crypto = await import('crypto');
    let checksum: string | null = null;
    if (build.storageKeyDocx) {
      try {
        const buffer = await downloadFile(build.storageKeyDocx);
        checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      } catch {
        // Non-critical — continue without checksum
      }
    }

    // Copy preview to final
    if (build.storageKeyDocx) {
      const finalKey = build.storageKeyDocx.replace('previews', 'final').replace('preview', 'final');
      try {
        const buffer = await downloadFile(build.storageKeyDocx);
        const { uploadFile } = await import('./storage');
        await uploadFile(finalKey, buffer);

        await prisma.reportBuild.update({
          where: { id: build.id },
          data: {
            buildType: 'final',
            storageKeyDocx: finalKey,
          },
        });
      } catch {
        // Continue with original key
      }
    }

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
