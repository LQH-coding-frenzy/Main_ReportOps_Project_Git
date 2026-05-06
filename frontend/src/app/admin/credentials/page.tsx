'use client';

const SAMPLE_CREDENTIALS = [
  { id: 1, target: 'alma-lab-01', type: 'SSH Key', createdBy: 'Leader', expiresAt: '2026-05-10', status: 'active' },
];

const SECURITY_RULES = [
  'Không lưu plaintext password',
  'Không log private key',
  'Credential có TTL (Time-To-Live)',
  'Có audit log khi credential được tạo/xoá/sử dụng',
];

export default function AdminCredentialsPage() {
  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Credentials Vault</h1>
        <p className="page-subtitle">Quản lý thông tin đăng nhập SSH cho các Audit Targets</p>
      </div>

      <div className="admin-toolbar">
        <button className="btn btn-primary" disabled title="Tính năng đang phát triển">
          + Thêm Credential
        </button>
        <span className="badge badge-info">{SAMPLE_CREDENTIALS.length} credential(s)</span>
      </div>

      {/* Credentials Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-6)' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Target</th>
              <th>Loại</th>
              <th>Tạo bởi</th>
              <th>Hết hạn</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_CREDENTIALS.map(cred => (
              <tr key={cred.id}>
                <td><code className="admin-code">{cred.target}</code></td>
                <td><span className="badge badge-info">{cred.type}</span></td>
                <td>{cred.createdBy}</td>
                <td>{cred.expiresAt}</td>
                <td>
                  <span className={`badge ${cred.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                    {cred.status === 'active' ? 'Active' : 'Expired'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Security Rules */}
      <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
        <h4 style={{ color: 'var(--color-accent-danger)', marginBottom: 'var(--space-3)' }}>🔐 Quy tắc Bảo mật</h4>
        <ul className="admin-permission-list">
          {SECURITY_RULES.map(rule => (
            <li key={rule} className="admin-permission-item">
              <span className="admin-permission-check" style={{ color: 'var(--color-accent-danger)' }}>✗</span>
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
