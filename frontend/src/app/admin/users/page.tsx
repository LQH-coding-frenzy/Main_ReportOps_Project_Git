'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { getAdminUsers, changeUserRole } from '../../../lib/api';
import type { AdminUser } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [changingRole, setChangingRole] = useState<number | null>(null);
  const { showToast } = useToast();

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
      showToast('Không thể tải danh sách người dùng', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleRoleChange(userId: number, newRole: 'LEADER' | 'MEMBER') {
    setChangingRole(userId);
    try {
      await changeUserRole(userId, newRole);
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, role: newRole } : u)
      );
      showToast(`Đã cập nhật vai trò thành công`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      showToast(`Không thể thay đổi vai trò: ${msg}`, 'error');
    } finally {
      setChangingRole(null);
    }
  }

  if (loading) {
    return (
      <div className="admin-content">
        <div className="admin-loading">
          <div className="spinner" />
          <span>Đang tải danh sách người dùng...</span>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u =>
    (u.displayName ?? u.githubUsername).toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.githubUsername.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Quản Lý Người Dùng</h1>
        <p className="page-subtitle">Thay đổi vai trò và theo dõi hoạt động thành viên</p>
      </div>

      {/* Toolbar */}
      <div className="admin-toolbar">
        <input
          type="text"
          className="input admin-search"
          placeholder="🔍 Tìm theo tên hoặc GitHub username..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <div className="admin-toolbar-actions">
          <span className="badge badge-info">{filteredUsers.length} người dùng</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>GitHub</th>
              <th>Vai trò hiện tại</th>
              <th>Sections</th>
              <th>Hoạt động gần nhất</th>
              <th>Đổi vai trò</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td>
                  <div className="admin-user-cell">
                    {user.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="admin-user-avatar"
                        unoptimized
                      />
                    ) : (
                      <div className="admin-user-avatar-placeholder">
                        {(user.displayName || user.githubUsername)[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                        {user.displayName || user.githubUsername}
                      </div>
                      {user.email && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          {user.email}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <a
                    href={`https://github.com/${user.githubUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-github-link"
                  >
                    @{user.githubUsername}
                  </a>
                </td>
                <td>
                  <span className={`badge ${user.role === 'LEADER' ? 'badge-primary' : 'badge-info'}`}>
                    {user.role === 'LEADER' ? '👑 Leader' : '👤 Member'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {user.sections.length > 0 ? (
                      user.sections.map(s => (
                        <span key={s.id} className="admin-chip">{s.code}</span>
                      ))
                    ) : (
                      <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Chưa gán</span>
                    )}
                  </div>
                </td>
                <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                  {user.lastActive
                    ? new Date(user.lastActive).toLocaleString('vi-VN')
                    : <span className="text-muted">Chưa hoạt động</span>
                  }
                </td>
                <td>
                  <select
                    className="admin-select"
                    value={user.role}
                    disabled={changingRole === user.id}
                    onChange={e => handleRoleChange(user.id, e.target.value as 'LEADER' | 'MEMBER')}
                  >
                    <option value="LEADER">Leader</option>
                    <option value="MEMBER">Member</option>
                  </select>
                  {changingRole === user.id && (
                    <span className="admin-saving-indicator">⏳</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Không tìm thấy người dùng</div>
          <div className="empty-state-desc">Thử tìm kiếm với từ khóa khác.</div>
        </div>
      )}

      <div className="admin-note">
        <span>ℹ️</span>
        <span>Thay đổi vai trò có hiệu lực ngay lập tức. Người dùng cần reload trang để áp dụng quyền mới.</span>
      </div>
    </div>
  );
}
