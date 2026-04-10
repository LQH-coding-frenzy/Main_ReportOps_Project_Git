// ═══════════════════════════════════════════════════
// ReportOps — Shared TypeScript Types
// Mirror of backend types for frontend consumption
// ═══════════════════════════════════════════════════

export type Role = 'LEADER' | 'MEMBER';

export interface User {
  id: number;
  githubId: string;
  githubUsername: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: Role;
  sections?: SectionSummary[];
}

export interface SectionSummary {
  id: number;
  code: string;
  title: string;
  cisChapters: string[];
}

export interface Section {
  id: number;
  code: string;
  title: string;
  description: string | null;
  cisChapters: string[];
  sortOrder: number;
  assignees: Assignee[];
  document: DocumentInfo | null;
}

export interface Assignee {
  id: number;
  githubUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface DocumentInfo {
  id: number;
  fileName: string;
  fileSize: number | null;
  wordCount: number | null;
  lastEditedAt: string | null;
  lastEditedBy: number | null;
  versions?: DocumentVersion[];
}

export interface DocumentVersion {
  id: number;
  storageKey: string;
  versionLabel: string | null;
  fileSize: number | null;
  createdAt: string;
  editedBy: {
    id: number;
    displayName: string | null;
    githubUsername: string;
  };
}

export interface EditorConfigResponse {
  config: OnlyOfficeConfig;
  documentServerUrl: string;
  section: {
    id: number;
    code: string;
    title: string;
  };
}

export interface OnlyOfficeConfig {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: {
      edit: boolean;
      download: boolean;
      print: boolean;
      review: boolean;
      comment: boolean;
    };
  };
  documentType: string;
  editorConfig: {
    callbackUrl: string;
    mode: string;
    lang: string;
    user: {
      id: string;
      name: string;
    };
    customization: Record<string, boolean>;
  };
  token?: string;
}

export interface ReportBuild {
  id: number;
  buildType: string;
  status: 'pending' | 'building' | 'completed' | 'failed';
  buildLog?: string | null;
  storageKeyDocx: string | null;
  storageKeyPdf: string | null;
  triggeredBy: {
    id: number;
    displayName: string | null;
    githubUsername: string;
  };
  release: Release | null;
  createdAt: string;
  completedAt: string | null;
  downloadUrlDocx?: string | null;
  downloadUrlPdf?: string | null;
}

export interface PerformanceUser {
  id: number;
  displayName: string | null;
  githubUsername: string;
  avatarUrl: string | null;
  role: Role;
  stats: {
    assignedSections: number;
    totalEdits: number;
    lastActive: string | null;
  };
}

export interface PerformanceData {
  users: PerformanceUser[];
  totalSections: number;
}

export interface Release {
  id: number;
  version: string;
  githubReleaseUrl: string | null;
  checksum: string | null;
  notes: string | null;
  createdAt: string;
  build?: {
    id: number;
    status: string;
    triggeredBy: {
      id: number;
      displayName: string | null;
      githubUsername: string;
    };
    createdAt: string;
  };
}

export interface AuditLogEntry {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: number;
    displayName: string | null;
    githubUsername: string;
    avatarUrl: string | null;
  };
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: {
    logs: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  status: number;
}
