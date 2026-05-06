'use client';

const SAMPLE_TARGETS = [
  { hostname: 'alma-lab-01', ip: '192.168.56.10', os: 'AlmaLinux 9', compliance: 78, risk: 'Medium', lastAudit: '2026-05-05T10:30:00Z' },
  { hostname: 'alma-prod-01', ip: '10.0.1.50', os: 'AlmaLinux 9', compliance: null, risk: null, lastAudit: null },
];

export default function AdminAuditTargetsPage() {
  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Audit Targets</h1>
        <p className="page-subtitle">Quản lý danh sách máy chủ cần quét bảo mật</p>
      </div>

      <div className="admin-toolbar">
        <button className="btn btn-primary" disabled title="Tính năng đang phát triển">
          + Thêm Target
        </button>
        <span className="badge badge-info">{SAMPLE_TARGETS.length} targets</span>
      </div>

      <div className="grid grid-2">
        {SAMPLE_TARGETS.map(target => (
          <div key={target.hostname} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
              <div>
                <h4 style={{ marginBottom: 'var(--space-1)' }}>{target.hostname}</h4>
                <code className="admin-code">{target.ip}</code>
              </div>
              {target.compliance !== null ? (
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 700,
                    color: target.compliance >= 80 ? 'var(--color-accent-success)' : target.compliance >= 60 ? 'var(--color-accent-warning)' : 'var(--color-accent-danger)'
                  }}>
                    {target.compliance}%
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Compliant</div>
                </div>
              ) : (
                <span className="badge badge-warning">Chưa quét</span>
              )}
            </div>

            <div className="admin-target-meta">
              <div className="admin-target-row">
                <span className="admin-target-label">OS:</span>
                <span>{target.os}</span>
              </div>
              {target.risk && (
                <div className="admin-target-row">
                  <span className="admin-target-label">Risk:</span>
                  <span className={`badge ${target.risk === 'High' ? 'badge-danger' : target.risk === 'Medium' ? 'badge-warning' : 'badge-success'}`}>
                    {target.risk}
                  </span>
                </div>
              )}
              <div className="admin-target-row">
                <span className="admin-target-label">Last audit:</span>
                <span>{target.lastAudit ? new Date(target.lastAudit).toLocaleString('vi-VN') : 'Chưa quét'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 'var(--space-6)', borderColor: 'rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.05)' }}>
        <p style={{ color: 'var(--color-accent-warning)', fontSize: 'var(--text-sm)', margin: 0 }}>
          ⚠️ Tính năng thêm/sửa/xóa target và kích hoạt quét bảo mật sẽ khả dụng khi module Audit Runner hoàn thành.
        </p>
      </div>
    </div>
  );
}
