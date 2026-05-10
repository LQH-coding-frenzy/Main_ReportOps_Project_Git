'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCurrentUser } from '../../lib/api';
import type { User } from '../../lib/types';

const sidebarItems = [
  { label: 'Tổng quan', href: '/admin', icon: '📊', exact: true },
  { label: 'Người dùng', href: '/admin/users', icon: '👥' },
  { label: 'Vai trò', href: '/admin/roles', icon: '🛡️' },
  { label: 'Sections', href: '/admin/sections', icon: '📑' },
  { label: 'Audit Packs', href: '/admin/audit-packs', icon: '📦' },
  { label: 'Release Settings', href: '/admin/release-settings', icon: '🚀' },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: '📜' },
  { label: 'Cài đặt', href: '/admin/settings', icon: '⚡' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const u = await getCurrentUser();
        if (!u || u.role !== 'LEADER') {
          window.location.href = '/dashboard';
          return;
        }
        setUser(u);
      } catch {
        window.location.href = '/';
      } finally {
        setLoading(false);
      }
    }
    checkAccess();
  }, []);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang xác thực quyền Admin...</span>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-title">
            <span className="admin-sidebar-icon">⚙️</span>
            {!sidebarCollapsed && <span>Admin Panel</span>}
          </div>
          <button
            className="admin-sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {sidebarItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="admin-nav-icon">{item.icon}</span>
                {!sidebarCollapsed && (
                  <span className="admin-nav-label">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="admin-sidebar-footer">
            <Link href="/dashboard" className="admin-back-link">
              ← Quay về Dashboard
            </Link>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
