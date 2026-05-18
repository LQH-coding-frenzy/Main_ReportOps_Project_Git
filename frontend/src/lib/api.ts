import type {
  ApiResponse,
  Role,
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
  LabVmObservability,
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

type CsrfTokenResponse = ApiResponse<{ csrfToken: string }>;

const API_BASE = projectConfig.backendUrl;
let csrfTokenPromise: Promise<string> | null = null;

function isMutatingMethod(method?: string): boolean {
  const normalized = (method || 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(normalized);
}

function clearCsrfTokenCache(): void {
  csrfTokenPromise = null;
}

async function getCsrfToken(forceRefresh: boolean = false): Promise<string> {
  if (forceRefresh) {
    clearCsrfTokenCache();
  }

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch(`${API_BASE}/api/auth/csrf-token`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errorBody.error || `API Error: ${res.status}`);
        }

        const payload = await res.json() as CsrfTokenResponse;
        return payload.data.csrfToken;
      })
      .catch((error) => {
        clearCsrfTokenCache();
        throw error;
      });
  }

  return csrfTokenPromise;
}

/**
 * Base fetch wrapper with credentials (cookies) and error handling.
 */
async function apiFetch<T>(path: string, options?: RequestInit, allowCsrfRetry: boolean = true): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options?.headers);

  if (!headers.has('Content-Type') && !(options?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (isMutatingMethod(options?.method)) {
    headers.set('X-CSRF-Token', await getCsrfToken());
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));

    if (isMutatingMethod(options?.method) && allowCsrfRetry && res.status === 403 && errorBody.error === 'Invalid CSRF token') {
      await getCsrfToken(true);
      return apiFetch<T>(path, options, false);
    }

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
  clearCsrfTokenCache();
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
  role: Role;
  roles: Role[];
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
  roleBreakdown?: Record<string, number>;
  sectionBreakdown?: { code: string; assigneeCount: number }[];
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await apiFetch<ApiResponse<AdminUser[]>>('/api/admin/users');
  return res.data;
}

export async function setUserRoles(userId: number, roles: Role[]): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ roles }),
  });
}

export async function changeUserRole(userId: number, role: Role): Promise<void> {
  await setUserRoles(userId, [role]);
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

export async function createAuditJob(vmId: number, mode: string, ownerSection: string = 'M1'): Promise<AuditJob> {
  const res = await apiFetch<ApiResponse<AuditJob>>('/api/audit-jobs', {
    method: 'POST',
    body: JSON.stringify({ vmId, mode, ownerSection, jobType: 'AUDIT' }),
  });
  return res.data;
}

export async function createVmOpsOperationJob(
  sourceAuditJobId: number,
  operationType: 'REMEDIATION' | 'NOT_APPLICABLE_FIX' | 'REVERSE_REMEDIATE',
  selectedControlIds: string[]
): Promise<AuditJob> {
  const res = await apiFetch<ApiResponse<AuditJob>>(`/api/audit-jobs/${sourceAuditJobId}/operations`, {
    method: 'POST',
    body: JSON.stringify({ operationType, selectedControlIds }),
  });
  return res.data;
}

export async function createRemediationJob(sourceAuditJobId: number, selectedControlIds: string[] = []): Promise<AuditJob> {
  return createVmOpsOperationJob(sourceAuditJobId, 'REMEDIATION', selectedControlIds);
}

export async function cancelAuditJob(id: number): Promise<AuditJob> {
  const res = await apiFetch<ApiResponse<AuditJob>>(`/api/audit-jobs/${id}/cancel`, {
    method: 'POST',
  });
  return res.data;
}

export async function deleteAuditJob(id: number): Promise<void> {
  await apiFetch(`/api/audit-jobs/${id}`, { method: 'DELETE' });
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

export async function getLabVmObservability(id: number): Promise<LabVmObservability> {
  const res = await apiFetch<ApiResponse<LabVmObservability>>(`/api/lab/vms/${id}/observability`);
  return res.data;
}

export async function createLabVm(name: string, machineType?: string): Promise<LabVm> {
  const res = await apiFetch<ApiResponse<LabVm>>('/api/lab/vms', {
    method: 'POST',
    body: JSON.stringify({ name, machineType: machineType || 'e2-medium' }),
  });
  return res.data;
}

export async function deleteLabVm(id: number): Promise<void> {
  await apiFetch(`/api/lab/vms/${id}`, { method: 'DELETE' });
}

export async function purgeLabVmIndex(id: number): Promise<void> {
  await apiFetch(`/api/lab/vms/${id}/index`, { method: 'DELETE' });
}

export async function createLabVmSshSession(id: number): Promise<{ wsUrl: string }> {
  const res = await apiFetch<ApiResponse<{ wsUrl: string }>>(`/api/lab/vms/${id}/ssh/session`);
  return res.data;
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
  async function send(allowRetry: boolean): Promise<Response> {
    const token = await getCsrfToken(allowRetry ? false : true);
    const res = await fetch(`${API_BASE}/api/audit-scripts/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': token,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({ error: res.statusText }));
      if (allowRetry && res.status === 403 && errorBody.error === 'Invalid CSRF token') {
        await getCsrfToken(true);
        return send(false);
      }

      throw new Error(errorBody.error || `API Error: ${res.status}`);
    }

    return res;
  }

  const res = await send(true);
  const data = await res.json();
  return data.data;
}

export async function getScriptValidation(id: number): Promise<ScriptValidationResult> {
  const res = await apiFetch<ApiResponse<ScriptValidationResult>>(`/api/audit-scripts/${id}/validation`);
  return res.data;
}
