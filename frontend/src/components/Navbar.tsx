'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { User } from '../lib/types';

import { logout as apiLogout } from '../lib/api';
import { getEffectiveRoles, hasCapability } from '../lib/system-roles';

interface NavbarProps {
  user: User | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();

  const handleLogout = async () => {
    await apiLogout();
    window.location.href = '/';
  };

  // Don't show navbar on login page
  if (pathname === '/') return null;
  // Don't show on editor (it has its own custom compact header)
  if (pathname.startsWith('/editor')) return null;

  const roles = getEffectiveRoles(user);
  const roleLabel = roles.includes('LEADER') ? 'Leader' : roles.join(' + ');

  return (
    <nav className="navbar">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="navbar-brand">
          <span className="navbar-brand-icon">📋</span>
          ReportOps
        </Link>
        
        <ul className="navbar-nav">
          <li>
            <Link 
              href="/dashboard" 
              className={`navbar-link ${pathname === '/dashboard' ? 'active' : ''}`}
            >
              Dashboard
            </Link>
          </li>
          {hasCapability(user, 'view_reports') && (
            <li>
              <Link 
                href="/reports" 
                className={`navbar-link ${pathname === '/reports' ? 'active' : ''}`}
              >
                Reports
              </Link>
            </li>
          )}
          {hasCapability(user, 'view_releases') && (
            <li>
              <Link 
                href="/releases" 
                className={`navbar-link ${pathname === '/releases' ? 'active' : ''}`}
              >
                Releases
              </Link>
            </li>
          )}
          {hasCapability(user, 'manage_lab') && (
            <li>
              <Link 
                href="/lab" 
                className={`navbar-link ${pathname.startsWith('/lab') ? 'active' : ''}`}
              >
                Lab VMs
              </Link>
            </li>
          )}
          {hasCapability(user, 'run_audits') && (
            <li>
              <Link 
                href="/audit" 
                className={`navbar-link ${pathname.startsWith('/audit') ? 'active' : ''}`}
              >
                Auto Audit
              </Link>
            </li>
          )}
          {hasCapability(user, 'view_archive') && (
            <li>
              <Link 
                href="/archive" 
                className={`navbar-link ${pathname.startsWith('/archive') ? 'active' : ''}`}
              >
                Archives
              </Link>
            </li>
          )}
          {hasCapability(user, 'admin_panel') && (
            <li>
              <Link 
                href="/admin" 
                className={`navbar-link ${pathname.startsWith('/admin') ? 'active' : ''}`}
              >
                Admin
              </Link>
            </li>
          )}
        </ul>
      </div>

      <div className="navbar-user">
        {user && (
          <>
            <span className="text-sm text-secondary-text hidden sm:inline">
              {user.displayName || user.githubUsername}
            </span>
            <span className={`badge ${roles.includes('LEADER') ? 'badge-primary' : 'badge-info'}`}>
              {roleLabel}
            </span>
            {user.avatarUrl && (
              <Image 
                src={user.avatarUrl} 
                alt="Avatar" 
                className="navbar-avatar" 
                width={32} 
                height={32}
                unoptimized
              />
            )}
            <button onClick={handleLogout} className="btn btn-ghost btn-sm">
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
