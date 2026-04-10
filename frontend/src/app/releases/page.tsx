'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { usePolling } from '../../hooks/usePolling';
import { getCurrentUser, getReleases, freezeRelease } from '../../lib/api';
import type { User, Release } from '../../lib/types';

function ReleasesContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [formData, setFormData] = useState({
    buildId: '',
    version: '',
    notes: '',
  });

  const fetchReleases = useCallback(async () => {
    try {
      const r = await getReleases();
      setReleases(r);
    } catch (err) {
      console.error('Failed to fetch releases:', err);
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

      await fetchReleases();
      setLoading(false);

      const buildId = searchParams.get('buildId');
      if (buildId) {
        setFormData((prev) => ({ ...prev, buildId }));
        setShowModal(true);
      }
    }
    init().catch(() => {
      window.location.href = '/';
    });
  }, [searchParams, fetchReleases]);

  // Global polling for Releases: refresh every 30s
  usePolling(fetchReleases, 30000);

  const handleFreeze = useCallback(async () => {
    if (!formData.buildId || !formData.version) {
      alert('Cần nhập Build ID và Version');
      return;
    }
    setFreezing(true);
    try {
      await freezeRelease(parseInt(formData.buildId, 10), formData.version, formData.notes);
      const r = await getReleases();
      setReleases(r);
      setShowModal(false);
      setFormData({ buildId: '', version: '', notes: '' });
    } catch (err) {
      alert(`Release failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setFreezing(false);
  }, [formData]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải...</span>
      </div>
    );
  }

  return (
    <>
      <nav className="navbar">
        <a href="/dashboard" className="navbar-brand">
          <span className="navbar-brand-icon">📋</span>
          ReportOps
        </a>
        <ul className="navbar-nav">
          <li><a href="/dashboard" className="navbar-link">Dashboard</a></li>
          <li><a href="/reports" className="navbar-link">Reports</a></li>
          <li><a href="/releases" className="navbar-link active">Releases</a></li>
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

      <div className="container page">
        <div className="page-header flex justify-between items-center">
          <div>
            <h1 className="page-title">Releases</h1>
            <p className="page-subtitle">Freeze và publish các phiên bản báo cáo chính thức</p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary btn-lg">
            🚀 New Release
          </button>
        </div>

        {releases.length > 0 ? (
          <div className="grid" style={{ gap: 'var(--space-4)' }}>
            {releases.map((r) => (
              <div key={r.id} className="card">
                <div className="card-header">
                  <div className="flex items-center gap-3">
                    <span
                      style={{
                        fontSize: 'var(--text-2xl)',
                        fontWeight: 800,
                        background: 'var(--gradient-primary)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      {r.version}
                    </span>
                    <span className="badge badge-success">Released</span>
                  </div>
                  <span className="text-sm text-muted">
                    {new Date(r.createdAt).toLocaleString('vi-VN')}
                  </span>
                </div>
                <div className="card-body">
                  {r.notes && (
                    <p style={{ marginBottom: 'var(--space-3)' }}>{r.notes}</p>
                  )}
                  <div className="flex items-center gap-4 mt-4">
                    {r.githubReleaseUrl && (
                      <a
                        href={r.githubReleaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        🔗 GitHub Release
                      </a>
                    )}
                    {r.checksum && (
                      <span className="text-xs font-mono text-muted" title="SHA-256 checksum">
                        SHA256: {r.checksum.substring(0, 16)}...
                      </span>
                    )}
                  </div>
                  {r.build && (
                    <div className="mt-4 text-xs text-muted">
                      Build #{r.build.id} • Triggered by{' '}
                      {r.build.triggeredBy?.displayName || r.build.triggeredBy?.githubUsername}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🚀</div>
            <div className="empty-state-title">Chưa có release nào</div>
            <div className="empty-state-desc">
              Tạo preview build trước, sau đó freeze thành release chính thức.
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">🚀 Tạo Release mới</h2>
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
              Freeze một preview build thành phiên bản chính thức và đẩy lên GitHub Releases.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label className="label">Report Build ID</label>
                <input
                  type="number"
                  className="input"
                  placeholder="VD: 1"
                  value={formData.buildId}
                  onChange={(e) => setFormData({ ...formData, buildId: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Version</label>
                <input
                  type="text"
                  className="input"
                  placeholder="VD: v1.0.0"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Release Notes (tuỳ chọn)</label>
                <textarea
                  className="input textarea"
                  placeholder="Mô tả ngắn về phiên bản này..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowModal(false)} className="btn btn-ghost">
                Huỷ
              </button>
              <button onClick={handleFreeze} disabled={freezing} className="btn btn-primary">
                {freezing ? (
                  <>
                    <div className="spinner" /> Đang tạo...
                  </>
                ) : (
                  '🚀 Freeze & Release'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ReleasesPage() {
  return (
    <Suspense fallback={<div className="loading-page"><div className="spinner" /><span>Đang tải...</span></div>}>
      <ReleasesContent />
    </Suspense>
  );
}
