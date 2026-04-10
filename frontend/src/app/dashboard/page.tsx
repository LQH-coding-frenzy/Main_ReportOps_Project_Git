'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { usePolling } from '../../hooks/usePolling';
import { getCurrentUser, getSections, logout } from '../../lib/api';
import type { User, Section } from '../../lib/types';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSections = useCallback(async () => {
    try {
      const s = await getSections();
      setSections(s);
    } catch (err) {
      console.error('Failed to fetch sections:', err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const u = await getCurrentUser();
        if (!u) {
          window.location.href = '/';
          return;
        }
        setUser(u);
        await fetchSections();
        setLoading(false);
      } catch {
        window.location.href = '/';
      }
    }
    init();
  }, [fetchSections]);

  // Global polling for Dashboard: refresh sections every 10s
  usePolling(fetchSections, 10000);

  const handleLogout = useCallback(async () => {
    await logout();
    window.location.href = '/';
  }, []);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải dashboard...</span>
      </div>
    );
  }

  if (!user) return null;

  const isLeader = user.role === 'LEADER';

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <a href="/dashboard" className="navbar-brand">
          <span className="navbar-brand-icon">📋</span>
          ReportOps
        </a>
        <ul className="navbar-nav">
          <li>
            <a href="/dashboard" className="navbar-link active">
              Dashboard
            </a>
          </li>
          {isLeader && (
            <>
              <li>
                <a href="/reports" className="navbar-link">
                  Reports
                </a>
              </li>
              <li>
                <a href="/releases" className="navbar-link">
                  Releases
                </a>
              </li>
            </>
          )}
        </ul>
        <div className="navbar-user">
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
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
        </div>
      </nav>

      {/* Page Content */}
      <div className="container page">
        <div className="page-header">
          <h1 className="page-title">
            {isLeader ? 'Tổng quan dự án' : 'Sections của bạn'}
          </h1>
          <p className="page-subtitle">
            CIS AlmaLinux OS 9 Benchmark v2.0.0 • Level 1 — Server
          </p>
        </div>

        {/* Stats for Leader */}
        {isLeader && (
          <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
            <div className="card">
              <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                {sections.length}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                Tổng sections
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--space-1)', color: 'var(--color-accent-success)' }}>
                {sections.filter((s) => s.document?.lastEditedAt).length}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                Đã có nội dung
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--space-1)', color: 'var(--color-accent-warning)' }}>
                {sections.filter((s) => !s.document?.lastEditedAt).length}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                Chưa bắt đầu
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                4
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                Thành viên
              </div>
            </div>
          </div>
        )}

        {/* Writing Guide Banner */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <a href="/guide" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.15) 100%)',
              borderColor: 'rgba(139, 92, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-6)',
              padding: 'var(--space-5) var(--space-8)'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--gradient-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                flexShrink: 0,
                boxShadow: 'var(--shadow-glow)'
              }}>
                📖
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--text-xl)', color: 'white', marginBottom: '4px' }}>Hướng dẫn Viết Report Quy chuẩn</h3>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', margin: 0 }}>
                  Dành 1 phút đọc guide này để đảm bảo file của bạn khi Leader ấn Build Preview sẽ không bị lỗi cấu trúc nhoe! Mẹo format đúng chuẩn để ăn điểm.
                </p>
              </div>
              <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <span className="btn btn-primary" style={{ pointerEvents: 'none' }}>Xem Guide ngay →</span>
              </div>
            </div>
          </a>
        </div>

        {/* Section Cards */}
        <div className="grid grid-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`/editor/${section.id}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="card section-card">
                <div className="section-code">{section.code}</div>
                <div className="section-title">{section.title}</div>

                {/* CIS Chapter Tags */}
                <div className="section-chapters">
                  {section.cisChapters.map((ch) => (
                    <span key={ch} className="chapter-tag">
                      §{ch}
                    </span>
                  ))}
                </div>

                {/* Status */}
                {section.document?.lastEditedAt ? (
                  <span className="badge badge-success" style={{ marginBottom: 'var(--space-3)' }}>
                    ✓ Đã chỉnh sửa
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ marginBottom: 'var(--space-3)' }}>
                    ○ Chưa bắt đầu
                  </span>
                )}

                {/* Footer */}
                <div className="section-meta">
                  <div className="section-assignee">
                    {section.assignees[0]?.avatarUrl && (
                      <Image 
                        src={section.assignees[0].avatarUrl} 
                        alt="" 
                        width={24} 
                        height={24} 
                        className="rounded-full"
                        unoptimized
                      />
                    )}
                    {section.assignees[0]?.displayName || section.assignees[0]?.githubUsername || 'Chưa gán'}
                  </div>
                  {section.document?.fileSize && (
                    <span className="text-xs text-muted">
                      {(section.document.fileSize / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>

                {section.document?.lastEditedAt && (
                  <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Cập nhật: {new Date(section.document.lastEditedAt).toLocaleString('vi-VN')}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>

        {sections.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">Không có section nào</div>
            <div className="empty-state-desc">
              Bạn chưa được gán section nào. Liên hệ Leader để được phân công.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
