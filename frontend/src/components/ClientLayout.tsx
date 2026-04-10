'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from './Navbar';
import { ToastProvider } from './ui/Toast';
import { getCurrentUser } from '../lib/api';
import type { User } from '../lib/types';
import { usePathname } from 'next/navigation';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    // Only fetch if not on login page
    if (pathname === '/') {
      setLoadingUser(false);
      return;
    }
    
    async function fetchUser() {
      try {
        const u = await getCurrentUser();
        setUser(u);
      } catch (err) {
        console.error('Failed to fetch user in layout:', err);
      } finally {
        setLoadingUser(false);
      }
    }
    fetchUser();
  }, [pathname]);

  if (pathname !== '/' && loadingUser) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải...</span>
      </div>
    );
  }

  return (
    <ToastProvider>
      <Navbar user={user} />
      <main className="page-transition">
        {children}
      </main>
    </ToastProvider>
  );
}
