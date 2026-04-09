'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCurrentUser, getSections, logout } from '../../lib/api';
import type { User, Section } from '../../lib/types';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCurrentUser(), getSections()])
      .then(([u, s]) => {
        if (!u) {
          window.location.href = '/';
          return;
        }
        setUser(u);
        setSections(s);
        setLoading(false);
      })
      .catch(() => {
        window.location.href = '/';
      });
  }, []);

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
            <img src={user.avatarUrl} alt="Avatar" className="navbar-avatar" />
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
                      <img src={section.assignees[0].avatarUrl} alt="" />
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
