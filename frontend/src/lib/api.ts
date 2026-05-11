import type {
  ApiResponse,
  User,
  Section,
  EditorConfigResponse,
  ReportBuild,
  PreviewBuildTriggerResult,
  ConsumedPreviewResult,
  Release,
  PaginatedResponse,
  AuditLogEntry,
  PerformanceData,
  LabVm,
  AuditPack,
  AuditJob,
  AuditEvidence,
  AuditScript,
  ScriptValidationResult,
} from './types';
import { projectConfig } from './project-config';

export interface ScriptValidationPreview {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

const API_BASE = projectConfig.backendUrl;

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
  const res = await apiFetch<ApiResponse<EditorConfigResponse>>(`/api/editor/config/${sectionId}`);
  return res.data;
}

export async function getReportEditorConfig(buildId: number): Promise<EditorConfigResponse> {
  const res = await apiFetch<ApiResponse<EditorConfigResponse>>(`/api/editor/config/report/${buildId}`);
  return res.data;
}

export async function submitReportBuild(): Promise<ReportBuild> {
  const res = await apiFetch<ApiResponse<ReportBuild>>('/api/reports', { method: 'POST' });
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

export async function consumePreviewBuild(buildId: number): Promise<ConsumedPreviewResult> {
  const res = await apiFetch<ApiResponse<ConsumedPreviewResult>>(`/api/reports/${buildId}/consume-preview`, {
    method: 'POST',
  });

  return res.data;
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

// ── Admin ──

export interface AdminUser {
  id: number;
  githubId: string;
  githubUsername: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: 'LEADER' | 'MEMBER';
  createdAt: string;
  sections: { id: number; code: string; title: string }[];
  lastActive: string | null;
}

export interface AdminStats {
  totalUsers: number;
  totalSections: number;
  totalBuilds: number;
  totalReleases: number;
  totalLogs: number;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await apiFetch<ApiResponse<AdminUser[]>>('/api/admin/users');
  return res.data;
}

export async function changeUserRole(userId: number, role: 'LEADER' | 'MEMBER'): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function adminAssignSection(sectionId: number, userId: number): Promise<void> {
  await apiFetch(`/api/sections/${sectionId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function adminUnassignSection(sectionId: number, userId: number): Promise<void> {
  await apiFetch(`/api/sections/${sectionId}/assign/${userId}`, {
    method: 'DELETE',
  });
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await apiFetch<ApiResponse<AdminStats>>('/api/admin/stats');
  return res.data;
}

// ═══════════════════════════════════════════════════
// Audit Jobs API
// ═══════════════════════════════════════════════════

export async function getAuditJobs(page = 1): Promise<{ jobs: AuditJob[]; pagination: { page: number; total: number; totalPages: number } }> {
  const res = await apiFetch<ApiResponse<{ jobs: AuditJob[]; pagination: { page: number; total: number; totalPages: number } }>>(`/api/audit-jobs?page=${page}`);
  return res.data;
}

export async function getAuditJob(id: number): Promise<AuditJob> {
  const res = await apiFetch<ApiResponse<AuditJob>>(`/api/audit-jobs/${id}`);
  return res.data;
}

export async function getAuditJobLogs(id: number): Promise<string> {
  const res = await apiFetch<ApiResponse<{ content: string }>>(`/api/audit-jobs/${id}/logs`);
  return res.data.content;
}

export async function getAuditJobEvidence(id: number): Promise<AuditEvidence[]> {
  const res = await apiFetch<ApiResponse<AuditEvidence[]>>(`/api/audit-jobs/${id}/evidence`);
  return res.data;
}

export async function getAuditJobEvidenceFile(jobId: number, evidenceId: number): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/audit-jobs/${jobId}/evidence/${evidenceId}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `API Error: ${res.status}`);
  }

  return res.blob();
}

export async function createAuditJob(vmId: number, mode: string): Promise<AuditJob> {
  const res = await apiFetch<ApiResponse<AuditJob>>('/api/audit-jobs', {
    method: 'POST',
    body: JSON.stringify({ vmId, mode, ownerSection: 'M1' }),
  });
  return res.data;
}

// ═══════════════════════════════════════════════════
// Lab VM API
// ═══════════════════════════════════════════════════

export async function getLabVms(): Promise<LabVm[]> {
  const res = await apiFetch<ApiResponse<LabVm[]>>('/api/lab/vms');
  return res.data;
}

export async function getLabVm(id: number): Promise<LabVm> {
  const res = await apiFetch<ApiResponse<LabVm>>(`/api/lab/vms/${id}`);
  return res.data;
}

export async function createLabVm(name: string, machineType?: string): Promise<LabVm> {
  const res = await apiFetch<ApiResponse<LabVm>>('/api/lab/vms', {
    method: 'POST',
    body: JSON.stringify({ name, machineType: machineType || 'e2-micro' }),
  });
  return res.data;
}

export async function deleteLabVm(id: number): Promise<void> {
  await apiFetch(`/api/lab/vms/${id}`, { method: 'DELETE' });
}

// ═══════════════════════════════════════════════════
// Audit Scripts / Packs API
// ═══════════════════════════════════════════════════

export async function getAuditPacks(): Promise<AuditPack[]> {
  const res = await apiFetch<ApiResponse<AuditPack[]>>('/api/audit-scripts/packs');
  return res.data;
}

export async function toggleAuditScript(id: number): Promise<void> {
  await apiFetch(`/api/audit-scripts/${id}/toggle`, { method: 'PATCH' });
}

export async function uploadAuditScript(formData: FormData): Promise<{ script: AuditScript; validation: ScriptValidationPreview }> {
  const res = await fetch(`${API_BASE}/api/audit-scripts/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `API Error: ${res.status}`);
  }

  const data = await res.json();
  return data.data;
}

export async function getScriptValidation(id: number): Promise<ScriptValidationResult> {
  const res = await apiFetch<ApiResponse<ScriptValidationResult>>(`/api/audit-scripts/${id}/validation`);
  return res.data;
}
