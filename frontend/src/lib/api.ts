import type {
  ApiResponse,
  User,
  Section,
  EditorConfigResponse,
  ReportBuild,
  PreviewBuildTriggerResult,
  Release,
  PaginatedResponse,
  AuditLogEntry,
  PerformanceData,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Base fetch wrapper with credentials (cookies) and error handling.
 */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `API Error: ${res.status}`);
  }

  return res.json();
}

// ── Auth ──

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await apiFetch<ApiResponse<User>>('/api/auth/me');
    return res.data;
  } catch {
    return null;
  }
}

export function getLoginUrl(): string {
  return `${API_BASE}/api/auth/github/start`;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

// ── Sections ──

export async function getSections(): Promise<Section[]> {
  const res = await apiFetch<ApiResponse<Section[]>>('/api/sections');
  return res.data;
}

export async function getSection(id: number): Promise<Section> {
  const res = await apiFetch<ApiResponse<Section>>(`/api/sections/${id}`);
  return res.data;
}

// ── Editor ──

export async function getEditorConfig(sectionId: number): Promise<EditorConfigResponse> {
  const res = await apiFetch<EditorConfigResponse>(`/editor/config/${sectionId}`);
  return res.data;
}

export async function getReportEditorConfig(buildId: number): Promise<EditorConfigResponse> {
  const res = await apiFetch<EditorConfigResponse>(`/editor/config/report/${buildId}`);
  return res.data;
}

export async function submitReportBuild(): Promise<ReportBuild> {
  const res = await apiFetch<ApiResponse<ReportBuild[]>>('/api/reports');
  return res.data;
}

// ── Reports ──

export async function getReports(): Promise<ReportBuild[]> {
  const res = await apiFetch<ApiResponse<ReportBuild[]>>('/api/reports');
  return res.data;
}

export async function getReport(id: number): Promise<ReportBuild> {
  const res = await apiFetch<ApiResponse<ReportBuild>>(`/api/reports/${id}`);
  return res.data;
}

export async function triggerPreviewBuild(): Promise<PreviewBuildTriggerResult> {
  const res = await apiFetch<ApiResponse<PreviewBuildTriggerResult>>('/api/reports/preview', {
    method: 'POST',
  });
  return res.data;
}

export async function deleteReport(id: number): Promise<void> {
  await apiFetch(`/api/reports/${id}`, { method: 'DELETE' });
}

// ── Releases ──

export async function getReleases(): Promise<Release[]> {
  const res = await apiFetch<ApiResponse<Release[]>>('/api/releases');
  return res.data;
}

export async function freezeRelease(reportBuildId: number, version: string, notes?: string): Promise<Release> {
  const res = await apiFetch<ApiResponse<Release>>('/api/releases/freeze', {
    method: 'POST',
    body: JSON.stringify({ reportBuildId, version, notes }),
  });
  return res.data;
}

export async function deleteRelease(id: number): Promise<void> {
  await apiFetch(`/api/releases/${id}`, { method: 'DELETE' });
}

// ── Audit Logs ──

export async function getAuditLogs(page: number = 1, limit: number = 50): Promise<PaginatedResponse<AuditLogEntry>> {
  return apiFetch<PaginatedResponse<AuditLogEntry>>(`/api/audit-logs?page=${page}&limit=${limit}`);
}

// ── Performance ──

export async function getPerformance(): Promise<PerformanceData> {
  const res = await apiFetch<ApiResponse<PerformanceData>>('/api/reports/performance');
  return res.data;
}
