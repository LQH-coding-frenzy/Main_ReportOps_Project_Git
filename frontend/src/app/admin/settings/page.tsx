'use client';

import { benchmarkLabel, projectConfig } from '../../../lib/project-config';

export default function AdminSettingsPage() {
  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Cài Đặt Hệ Thống</h1>
        <p className="page-subtitle">Cấu hình tích hợp, role engine và thông số vận hành cho ReportOps M1-M4</p>
      </div>

      {/* GitHub OAuth */}
      <div className="card admin-settings-section">
        <div className="admin-settings-header">
          <span className="admin-settings-icon">🔗</span>
          <div>
            <h4>GitHub OAuth</h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Xác thực người dùng qua GitHub</p>
          </div>
          <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Connected</span>
        </div>
        <div className="admin-target-meta" style={{ marginTop: 'var(--space-4)' }}>
          <div className="admin-target-row">
            <span className="admin-target-label">Client ID:</span>
            <code className="admin-code">Ov23li•••••••••</code>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Callback URL:</span>
            <code className="admin-code" style={{ fontSize: '11px' }}>{projectConfig.backendUrl}/api/auth/github/callback</code>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Frontend URL:</span>
            <code className="admin-code" style={{ fontSize: '11px' }}>{projectConfig.frontendUrl}</code>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Allowed org/users:</span>
            <span>Danh sách người dùng nhóm dự án, leader account được hard-lock riêng</span>
          </div>
        </div>
      </div>

      {/* ONLYOFFICE */}
      <div className="card admin-settings-section">
        <div className="admin-settings-header">
          <span className="admin-settings-icon">📝</span>
          <div>
            <h4>ONLYOFFICE Document Server</h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Chỉnh sửa tài liệu trực tuyến</p>
          </div>
          <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Healthy</span>
        </div>
        <div className="admin-target-meta" style={{ marginTop: 'var(--space-4)' }}>
          <div className="admin-target-row">
            <span className="admin-target-label">Document Server URL:</span>
            <code className="admin-code">{projectConfig.onlyOfficeUrl}</code>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">JWT Secret:</span>
            <span className="badge badge-success">Enabled</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Callback URL base:</span>
            <code className="admin-code">{projectConfig.backendUrl}/api/onlyoffice</code>
          </div>
        </div>
      </div>

      {/* Storage */}
      <div className="card admin-settings-section">
        <div className="admin-settings-header">
          <span className="admin-settings-icon">💾</span>
          <div>
            <h4>Storage (Supabase)</h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Lưu trữ file .docx và báo cáo</p>
          </div>
          <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Connected</span>
        </div>
        <div className="admin-target-meta" style={{ marginTop: 'var(--space-4)' }}>
          <div className="admin-target-row">
            <span className="admin-target-label">Blob provider:</span>
            <span>Supabase Storage</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Bucket:</span>
            <code className="admin-code">reportops-documents</code>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Project layout:</span>
            <span>`scripts/`, `manifests/`, `remediation/`, `logs/`, `screenshots/`</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Retention policy:</span>
            <span>Indefinite</span>
          </div>
        </div>
      </div>

      {/* Audit Settings */}
      <div className="card admin-settings-section" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <div className="admin-settings-header">
          <span className="admin-settings-icon">🎯</span>
          <div>
            <h4>Audit Engine</h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>Cấu hình quét bảo mật</p>
          </div>
          <span className="badge badge-success" style={{ marginLeft: 'auto' }}>M1 Live, M2-M4 Placeholder</span>
        </div>
        <div className="admin-target-meta" style={{ marginTop: 'var(--space-4)' }}>
          <div className="admin-target-row">
            <span className="admin-target-label">Default benchmark:</span>
            <span>{benchmarkLabel}</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Default profile:</span>
            <span>{projectConfig.benchmarkProfile}</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Role model:</span>
            <span>Leader, Admin, Auditor, Member, Viewer with union permissions</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Audit runtime:</span>
            <span>M1 có audit thật; M2-M4 đang là placeholder metadata/runtime</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Remediation runtime:</span>
            <span>M1 remediation script có thể chạy từ web app; các pack còn lại đang chờ nội dung thật</span>
          </div>
        </div>
      </div>
    </div>
  );
}
