'use client';

export default function AdminBenchmarksPage() {
  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Benchmarks</h1>
        <p className="page-subtitle">Quản lý chuẩn đánh giá bảo mật CIS</p>
      </div>

      {/* Current Benchmark */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <span className="badge badge-primary">Đang sử dụng</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Mặc định</span>
            </div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>CIS AlmaLinux OS 9 Benchmark v2.0.0</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', margin: 0 }}>
              Profile: <strong style={{ color: 'var(--color-text-secondary)' }}>Level 1 — Server</strong>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-accent-primary-hover)' }}>~400+</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Controls</div>
          </div>
        </div>
      </div>

      {/* Sample Controls Preview */}
      <h3 style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>Ví dụ Controls</h3>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Control ID</th>
              <th>Tiêu đề</th>
              <th>Section Owner</th>
              <th>Loại</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: '1.1.1.1', title: 'Ensure cramfs kernel module is not available', owner: 'M1', auto: true },
              { id: '1.1.2.1.2', title: 'Ensure nodev option set on /tmp partition', owner: 'M1', auto: true },
              { id: '5.1.20', title: 'Ensure sshd PermitRootLogin is disabled', owner: 'M3', auto: true },
              { id: '6.3.1.4', title: 'Ensure auditd service is enabled and active', owner: 'M4', auto: true },
            ].map(ctrl => (
              <tr key={ctrl.id}>
                <td><code className="admin-code">{ctrl.id}</code></td>
                <td style={{ fontSize: 'var(--text-sm)' }}>{ctrl.title}</td>
                <td><span className="admin-chip">{ctrl.owner}</span></td>
                <td>
                  <span className={`badge ${ctrl.auto ? 'badge-success' : 'badge-warning'}`}>
                    {ctrl.auto ? 'Automated' : 'Manual'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 'var(--space-6)', borderColor: 'rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.05)' }}>
        <p style={{ color: 'var(--color-accent-warning)', fontSize: 'var(--text-sm)', margin: 0 }}>
          ⚠️ Tính năng upload benchmark mới (XCCDF/OVAL) sẽ được kích hoạt khi hệ thống Auto-Audit hoàn tất triển khai.
        </p>
      </div>
    </div>
  );
}
