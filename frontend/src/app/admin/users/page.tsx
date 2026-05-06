'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getPerformance } from '../../../lib/api';
import type { PerformanceData } from '../../../lib/types';

const ROLE_OPTIONS = ['Admin', 'Leader', 'Member', 'Auditor', 'Viewer'];

export default function AdminUsersPage() {
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const p = await getPerformance();
        setPerfData(p);
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải danh sách người dùng...</span>
      </div>
    );
  }

  const users = perfData?.users ?? [];
  const filteredUsers = users.filter(u =>
    (u.displayName ?? u.githubUsername).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Quản Lý Người Dùng</h1>
        <p className="page-subtitle">Danh sách thành viên và vai trò trong hệ thống</p>
      </div>

      {/* Toolbar */}
      <div className="admin-toolbar">
        <input
          type="text"
          className="input admin-search"
          placeholder="🔍 Tìm kiếm người dùng..."
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
              <th>Vai trò</th>
              <th>Sections</th>
              <th>Lần hoạt động cuối</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td>
                  <div className="admin-user-cell">
                    {user.avatarUrl && (
                      <Image
                        src={user.avatarUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="admin-user-avatar"
                        unoptimized
                      />
                    )}
                    <span>{user.displayName || user.githubUsername}</span>
                  </div>
                </td>
                <td>
                  <code className="admin-code">@{user.githubUsername}</code>
                </td>
                <td>
                  <span className={`badge ${user.role === 'LEADER' ? 'badge-primary' : 'badge-info'}`}>
                    {user.role}
                  </span>
                </td>
                <td>{user.stats.assignedSections}</td>
                <td>
                  {user.stats.lastActive
                    ? new Date(user.stats.lastActive).toLocaleString('vi-VN')
                    : <span className="text-muted">Chưa hoạt động</span>
                  }
                </td>
                <td>
                  <div className="admin-actions">
                    <select className="input admin-role-select" defaultValue={user.role} disabled title="Tính năng đang phát triển">
                      {ROLE_OPTIONS.map(r => (
                        <option key={r} value={r.toUpperCase()}>{r}</option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Không tìm thấy người dùng</div>
          <div className="empty-state-desc">Thử tìm kiếm với từ khóa khác.</div>
        </div>
      )}
    </div>
  );
}
