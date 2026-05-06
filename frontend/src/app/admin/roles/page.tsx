'use client';

const ROLES = [
  { name: 'Admin', color: 'badge-danger', permissions: ['Toàn quyền hệ thống', 'Quản lý người dùng', 'Cấu hình hệ thống', 'Xem audit logs'], count: 0 },
  { name: 'Leader', color: 'badge-primary', permissions: ['Quản lý sections', 'Build/Freeze reports', 'Phân công thành viên', 'Xem tất cả nội dung'], count: 1 },
  { name: 'Member', color: 'badge-info', permissions: ['Chỉnh sửa section được gán', 'Xem hướng dẫn', 'Upload tài liệu'], count: 3 },
  { name: 'Auditor', color: 'badge-warning', permissions: ['Tạo audit targets', 'Chạy audit jobs', 'Xem kết quả quét', 'Quản lý credentials'], count: 0 },
  { name: 'Viewer', color: 'badge-success', permissions: ['Xem báo cáo', 'Xem releases', 'Xem dashboard'], count: 0 },
];

export default function AdminRolesPage() {
  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Quản Lý Vai Trò</h1>
        <p className="page-subtitle">Cấu hình quyền hạn cho từng vai trò trong hệ thống</p>
      </div>

      <div className="grid grid-2">
        {ROLES.map(role => (
          <div key={role.name} className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span className={`badge ${role.color}`} style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-4)' }}>
                  {role.name}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                  {role.count} người dùng
                </span>
              </div>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-3)' }}>
                Quyền hạn:
              </p>
              <ul className="admin-permission-list">
                {role.permissions.map(perm => (
                  <li key={perm} className="admin-permission-item">
                    <span className="admin-permission-check">✓</span>
                    {perm}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 'var(--space-6)', borderColor: 'rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.05)' }}>
        <p style={{ color: 'var(--color-accent-warning)', fontSize: 'var(--text-sm)', margin: 0 }}>
          ⚠️ Tính năng tuỳ chỉnh quyền hạn chi tiết sẽ được kích hoạt khi hệ thống Auto-Audit hoàn tất triển khai. Hiện tại, hệ thống sử dụng 2 vai trò chính: <strong>Leader</strong> và <strong>Member</strong>.
        </p>
      </div>
    </div>
  );
}
