'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { getCurrentUser, getReports, triggerPreviewBuild, getReport } from '../../lib/api';
import type { User, ReportBuild } from '../../lib/types';

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<ReportBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const r = await getReports();
      setReports(r);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser();
      if (!u || u.role !== 'LEADER') {
        window.location.href = '/dashboard';
        return;
      }
      setUser(u);
      await fetchReports();
      setLoading(false);
    }
    init().catch(() => {
      window.location.href = '/';
    });
  }, [fetchReports]);

  // Polling for builds in progress
  useEffect(() => {
    const hasActiveBuild = reports.some(r => r.status === 'building' || r.status === 'pending');
    
    if (!hasActiveBuild) return;

    const interval = setInterval(() => {
      fetchReports();
    }, 5000);

    return () => clearInterval(interval);
  }, [reports, fetchReports]);

  const handleBuildPreview = useCallback(async () => {
    setBuilding(true);
    try {
      await triggerPreviewBuild();
      // Refresh list immediately to show the "building" state
      await fetchReports();
    } catch (err) {
      alert(`Build failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setBuilding(false);
  }, [fetchReports]);

  const handleDownload = useCallback(async (buildId: number) => {
    try {
      const detail = await getReport(buildId);
      if (detail.downloadUrlDocx) {
        window.open(detail.downloadUrlDocx, '_blank');
      } else {
        alert('Không có file để tải xuống');
      }
    } catch (err) {
      alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải...</span>
      </div>
    );
  }

  const isLeader = user?.role === 'LEADER';

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <a href="/dashboard" className="navbar-brand">
          <span className="navbar-brand-icon">📋</span>
          ReportOps
        </a>
        <ul className="navbar-nav">
          <li><a href="/dashboard" className="navbar-link">Dashboard</a></li>
          <li><a href="/reports" className="navbar-link active">Reports</a></li>
          <li><a href="/releases" className="navbar-link">Releases</a></li>
        </ul>
        <div className="navbar-user">
          {user && (
            <>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                {user.displayName || user.githubUsername}
              </span>
              {user.avatarUrl && (
                <Image 
                  src={user.avatarUrl} 
                  alt="" 
                  className="navbar-avatar" 
                  width={32} 
                  height={32}
                  unoptimized
                />
              )}
            </>
          )}
        </div>
      </nav>

      {/* Page */}
      <div className="container page">
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Report Builds</h1>
            <p className="page-subtitle">Tạo preview và quản lý các bản build báo cáo</p>
          </div>
          <button
            onClick={handleBuildPreview}
            disabled={building}
            className="btn btn-primary btn-lg"
          >
            {building ? (
              <>
                <div className="spinner" /> Đang build...
              </>
            ) : (
              '🔨 Build Preview'
            )}
          </button>
        </div>

        {/* Reports Table */}
        {reports.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th>Tạo bởi</th>
                  <th>Thời gian</th>
                  <th>Release</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono">#{r.id}</td>
                    <td>
                      <span className={`badge ${r.buildType === 'final' ? 'badge-success' : 'badge-info'}`}>
                        {r.buildType}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === 'completed'
                            ? 'badge-success'
                            : r.status === 'failed'
                              ? 'badge-danger'
                              : r.status === 'building'
                                ? 'badge-warning'
                                : 'badge-info'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>{r.triggeredBy?.displayName || r.triggeredBy?.githubUsername}</td>
                    <td className="text-sm text-muted">
                      {new Date(r.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td>
                      {r.release ? (
                        <span className="badge badge-primary">{r.release.version}</span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {r.status === 'completed' && (
                          <>
                            <button
                              onClick={() => handleDownload(r.id)}
                              className="btn btn-ghost btn-sm"
                            >
                              ⬇ Download
                            </button>
                            {!r.release && (
                              <a
                                href={`/releases?buildId=${r.id}`}
                                className="btn btn-secondary btn-sm"
                              >
                                🚀 Release
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">Chưa có report build nào</div>
            <div className="empty-state-desc">
              Bấm &quot;Build Preview&quot; để tạo bản preview đầu tiên từ các section documents.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
