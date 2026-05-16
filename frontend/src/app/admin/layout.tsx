'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCurrentUser } from '../../lib/api';
import type { User } from '../../lib/types';
import { hasCapability, type AppCapability } from '../../lib/system-roles';

const sidebarItems = [
  { label: 'Tổng quan', href: '/admin', icon: '📊', exact: true, capability: 'admin_panel' as AppCapability },
  { label: 'Người dùng', href: '/admin/users', icon: '👥', capability: 'manage_users' as AppCapability },
  { label: 'Vai trò', href: '/admin/roles', icon: '🛡️', capability: 'manage_roles' as AppCapability },
  { label: 'Sections', href: '/admin/sections', icon: '📑', capability: 'manage_sections' as AppCapability },
  { label: 'Audit Packs', href: '/admin/audit-packs', icon: '📦', capability: 'manage_audit_packs' as AppCapability },
  { label: 'Release Settings', href: '/admin/release-settings', icon: '🚀', capability: 'manage_releases' as AppCapability },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: '📜', capability: 'view_audit_logs' as AppCapability },
  { label: 'Cài đặt', href: '/admin/settings', icon: '⚡', capability: 'manage_settings' as AppCapability },
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
        if (!u) {
          window.location.href = '/dashboard';
          return;
        }

        const accessibleItems = sidebarItems.filter((item) => hasCapability(u, item.capability));
        if (accessibleItems.length === 0) {
          window.location.href = '/dashboard';
          return;
        }

        if (!hasCapability(u, 'admin_panel') && pathname === '/admin') {
          window.location.href = accessibleItems[0].href;
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
  }, [pathname]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang xác thực quyền Admin...</span>
      </div>
    );
  }

  if (!user) return null;

  const visibleItems = sidebarItems.filter((item) => hasCapability(user, item.capability));

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
          {visibleItems.map((item) => {
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
