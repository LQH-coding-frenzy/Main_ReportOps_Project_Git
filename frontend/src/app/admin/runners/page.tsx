'use client';

const SAMPLE_RUNNERS = [
  {
    name: 'runner-01',
    status: 'Online',
    openscap: 'Installed',
    scapGuide: 'AlmaLinux 9 available',
    currentJobs: 0,
  },
];

export default function AdminRunnersPage() {
  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Audit Runners</h1>
        <p className="page-subtitle">Quản lý các node thực thi quét bảo mật OpenSCAP</p>
      </div>

      <div className="admin-toolbar">
        <button className="btn btn-primary" disabled title="Tính năng đang phát triển">
          + Đăng ký Runner
        </button>
        <span className="badge badge-info">{SAMPLE_RUNNERS.length} runner(s)</span>
      </div>

      <div className="grid grid-2">
        {SAMPLE_RUNNERS.map(runner => (
          <div key={runner.name} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h4>{runner.name}</h4>
              <span className={`badge ${runner.status === 'Online' ? 'badge-success' : 'badge-danger'}`}>
                ● {runner.status}
              </span>
            </div>

            <div className="admin-target-meta">
              <div className="admin-target-row">
                <span className="admin-target-label">OpenSCAP:</span>
                <span className="badge badge-success">{runner.openscap}</span>
              </div>
              <div className="admin-target-row">
                <span className="admin-target-label">SCAP Guide:</span>
                <span>{runner.scapGuide}</span>
              </div>
              <div className="admin-target-row">
                <span className="admin-target-label">Current Jobs:</span>
                <span style={{ fontWeight: 600 }}>{runner.currentJobs}</span>
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-secondary btn-sm" disabled>Kiểm tra kết nối</button>
              <button className="btn btn-ghost btn-sm" disabled>Xem logs</button>
            </div>
          </div>
        ))}

        {/* Empty Runner Slot */}
        <div className="card" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', opacity: 0.6 }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>➕</div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>Thêm runner mới</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 'var(--space-6)', borderColor: 'rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.05)' }}>
        <p style={{ color: 'var(--color-accent-warning)', fontSize: 'var(--text-sm)', margin: 0 }}>
          ⚠️ Module Audit Runner Engine cần Docker/VM với OpenSCAP và scap-security-guide (AlmaLinux 9) được cài đặt. Tham khảo kế hoạch triển khai Auto-Audit để biết chi tiết.
        </p>
      </div>
    </div>
  );
}
