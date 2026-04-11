import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { downloadFile } from './storage';

const prisma = new PrismaClient();

interface ReleaseResult {
  releaseId: number;
  version: string;
  githubReleaseUrl: string | null;
  success: boolean;
  error?: string;
}

interface GitHubReleaseResponse {
  id: number;
  html_url: string;
  upload_url: string;
}

interface GitHubDeleteResult {
  tag: string;
  releaseDeleted: boolean;
  tagDeleted: boolean;
}

function getGitHubApiBaseUrl(): string {
  if (!env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) {
    throw new Error('GITHUB_REPO_OWNER and GITHUB_REPO_NAME must be configured');
  }

  return `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
}

function getGitHubHeaders(): Record<string, string> {
  if (!env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN must be configured for GitHub release operations');
  }

  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ReportOps-App',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function readGitHubErrorBody(response: Response): Promise<string> {
  const body = await response.text();
  return body || `HTTP ${response.status}`;
}

export function sanitizeReleaseTag(version: string): string {
  return version
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

export async function deleteGitHubReleaseByVersion(version: string): Promise<GitHubDeleteResult> {
  const tag = sanitizeReleaseTag(version);
  if (!tag) {
    throw new Error('Invalid version format: tag name cannot be empty after sanitization');
  }

  const apiBase = getGitHubApiBaseUrl();
  const headers = getGitHubHeaders();
  let releaseDeleted = false;
  let tagDeleted = false;
  let releaseId: number | null = null;

  const getReleaseByTagResponse = await fetch(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`, {
    headers,
  });

  if (getReleaseByTagResponse.ok) {
    const releaseData = (await getReleaseByTagResponse.json()) as GitHubReleaseResponse;
    releaseId = releaseData.id;
  } else if (getReleaseByTagResponse.status !== 404) {
    throw new Error(
      `Failed to query GitHub release by tag: ${await readGitHubErrorBody(getReleaseByTagResponse)}`
    );
  }

  if (releaseId !== null) {
    const deleteReleaseResponse = await fetch(`${apiBase}/releases/${releaseId}`, {
      method: 'DELETE',
      headers,
    });

    if (deleteReleaseResponse.status === 204 || deleteReleaseResponse.status === 200) {
      releaseDeleted = true;
    } else if (deleteReleaseResponse.status !== 404) {
      throw new Error(
        `Failed to delete GitHub release: ${await readGitHubErrorBody(deleteReleaseResponse)}`
      );
    }
  }

  const deleteTagResponse = await fetch(`${apiBase}/git/refs/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
    headers,
  });

  if (deleteTagResponse.status === 204 || deleteTagResponse.status === 200) {
    tagDeleted = true;
  } else if (deleteTagResponse.status !== 404) {
    throw new Error(`Failed to delete Git tag: ${await readGitHubErrorBody(deleteTagResponse)}`);
  }

  return { tag, releaseDeleted, tagDeleted };
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

    // Sanitize tag name (GitHub doesn't allow spaces or special chars in tags)
    const sanitizedTag = sanitizeReleaseTag(version);

    if (!sanitizedTag) {
      throw new Error('Invalid version format: tag name cannot be empty after sanitization');
    }

    let githubReleaseUrl: string | null = null;

    // Create GitHub Release if token is configured
    if (env.GITHUB_TOKEN) {
      const apiBase = getGitHubApiBaseUrl();
      const headers = {
        ...getGitHubHeaders(),
        'Content-Type': 'application/json',
      };

      const releaseResponse = await fetch(
        `${apiBase}/releases`,
        {
          method: 'POST',
          headers,
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
        const releaseData = (await releaseResponse.json()) as GitHubReleaseResponse;
        githubReleaseUrl = releaseData.html_url;

        // Upload the .docx artifact to the release
        try {
          const fileBuffer = await downloadFile(build.storageKeyDocx);
          const uploadUrl = releaseData.upload_url.replace('{?name,label}', '');

          const uploadResponse = await fetch(`${uploadUrl}?name=CIS-Report-${version}.docx`, {
            method: 'POST',
            headers: {
              ...getGitHubHeaders(),
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
        const errorBody = await readGitHubErrorBody(releaseResponse);
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
