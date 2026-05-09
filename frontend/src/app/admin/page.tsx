'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminStats, getSections } from '../../lib/api';
import type { AdminStats } from '../../lib/api';
import type { Section } from '../../lib/types';

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [s, sec] = await Promise.all([getAdminStats(), getSections()]);
        setStats(s);
        setSections(sec);
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
      <div className="admin-content">
        <div className="admin-loading">
          <div className="spinner" />
          <span>Đang tải tổng quan...</span>
        </div>
      </div>
    );
  }

  const activeSections = sections.filter(s => s.document?.lastEditedAt).length;

  const statItems = [
    { icon: '👥', label: 'Người dùng', value: stats?.totalUsers ?? 0, color: 'var(--color-accent-primary)' },
    { icon: '📑', label: 'Sections', value: stats?.totalSections ?? 0, color: 'var(--color-accent-success)' },
    { icon: '✅', label: 'Sections active', value: activeSections, color: 'var(--color-accent-warning)' },
    { icon: '📦', label: 'Releases', value: stats?.totalReleases ?? 0, color: 'var(--color-accent-info)' },
    { icon: '📊', label: 'Builds hoàn thành', value: stats?.totalBuilds ?? 0, color: 'var(--color-accent-secondary)' },
    { icon: '📜', label: 'Audit logs', value: stats?.totalLogs ?? 0, color: 'var(--color-text-tertiary)' },
  ];

  const quickLinks = [
    { href: '/admin/users', icon: '👥', title: 'Người dùng', desc: 'Xem, phân quyền và quản lý thành viên' },
    { href: '/admin/sections', icon: '📑', title: 'Sections & Phân công', desc: 'Gán thành viên vào sections CIS' },
    { href: '/admin/controls', icon: '🔒', title: 'CIS Controls', desc: 'Danh sách tiêu chí benchmark' },
    { href: '/admin/audit-logs', icon: '📜', title: 'Nhật ký hệ thống', desc: 'Mọi hành động đều được ghi lại' },
    { href: '/admin/release-settings', icon: '📦', title: 'Release Settings', desc: 'Định dạng và artifacts đính kèm' },
    { href: '/admin/settings', icon: '⚡', title: 'Cài đặt', desc: 'GitHub OAuth, ONLYOFFICE, Storage' },
  ];

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Tổng Quan Hệ Thống</h1>
        <p className="page-subtitle">Admin Dashboard — Quản trị toàn bộ ReportOps</p>
      </div>

      {/* Stats Grid */}
      <div className="admin-stats-grid">
        {statItems.map(item => (
          <div key={item.label} className="card admin-stat-card">
            <div className="admin-stat-icon" style={{ color: item.color, background: `${item.color}18` }}>
              {item.icon}
            </div>
            <div className="admin-stat-value" style={{ color: item.color }}>{item.value}</div>
            <div className="admin-stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <h3 className="admin-section-title">Truy cập nhanh</h3>
      <div className="grid grid-3">
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href} className="card admin-quick-link" style={{ textDecoration: 'none' }}>
            <span className="admin-quick-icon">{link.icon}</span>
            <span className="admin-quick-title">{link.title}</span>
            <span className="admin-quick-desc">{link.desc}</span>
            <span className="admin-quick-arrow">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
