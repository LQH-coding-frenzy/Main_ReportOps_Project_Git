const PREVIEW_CANONICAL_PREFIX = 'reports/previews/canonical/';
const FINAL_CANONICAL_PREFIX = 'reports/final/canonical/';

export function getCanonicalDocxStorageKey(buildId: number, buildType: string): string {
  if (buildType === 'final') {
    return `${FINAL_CANONICAL_PREFIX}build-${buildId}.docx`;
  }

  return `${PREVIEW_CANONICAL_PREFIX}build-${buildId}.docx`;
}

export function isCanonicalPreviewDocxStorageKey(storageKey: string): boolean {
  return storageKey.startsWith(PREVIEW_CANONICAL_PREFIX);
}
