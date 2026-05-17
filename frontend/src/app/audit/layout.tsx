'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { VM_OPS_TABS } from '../../lib/vm-ops';

function isTabActive(pathname: string, href: string): boolean {
  if (href === '/audit') {
    return pathname === '/audit' || pathname === '/audit/new' || pathname.startsWith('/audit/jobs/');
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AuditLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="main-content" style={{ paddingBottom: 0 }}>
        <div className="container" style={{ paddingBottom: 0 }}>
          <div className="card" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {VM_OPS_TABS.map((tab) => {
                const active = isTabActive(pathname, tab.href);

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`btn ${active ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
