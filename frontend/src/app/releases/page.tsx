'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePolling } from '../../hooks/usePolling';
import { getCurrentUser, getReleases, freezeRelease, deleteRelease } from '../../lib/api';
import type { User, Release } from '../../lib/types';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';

function ReleasesContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { showToast } = useToast();
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
      try {
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
      } catch (err) {
        console.error('Init releases page failed:', err);
        window.location.href = '/';
      }
    }
    init();
  }, [searchParams, fetchReleases]);

  // Global polling for Releases: refresh every 30s
  usePolling(fetchReleases, 30000);

  const handleFreeze = useCallback(async () => {
    if (!formData.buildId || !formData.version) {
      showToast('Cần nhập Build ID và Version', 'error');
      return;
    }
    setFreezing(true);
    try {
      await freezeRelease(parseInt(formData.buildId, 10), formData.version, formData.notes);
      showToast(`Đã tạo release ${formData.version} thành công!`, 'success');
      await fetchReleases();
      setShowModal(false);
      setFormData({ buildId: '', version: '', notes: '' });
    } catch (err) {
      showToast(`Release failed: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`, 'error');
    }
    setFreezing(false);
  }, [formData, fetchReleases, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      await deleteRelease(deleteId);
      showToast('Đã xóa bản ghi release', 'success');
      await fetchReleases();
    } catch (err) {
      showToast(`Xóa thất bại: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`, 'error');
    }
    setDeleteId(null);
  }, [deleteId, fetchReleases, showToast]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải...</span>
      </div>
    );
  }

  return (
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">
                    {new Date(r.createdAt).toLocaleString('vi-VN')}
                  </span>
                  <button
                    onClick={() => setDeleteId(r.id)}
                    className="btn btn-ghost btn-danger btn-sm"
                    title="Xóa release khỏi hệ thống"
                    style={{ padding: '4px 8px' }}
                  >
                    🗑️
                  </button>
                </div>
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

      <Modal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        title="🚀 Tạo Release mới"
      >
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
          Freeze một preview build thành phiên bản chính thức và đẩy lên GitHub Releases.
        </p>
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
          Lưu ý: Build phải được tải DOCX qua ONLYOFFICE ít nhất một lần để chuẩn hóa artifact trước khi freeze.
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
      </Modal>

      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={confirmDelete}
        title="Xóa Release"
        message="Bạn có chắc chắn muốn xóa bản release này khỏi hệ thống? (Lưu ý: Hành động này không xóa release trên GitHub)"
        type="danger"
        confirmText="Xóa bản ghi"
      />
    </div>
  );
}

export default function ReleasesPage() {
  return (
    <Suspense fallback={<div className="loading-page"><div className="spinner" /><span>Đang tải...</span></div>}>
      <ReleasesContent />
    </Suspense>
  );
}
