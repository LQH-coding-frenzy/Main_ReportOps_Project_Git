'use client';

import { useEffect, useState } from 'react';
import { getAdminUsers } from '../../../lib/api';
import { ROLE_CATALOG } from '../../../lib/role-catalog';

export default function AdminRolesPage() {
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const users = await getAdminUsers();
        const nextCounts = ROLE_CATALOG.reduce<Record<string, number>>((acc, entry) => {
          acc[entry.role] = 0;
          return acc;
        }, {});

        for (const user of users) {
          for (const role of user.roles) {
            nextCounts[role] = (nextCounts[role] || 0) + 1;
          }
        }

        setRoleCounts(nextCounts);
      } catch (error) {
        console.error('Failed to load role counts:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="admin-content">
        <div className="admin-loading">
          <div className="spinner" />
          <span>Đang tải role matrix...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Quản Lý Vai Trò</h1>
        <p className="page-subtitle">Ma trận 5 role thật của ReportOps sau bản cập nhật M1-M4</p>
      </div>

      <div className="grid grid-2">
        {ROLE_CATALOG.map((role) => (
          <div key={role.role} className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span className={`badge ${role.badgeClass}`} style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-4)' }}>
                  {role.label}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                  {roleCounts[role.role] || 0} người dùng
                </span>
              </div>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-3)' }}>
                {role.description}
              </p>
              <ul className="admin-permission-list">
                {role.permissions.map((permission) => (
                  <li key={permission} className="admin-permission-item">
                    <span className="admin-permission-check">✓</span>
                    {permission}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 'var(--space-6)', borderColor: 'rgba(99, 102, 241, 0.3)', background: 'rgba(99, 102, 241, 0.05)' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }}>
          Role hoạt động theo phép hợp. `LEADER` luôn là full access, còn các role khác cộng dồn quyền khi cùng được gán cho một người dùng.
        </p>
      </div>
    </div>
  );
}
