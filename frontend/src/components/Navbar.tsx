'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { User } from '../lib/types';

import { logout as apiLogout } from '../lib/api';

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

  const isLeader = user?.role === 'LEADER';

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
          {isLeader && (
            <>
              <li>
                <Link 
                  href="/reports" 
                  className={`navbar-link ${pathname === '/reports' ? 'active' : ''}`}
                >
                  Reports
                </Link>
              </li>
              <li>
                <Link 
                  href="/releases" 
                  className={`navbar-link ${pathname === '/releases' ? 'active' : ''}`}
                >
                  Releases
                </Link>
              </li>
              <li>
                <Link 
                  href="/performance" 
                  className={`navbar-link ${pathname === '/performance' ? 'active' : ''}`}
                >
                  Performance
                </Link>
              </li>
            </>
          )}
        </ul>
      </div>

      <div className="navbar-user">
        {user && (
          <>
            <span className="text-sm text-secondary-text hidden sm:inline">
              {user.displayName || user.githubUsername}
            </span>
            <span className={`badge ${isLeader ? 'badge-primary' : 'badge-info'}`}>
              {isLeader ? 'Leader' : 'Member'}
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
