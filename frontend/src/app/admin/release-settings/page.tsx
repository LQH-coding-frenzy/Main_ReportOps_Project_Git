'use client';

export default function AdminReleaseSettingsPage() {
  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Release Settings</h1>
        <p className="page-subtitle">Cấu hình định dạng và nội dung phát hành</p>
      </div>

      {/* Release Format */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h4 style={{ marginBottom: 'var(--space-4)' }}>📦 Release Format</h4>
        <div className="admin-setting-group">
          <label className="label">Naming Convention</label>
          <div className="admin-setting-preview">
            <code className="admin-code" style={{ fontSize: 'var(--text-base)', padding: 'var(--space-3) var(--space-4)' }}>
              ReportOps-v{'{'} version {'}'}-{'{'} date {'}'}
            </code>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
            Ví dụ: ReportOps-v1.0.0-2026-05-06
          </p>
        </div>
      </div>

      {/* Artifacts */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h4 style={{ marginBottom: 'var(--space-4)' }}>📋 Artifacts đính kèm</h4>
        <div className="admin-artifacts-list">
          {[
            { name: 'Final Report PDF', icon: '📄', status: 'active' },
            { name: 'Final Report DOCX', icon: '📝', status: 'active' },
            { name: 'Audit Summary JSON', icon: '📊', status: 'upcoming' },
            { name: 'Audit HTML Report', icon: '🌐', status: 'upcoming' },
          ].map(artifact => (
            <div key={artifact.name} className="admin-artifact-item">
              <span style={{ fontSize: '1.25rem' }}>{artifact.icon}</span>
              <span style={{ flex: 1 }}>{artifact.name}</span>
              <span className={`badge ${artifact.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                {artifact.status === 'active' ? 'Active' : 'Upcoming'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* GitHub Integration */}
      <div className="card">
        <h4 style={{ marginBottom: 'var(--space-4)' }}>🔗 GitHub Release Integration</h4>
        <div className="admin-target-meta">
          <div className="admin-target-row">
            <span className="admin-target-label">Repository:</span>
            <code className="admin-code">LQH-coding-frenzy/Main_ReportOps_Project_Git</code>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Auto-publish:</span>
            <span className="badge badge-success">Enabled</span>
          </div>
          <div className="admin-target-row">
            <span className="admin-target-label">Checksum:</span>
            <span className="badge badge-info">SHA-256</span>
          </div>
        </div>
      </div>
    </div>
  );
}
