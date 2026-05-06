'use client';

import { useEffect, useState } from 'react';
import { getSections, getPerformance } from '../../lib/api';
import type { Section, PerformanceData } from '../../lib/types';

export default function AdminOverviewPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [s, p] = await Promise.all([getSections(), getPerformance()]);
        setSections(s);
        setPerfData(p);
      } catch (err) {
        console.error('Failed to load admin overview:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải tổng quan...</span>
      </div>
    );
  }

  const totalUsers = perfData?.users.length ?? 0;
  const totalSections = sections.length;
  const activeSections = sections.filter(s => s.document?.lastEditedAt).length;

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Tổng Quan Hệ Thống</h1>
        <p className="page-subtitle">Admin Dashboard — Quản trị tổng hợp ReportOps</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="card admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'var(--color-accent-primary-glow)' }}>👥</div>
          <div className="admin-stat-value">{totalUsers}</div>
          <div className="admin-stat-label">Người dùng</div>
        </div>
        <div className="card admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'var(--color-accent-success-soft)' }}>📑</div>
          <div className="admin-stat-value">{totalSections}</div>
          <div className="admin-stat-label">Sections</div>
        </div>
        <div className="card admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'var(--color-accent-warning-soft)' }}>✅</div>
          <div className="admin-stat-value">{activeSections}</div>
          <div className="admin-stat-label">Đang hoạt động</div>
        </div>
        <div className="card admin-stat-card">
          <div className="admin-stat-icon" style={{ background: 'var(--color-accent-info-soft)' }}>🎯</div>
          <div className="admin-stat-value">0</div>
          <div className="admin-stat-label">Audit Targets</div>
        </div>
      </div>

      {/* Quick Links */}
      <h3 style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>Truy cập nhanh</h3>
      <div className="grid grid-3">
        <a href="/admin/users" className="card admin-quick-link">
          <span className="admin-quick-icon">👥</span>
          <span className="admin-quick-title">Quản lý Người dùng</span>
          <span className="admin-quick-desc">Xem, chỉnh sửa vai trò và quyền hạn</span>
        </a>
        <a href="/admin/sections" className="card admin-quick-link">
          <span className="admin-quick-icon">📑</span>
          <span className="admin-quick-title">Quản lý Sections</span>
          <span className="admin-quick-desc">Phân công thành viên và các chương CIS</span>
        </a>
        <a href="/admin/audit-logs" className="card admin-quick-link">
          <span className="admin-quick-icon">📜</span>
          <span className="admin-quick-title">Nhật ký Hoạt động</span>
          <span className="admin-quick-desc">Xem lịch sử thao tác của tất cả người dùng</span>
        </a>
        <a href="/admin/settings" className="card admin-quick-link">
          <span className="admin-quick-icon">⚡</span>
          <span className="admin-quick-title">Cài đặt Hệ thống</span>
          <span className="admin-quick-desc">GitHub OAuth, ONLYOFFICE, Storage</span>
        </a>
        <a href="/admin/controls" className="card admin-quick-link">
          <span className="admin-quick-icon">🔒</span>
          <span className="admin-quick-title">CIS Controls</span>
          <span className="admin-quick-desc">Quản lý danh sách benchmark và controls</span>
        </a>
        <a href="/admin/runners" className="card admin-quick-link">
          <span className="admin-quick-icon">⚙️</span>
          <span className="admin-quick-title">Audit Runners</span>
          <span className="admin-quick-desc">Quản lý các node quét bảo mật</span>
        </a>
      </div>
    </div>
  );
}
