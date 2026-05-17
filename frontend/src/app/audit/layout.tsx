'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VM_OPS_TABS } from '../../lib/vm-ops';

function isTabActive(pathname: string, href: string): boolean {
  if (href === '/audit') {
    return pathname === '/audit' || pathname === '/audit/new' || pathname.startsWith('/audit/jobs/');
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getTabIcon(href: string): string {
  switch (href) {
    case '/audit':
      return '🧪';
    case '/audit/remediate':
      return '🛠️';
    case '/audit/not-applicable-fix':
      return '⏭️';
    case '/audit/reverse-remediate':
      return '↩️';
    default:
      return '⚙️';
  }
}

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="admin-layout">
      {/* Sidebar (Using admin classes to match the theme) */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-title">
            <span className="admin-sidebar-icon">💻</span>
            {!sidebarCollapsed && <span>VM Ops</span>}
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
          {VM_OPS_TABS.map((tab) => {
            const isActive = isTabActive(pathname, tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
                title={sidebarCollapsed ? tab.label : undefined}
              >
                <span className="admin-nav-icon">{getTabIcon(tab.href)}</span>
                {!sidebarCollapsed && (
                  <span className="admin-nav-label">{tab.label}</span>
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
