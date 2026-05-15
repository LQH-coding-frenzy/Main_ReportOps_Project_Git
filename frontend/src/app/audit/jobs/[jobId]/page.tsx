'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { cancelAuditJob, deleteAuditJob, getAuditJob, getAuditJobLogs } from '../../../../lib/api';
import type { AuditEvidence, AuditJob, AuditResultStatus } from '../../../../lib/types';
import { ArtifactPreviewModal } from '../../../../components/ui/ArtifactPreviewModal';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { Modal } from '../../../../components/ui/Modal';
import { useToast } from '../../../../components/ui/Toast';

const RESULT_STYLE: Record<AuditResultStatus, { bg: string; color: string; icon: string }> = {
  PASS: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', icon: '✅' },
  FAIL: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', icon: '❌' },
  NOT_APPLICABLE: { bg: 'rgba(100,116,139,0.1)', color: '#94a3b8', icon: '➖' },
  ERROR: { bg: 'rgba(239,68,68,0.2)', color: '#fca5a5', icon: '⚠️' },
  UNKNOWN: { bg: 'rgba(100,116,139,0.1)', color: '#64748b', icon: '❓' },
};

function resolveDurationMs(startedAt: string | null, finishedAt: string | null, durationMs: number | null): number | null {
  if (durationMs != null && durationMs > 0) {
    return durationMs;
  }

  if (!startedAt || !finishedAt) {
    return null;
  }

  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  const diff = finished - started;
  return diff > 0 ? diff : null;
}

export default function AuditJobDetailPage() {
  const params = useParams();
  const jobId = parseInt(params.jobId as string, 10);
  const [job, setJob] = useState<AuditJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const logContainerRef = useRef<HTMLPreElement>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<AuditEvidence | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmText: string;
    confirmLoadingText: string;
    type: 'danger' | 'primary';
    onConfirm: () => Promise<void>;
  } | null>(null);
  const jobStatus = job?.status;
  const { showToast } = useToast();

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (showLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, showLogs]);

  useEffect(() => {
    if (!jobId) return;

    let interval: NodeJS.Timeout;

    const fetchJob = async () => {
      try {
        const data = await getAuditJob(jobId);
        setJob(data);
        
        // If job is running, auto-show and fetch logs
        if (data.status === 'RUNNING') {
          // Use executionLog from the job record itself for realtime
          setLogs(data.executionLog || 'Đang chuẩn bị log...');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchJob();

    // Poll every 2 seconds if job is running
    interval = setInterval(() => {
      if (jobStatus === 'PENDING' || jobStatus === 'RUNNING') {
        fetchJob();
      } else if (jobStatus) {
        // Job is COMPLETED, FAILED, or CANCELLED, so stop polling
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  async function handleViewLogs() {
    if (!job) return;
    
    if (showLogs) {
      setShowLogs(false);
      return;
    }

    // Prioritize the real-time executionLog if available
    if (job.executionLog) {
      setLogs(job.executionLog);
      setShowLogs(true);
      return;
    }

    setLoadingLogs(true);
    try {
      const content = await getAuditJobLogs(jobId);
      setLogs(content);
      setShowLogs(true);
    } catch (err) {
      showToast('Không tìm thấy log file hoặc job chưa có log.', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }

  function handleCancelJob() {
    if (!job) return;

    setConfirmState({
      title: `Hủy audit job #${job.id}`,
      message: 'Job sẽ dừng ngay khi backend xử lý xong yêu cầu hủy.',
      confirmText: 'Hủy job',
      confirmLoadingText: 'Đang hủy...',
      type: 'primary',
      onConfirm: async () => {
        try {
          const updated = await cancelAuditJob(job.id);
          setJob(updated);
          showToast(`Đã gửi yêu cầu hủy audit job #${job.id}`, 'success');
        } catch (err) {
          console.error(err);
          showToast('Không thể hủy audit job', 'error');
        }
      },
    });
  }

  function handleDeleteJob() {
    if (!job) return;

    setConfirmState({
      title: `Xóa audit job #${job.id}`,
      message: 'Thao tác này sẽ xóa index audit job và toàn bộ evidence/artifact đi kèm.',
      confirmText: 'Xóa audit job',
      confirmLoadingText: 'Đang xóa...',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteAuditJob(job.id);
          window.location.href = '/audit';
        } catch (err) {
          console.error(err);
          showToast('Không thể xóa audit job', 'error');
        }
      },
    });
  }

  const handleEvidenceClick = (ev: AuditEvidence) => {
    setSelectedEvidence(ev);
  };

  if (loading) {
    return (
      <main className="main-content">
        <div className="admin-loading">
          <div className="spinner" />
          <span>Đang tải kết quả audit...</span>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="main-content">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <div className="empty-state-title">Không tìm thấy audit job</div>
          <Link href="/audit" className="btn btn-secondary" style={{ marginTop: 16 }}>← Quay lại</Link>
        </div>
      </main>
    );
  }

  const scoreColor = job.score != null ? (job.score >= 80 ? '#4ade80' : job.score >= 60 ? '#fbbf24' : '#f87171') : '#64748b';
  const totalDurationMs = resolveDurationMs(job.startedAt, job.finishedAt, job.durationMs);

  return (
    <main className="main-content">
      <div className="container page">
        <div style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/audit" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
            ← Quay lại danh sách
          </Link>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleViewLogs}
              disabled={loadingLogs}
            >
              {loadingLogs ? '⌛...' : showLogs ? 'Hide Log' : '🔍 View Execution Log'}
            </button>
            {(job.status === 'PENDING' || job.status === 'RUNNING') && (
              <button className="btn btn-secondary btn-sm" onClick={handleCancelJob}>
                ⏹ Cancel
              </button>
            )}
            {job.status !== 'PENDING' && job.status !== 'RUNNING' && (
              <button className="btn btn-danger btn-sm" onClick={handleDeleteJob}>
                🗑️ Xóa Index
              </button>
            )}
          </div>
        </div>

        <div className="page-header">
          <h1 className="page-title">Audit Job #{job.id}</h1>
          <p className="page-subtitle">
            VM: {job.vm.name} • Mode: {job.mode.replace(/_/g, ' ')} • {job.ownerSection}
          </p>
        </div>

        {job.status === 'FAILED' && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Audit Job Failed</div>
            <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>{job.errorMessage || 'No error message provided.'}</div>
          </div>
        )}

        {/* Score + Stats */}
        <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="card" style={{ textAlign: 'center', gridColumn: 'span 2' }}>
            <div style={{ fontSize: '4rem', fontWeight: 800, color: scoreColor }}>
              {job.score != null ? `${job.score.toFixed(1)}%` : '—'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Compliance Score
            </div>
            {job.riskLevel && (
              <div style={{ marginTop: 8 }}>
                <span className={`badge ${
                  job.riskLevel === 'Critical' ? 'badge-danger' :
                  job.riskLevel === 'High' ? 'badge-warning' :
                  job.riskLevel === 'Medium' ? 'badge-info' : 'badge-success'
                }`}>
                  Risk: {job.riskLevel}
                </span>
              </div>
            )}
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80' }}>{job.passCount}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: '#4ade80', textTransform: 'uppercase' }}>Pass</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f87171', marginTop: 12 }}>{job.failCount}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: '#f87171', textTransform: 'uppercase' }}>Fail</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fca5a5' }}>{job.errorCount}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: '#fca5a5', textTransform: 'uppercase' }}>Error</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#94a3b8', marginTop: 12 }}>{job.unknownCount}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: '#94a3b8', textTransform: 'uppercase' }}>Unknown</div>
          </div>
        </div>

        {/* Script Runs */}
        {job.scriptRuns && job.scriptRuns.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-6)' }}>
            <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>
                📋 Control Results ({job.scriptRuns.length})
              </h3>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Control ID</th>
                  <th>Title</th>
                  <th>Section</th>
                  <th>Status</th>
                  <th>Exit Code</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {job.scriptRuns.map((run) => {
                  const style = RESULT_STYLE[run.status] || RESULT_STYLE.UNKNOWN;
                  return (
                    <tr key={run.id} style={{ background: style.bg }}>
                      <td>
                        <code className="admin-code" style={{ color: style.color, fontWeight: 700 }}>
                          {run.controlId}
                        </code>
                      </td>
                      <td style={{ fontSize: 'var(--text-sm)' }}>{run.script.title}</td>
                      <td><span className="admin-chip">{run.script.section}</span></td>
                      <td>
                        <span style={{ fontWeight: 600, color: style.color }}>
                          {style.icon} {run.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {run.exitCode ?? '—'}
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Evidence Artifacts */}
        {job.evidences && job.evidences.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
              📦 Evidence Artifacts ({job.evidences.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-3)' }}>
              {job.evidences.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => handleEvidenceClick(ev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--color-bg-glass)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  className="evidence-item"
                >
                  <span style={{ fontSize: '1.5rem' }}>
                    {ev.artifactType.includes('HTML') ? '🌐' :
                    ev.artifactType.includes('JSON') ? '📊' :
                    ev.artifactType.includes('SCREENSHOT') ? '📸' :
                    ev.artifactType.includes('PDF') ? '📄' : '📁'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{ev.artifactName}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {ev.artifactType} • {ev.sizeBytes ? `${(ev.sizeBytes / 1024).toFixed(1)} KB` : ''}
                    </div>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: 10 }}>{ev.mimeType?.split('/')[1] || 'file'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Job Meta */}
        <div className="card" style={{ marginTop: 'var(--space-6)' }}>
          <h4 style={{ marginBottom: 'var(--space-3)' }}>ℹ️ Job Info</h4>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Triggered by:</span>
            <span>{job.triggeredBy.displayName || job.triggeredBy.githubUsername}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>Created:</span>
            <span>{new Date(job.createdAt).toLocaleString('vi-VN')}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>Started:</span>
            <span>{job.startedAt ? new Date(job.startedAt).toLocaleString('vi-VN') : '—'}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>Finished:</span>
            <span>{job.finishedAt ? new Date(job.finishedAt).toLocaleString('vi-VN') : '—'}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>Duration:</span>
            <span>{totalDurationMs ? `${(totalDurationMs / 1000).toFixed(1)}s` : '—'}</span>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
        title="Audit Execution Log"
        description={job ? `Job #${job.id} • ${job.vm.name}` : undefined}
        size="fullscreen"
        contentStyle={{ display: 'flex', flexDirection: 'column', minHeight: '62vh' }}
      >
        <pre
          ref={logContainerRef}
          style={{
            margin: 0,
            minHeight: '62vh',
            maxHeight: '72vh',
            padding: 'var(--space-5)',
            overflow: 'auto',
            background: '#020617',
            border: '1px solid rgba(15, 23, 42, 0.8)',
            borderRadius: 'var(--radius-xl)',
            color: '#22c55e',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {logs || 'Chưa có log để hiển thị.'}
        </pre>
      </Modal>

      <ArtifactPreviewModal
        isOpen={!!selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
        jobId={jobId}
        evidence={selectedEvidence}
      />

      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm || (async () => {})}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || 'Xác nhận'}
        confirmLoadingText={confirmState?.confirmLoadingText || 'Đang xử lý...'}
        type={confirmState?.type || 'primary'}
      />

      <style jsx>{`
        .evidence-item:hover {
          background: var(--color-bg-glass-hover) !important;
          border-color: var(--color-accent-primary) !important;
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
      `}</style>
    </main>
  );
}
