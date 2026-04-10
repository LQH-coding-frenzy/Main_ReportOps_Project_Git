'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, getLoginUrl } from '../lib/api';
import type { User } from '../lib/types';

function getAuthErrorFromQuery(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const err = params.get('error');
  if (!err) return null;

  if (err === 'auth_failed') return 'Đăng nhập thất bại. Vui lòng thử lại.';
  if (err === 'invalid_state') return 'Phiên đăng nhập không hợp lệ. Vui lòng thử lại.';
  return 'Có lỗi xảy ra. Vui lòng thử lại.';
}

export default function LoginPage() {
  const [checking, setChecking] = useState(true);
  const [error] = useState<string | null>(getAuthErrorFromQuery);

  useEffect(() => {
    // Check if already logged in
    getCurrentUser()
      .then((user) => {
        if (user) {
          window.location.href = '/dashboard';
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang kiểm tra phiên đăng nhập...</span>
      </div>
    );
  }

  return (
    <main className="login-page">
      <div className="login-container">
        {/* Logo */}
        <div className="login-logo" aria-hidden="true">
          📋
        </div>

        {/* Title */}
        <h1 className="login-title">ReportOps</h1>
        <p className="login-subtitle">
          Nền tảng cộng tác viết báo cáo CIS Benchmark
          <br />
          <span style={{ fontSize: 'var(--text-sm)', opacity: 0.7 }}>
            CIS AlmaLinux OS 9 • Level 1 Server • v2.0.0
          </span>
        </p>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-accent-danger-soft)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--color-accent-danger)',
              fontSize: 'var(--text-sm)',
              marginBottom: 'var(--space-6)',
            }}
          >
            {error}
          </div>
        )}

        {/* Login Button */}
        <a href={getLoginUrl()} className="btn btn-primary login-btn" id="login-github-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Đăng nhập bằng GitHub
        </a>

        {/* Features */}
        <div className="login-features">
          <div className="login-feature">
            <div className="login-feature-icon">✏️</div>
            <div className="login-feature-title">Editor Word-like</div>
            <div className="login-feature-desc">Chỉnh sửa tài liệu trực tiếp với ONLYOFFICE</div>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">🔒</div>
            <div className="login-feature-title">RBAC</div>
            <div className="login-feature-desc">Mỗi người chỉ sửa section của mình</div>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">📊</div>
            <div className="login-feature-title">Auto Generate</div>
            <div className="login-feature-desc">Tự động merge báo cáo từ các sections</div>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">🚀</div>
            <div className="login-feature-title">Release</div>
            <div className="login-feature-desc">Đẩy artifact lên GitHub Releases</div>
          </div>
        </div>

        {/* Footer */}
        <p style={{ marginTop: 'var(--space-10)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          Nhóm IoT • UIT • {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
