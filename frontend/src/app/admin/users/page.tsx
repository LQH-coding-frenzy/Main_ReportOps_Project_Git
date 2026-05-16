'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { getAdminUsers, setUserRoles } from '../../../lib/api';
import type { AdminUser } from '../../../lib/api';
import type { Role } from '../../../lib/types';
import { useToast } from '../../../components/ui/Toast';
import { ROLE_CATALOG, ROLE_LABEL_MAP } from '../../../lib/role-catalog';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<number, Role[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [changingRole, setChangingRole] = useState<number | null>(null);
  const { showToast } = useToast();

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAdminUsers();
      setUsers(data);
      setDraftRoles(
        Object.fromEntries(data.map((user) => [user.id, user.roles])) as Record<number, Role[]>
      );
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

  function toggleDraftRole(userId: number, role: Role) {
    setDraftRoles((current) => {
      const existing = current[userId] || [];
      const next = existing.includes(role)
        ? existing.filter((item) => item !== role)
        : [...existing, role];

      return {
        ...current,
        [userId]: next,
      };
    });
  }

  async function handleSaveRoles(user: AdminUser) {
    const nextRoles = draftRoles[user.id] || [];
    setChangingRole(user.id);

    try {
      await setUserRoles(user.id, nextRoles);
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? {
                ...item,
                role: nextRoles[0] || 'MEMBER',
                roles: nextRoles.length > 0 ? nextRoles : ['MEMBER'],
              }
            : item
        )
      );
      showToast('Đã cập nhật roles thành công', 'success');
      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      showToast(`Không thể cập nhật roles: ${msg}`, 'error');
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

  const filteredUsers = users.filter((user) =>
    (user.displayName ?? user.githubUsername).toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.githubUsername.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Quản Lý Người Dùng</h1>
        <p className="page-subtitle">Gán nhiều roles cho từng thành viên và theo dõi section assignment của nhóm</p>
      </div>

      <div className="admin-toolbar">
        <input
          type="text"
          className="input admin-search"
          placeholder="🔍 Tìm theo tên hoặc GitHub username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="admin-toolbar-actions">
          <span className="badge badge-info">{filteredUsers.length} người dùng</span>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>GitHub</th>
              <th>Roles hiện tại</th>
              <th>Sections</th>
              <th>Hoạt động gần nhất</th>
              <th>Gán roles</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const currentDraft = draftRoles[user.id] || [];
              const isLeaderAccount = user.githubUsername === 'LQH-coding-frenzy';
              const draftChanged = JSON.stringify([...currentDraft].sort()) !== JSON.stringify([...user.roles].sort());

              return (
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
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{user.email}</div>
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {user.roles.map((role) => (
                        <span key={role} className={`badge ${ROLE_LABEL_MAP[role].badgeClass}`}>
                          {ROLE_LABEL_MAP[role].label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {user.sections.length > 0 ? (
                        user.sections.map((section) => (
                          <span key={section.id} className="admin-chip">{section.code}</span>
                        ))
                      ) : (
                        <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Chưa gán</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                    {user.lastActive ? new Date(user.lastActive).toLocaleString('vi-VN') : <span className="text-muted">Chưa hoạt động</span>}
                  </td>
                  <td>
                    <div style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 320 }}>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {ROLE_CATALOG.map((entry) => {
                          const checked = currentDraft.includes(entry.role);
                          const disabled = changingRole === user.id || isLeaderAccount;

                          return (
                            <label
                              key={entry.role}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-text-secondary)',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleDraftRole(user.id, entry.role)}
                              />
                              <span>
                                <strong style={{ color: 'var(--color-text-primary)' }}>{entry.label}</strong>
                                <span style={{ display: 'block', marginTop: 2 }}>{entry.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!draftChanged || changingRole === user.id}
                          onClick={() => handleSaveRoles(user)}
                        >
                          {changingRole === user.id ? '⏳ Đang lưu...' : 'Lưu roles'}
                        </button>
                        {isLeaderAccount && (
                          <span className="badge badge-primary">Leader account locked</span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
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
        <span>Role hoạt động theo phép hợp. Nếu gán nhiều role, người dùng sẽ sử dụng tất cả quyền của các role đó.</span>
      </div>
    </div>
  );
}
