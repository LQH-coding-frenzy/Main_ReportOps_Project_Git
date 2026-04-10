'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { getCurrentUser, getReports, triggerPreviewBuild, getReport, deleteReport, getSections } from '../../lib/api';
import type { User, ReportBuild } from '../../lib/types';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ConfirmModal } from '../../components/ui/ConfirmModal';

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<ReportBuild[]>([]);
  const [totalSections, setTotalSections] = useState(0);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { showToast } = useToast();

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
      try {
        const u = await getCurrentUser();
        if (!u || u.role !== 'LEADER') {
          window.location.href = '/dashboard';
          return;
        }
        setUser(u);
        
        const [r, s] = await Promise.all([getReports(), getSections()]);
        setReports(r);
        setTotalSections(s.length);
        setLoading(false);
      } catch (err) {
        console.error('Init reports page failed:', err);
        window.location.href = '/';
      }
    }
    init();
  }, []);

  // Use the shared hook for polling when a build is active
  const hasActiveBuild = reports.some(r => r.status === 'building' || r.status === 'pending');
  usePolling(fetchReports, 3000, hasActiveBuild);

  const handleBuildPreview = useCallback(async () => {
    setBuilding(true);
    try {
      await triggerPreviewBuild();
      showToast('Đang bắt đầu build preview...', 'info');
      await fetchReports();
    } catch (err) {
      showToast(`Build thất bại: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`, 'error');
    }
    setBuilding(false);
  }, [fetchReports, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      await deleteReport(deleteId);
      showToast('Đã xóa bản build thành công', 'success');
      await fetchReports();
    } catch (err) {
      showToast(`Xóa thất bại: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`, 'error');
    }
    setDeleteId(null);
  }, [deleteId, fetchReports, showToast]);

  const handleDownload = useCallback(async (buildId: number) => {
    try {
      const detail = await getReport(buildId);
      if (detail.downloadUrlDocx) {
        window.open(detail.downloadUrlDocx, '_blank');
      } else {
        showToast('Không có file để tải xuống', 'error');
      }
    } catch (err) {
      showToast(`Download failed: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`, 'error');
    }
  }, [showToast]);

  const calculateProgress = (build: ReportBuild) => {
    if (build.status === 'completed') return 100;
    if (build.status === 'failed') return 0;
    if (!build.buildLog || totalSections === 0) return 5;
    
    const matches = (build.buildLog.match(/✅ Section .*: Downloaded/g) || []).length;
    const sectionProgress = (matches / totalSections) * 90; 
    return Math.min(95, 5 + sectionProgress);
  };

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

      {reports.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Loại</th>
                <th>Trạng thái / Tiến độ</th>
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
                    <div className="flex flex-col gap-1" style={{ minWidth: '150px' }}>
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
                      {r.status === 'building' && (
                        <ProgressBar progress={calculateProgress(r)} showPerc={true} />
                      )}
                      {r.status === 'failed' && (
                        <button 
                          onClick={() => setSelectedLog(r.buildLog ?? null)} 
                          className="text-[10px] text-accent-danger hover:underline text-left mt-1"
                        >
                          Xem chi tiết lỗi →
                        </button>
                      )}
                    </div>
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
                            <>
                              <a
                                href={`/releases?buildId=${r.id}`}
                                className="btn btn-secondary btn-sm"
                              >
                                🚀 Release
                              </a>
                              <button
                                onClick={() => setDeleteId(r.id)}
                                className="btn btn-ghost btn-danger btn-sm"
                                title="Xóa bản build"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </>
                      )}
                      {r.status === 'failed' && (
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="btn btn-ghost btn-danger btn-sm"
                          title="Xóa bản build lỗi"
                        >
                          🗑️
                        </button>
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

      <Modal 
        isOpen={!!selectedLog} 
        onClose={() => setSelectedLog(null)} 
        title="⚠️ Build Error Log"
      >
        <div className="bg-black/80 p-4 rounded-lg font-mono text-xs overflow-auto max-h-[400px] whitespace-pre-wrap text-accent-danger border border-border">
          {selectedLog || 'Không có log chi tiết.'}
        </div>
        <div className="modal-actions">
          <button onClick={() => setSelectedLog(null)} className="btn btn-primary">Đóng</button>
        </div>
      </Modal>

      <ConfirmModal 
        isOpen={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={confirmDelete}
        title="Xóa bản build"
        message="Bạn có chắc chắn muốn xóa bản build này? Hành động này cũng sẽ xóa file trên storage và không thể hoàn tác."
        type="danger"
        confirmText="Xóa bản build"
      />
    </div>
  );
}
