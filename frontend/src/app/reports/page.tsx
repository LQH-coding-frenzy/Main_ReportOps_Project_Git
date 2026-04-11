'use client';

import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { getCurrentUser, getReports, triggerPreviewBuild, deleteReport, getSections } from '../../lib/api';
import type { User, ReportBuild } from '../../lib/types';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [reports, setReports] = useState<ReportBuild[]>([]);
  const [totalSections, setTotalSections] = useState(0);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [downloadConsumeBuildId, setDownloadConsumeBuildId] = useState<number | null>(null);
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
  const buildButtonBusy = building || hasActiveBuild;
  usePolling(fetchReports, 3000, hasActiveBuild);

  const handleBuildPreview = useCallback(async () => {
    setBuilding(true);
    try {
      const result = await triggerPreviewBuild();
      if (result.reusedExisting) {
        showToast(`Build #${result.buildId} đang xử lý. Đang theo dõi tiến độ hiện tại...`, 'info');
      } else {
        showToast(`Đã xếp hàng build preview #${result.buildId}.`, 'info');
      }
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

  const handleDownload = useCallback((buildId: number) => {
    setDownloadConsumeBuildId(buildId);
  }, []);

  const confirmDownloadConsume = useCallback(() => {
    if (!downloadConsumeBuildId) return;
    window.open(`/editor/report/${downloadConsumeBuildId}?download=docx&consume=1`, '_blank', 'noopener,noreferrer');
    setDownloadConsumeBuildId(null);
    showToast('Đã mở ONLYOFFICE download. Build preview sẽ bị xóa sau khi tải xong.', 'info');
  }, [downloadConsumeBuildId, showToast]);

  const calculateProgress = (build: ReportBuild) => {
    if (build.status === 'completed') return 100;
    if (build.status === 'failed') return 0;
    if (!build.buildLog || totalSections === 0) return 5;
    
    const isMerging = build.buildLog.includes('Merging documents');
    const downloadMatches = (build.buildLog.match(/✅ Section .*: Downloaded/g) || []).length;
    
    // Parse skipped sections from log to count them towards progress
    const skippedMatch = build.buildLog.match(/ℹ️ Skipping (\d+) unstarted/);
    const skippedCount = skippedMatch ? parseInt(skippedMatch[1]) : 0;
    
    // If we have total sections, calculate based on accounted sections
    const accounted = downloadMatches + skippedCount;
    const baseProgress = (accounted / totalSections) * 85; 
    
    if (isMerging) return 95;
    return Math.min(90, 5 + baseProgress);
  };

  const getStatusPillClass = (status: ReportBuild['status']) => {
    if (status === 'completed') return 'build-status-pill is-completed';
    if (status === 'failed') return 'build-status-pill is-failed';
    if (status === 'building') return 'build-status-pill is-building';
    return 'build-status-pill is-pending';
  };

  const getBuildingPillStyle = (progress: number): CSSProperties => {
    return { '--pill-progress': `${Math.round(progress)}%` } as CSSProperties;
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
          disabled={buildButtonBusy}
          className="btn btn-primary btn-lg"
        >
          {buildButtonBusy ? (
            <>
              <div className="spinner" /> {hasActiveBuild ? 'Build đang chạy...' : 'Đang build...'}
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
                      {(() => {
                        const progress = calculateProgress(r);
                        if (r.status === 'building') {
                          return (
                            <span className={getStatusPillClass(r.status)} style={getBuildingPillStyle(progress)}>
                              <span>
                                building
                                <span className="font-mono">{Math.round(progress)}%</span>
                              </span>
                            </span>
                          );
                        }

                        return (
                      <span
                        className={getStatusPillClass(r.status)}
                      >
                        <span>{r.status}</span>
                      </span>
                        );
                      })()}
                      {r.status === 'failed' && (
                        <span className="text-accent-danger text-[10px] font-medium uppercase tracking-tighter">
                          Build Error
                        </span>
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
                    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', rowGap: '6px' }}>
                      {r.status === 'completed' && (
                        <>
                          <a
                            href={`/editor/report/${r.id}`}
                            className="btn btn-primary btn-sm flex items-center gap-1"
                            title="Xem báo cáo trên ONLYOFFICE"
                          >
                            <span>👁️</span> View
                          </a>
                          <button
                            onClick={() => handleDownload(r.id)}
                            className="btn btn-success btn-sm flex items-center gap-1"
                            title="Tải về file .docx"
                          >
                            <span>⬇️</span> DOCX
                          </button>
                          {!r.release && r.buildType === 'preview' && (
                            <a
                              href={`/releases?buildId=${r.id}`}
                              className="btn btn-secondary btn-sm flex items-center gap-1"
                              title="Freeze preview thành release"
                            >
                              <span>🚀</span> Release
                            </a>
                          )}
                        </>
                      )}
                      
                      <button
                        onClick={() => setSelectedLog(r.buildLog ?? null)}
                        className="btn btn-ghost btn-sm"
                        title="Xem log chi tiết từ server"
                      >
                        Log
                      </button>

                      {((r.buildType === 'preview' && !r.release && r.status !== 'building' && r.status !== 'pending') ||
                        r.status === 'failed') && (
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="btn btn-ghost btn-danger btn-sm"
                          title="Xóa bản preview"
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

      <ConfirmModal
        isOpen={!!downloadConsumeBuildId}
        onClose={() => setDownloadConsumeBuildId(null)}
        onConfirm={confirmDownloadConsume}
        title="Download & Xóa Preview"
        message="Sau khi bấm xác nhận, hệ thống sẽ mở ONLYOFFICE để tải DOCX trực tiếp. Ngay sau khi URL tải được tạo, preview build này sẽ bị xóa khỏi database và storage để giải phóng bộ nhớ."
        type="danger"
        confirmText="Download & Xóa"
      />
    </div>
  );
}
