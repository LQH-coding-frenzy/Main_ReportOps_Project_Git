'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getAuditJob } from '../../../../lib/api';
import type { AuditJob, AuditResultStatus } from '../../../../lib/types';

const RESULT_STYLE: Record<AuditResultStatus, { bg: string; color: string; icon: string }> = {
  PASS: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', icon: '✅' },
  FAIL: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', icon: '❌' },
  MANUAL: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', icon: '📋' },
  NOT_APPLICABLE: { bg: 'rgba(100,116,139,0.1)', color: '#94a3b8', icon: '➖' },
  ERROR: { bg: 'rgba(239,68,68,0.2)', color: '#fca5a5', icon: '⚠️' },
  UNKNOWN: { bg: 'rgba(100,116,139,0.1)', color: '#64748b', icon: '❓' },
};

export default function AuditJobDetailPage() {
  const params = useParams();
  const jobId = parseInt(params.jobId as string, 10);
  const [job, setJob] = useState<AuditJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    getAuditJob(jobId)
      .then(setJob)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [jobId]);

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

  return (
    <main className="main-content">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/audit" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
          ← Quay lại danh sách
        </Link>
      </div>

      <div className="page-header">
        <h1 className="page-title">Audit Job #{job.id}</h1>
        <p className="page-subtitle">
          VM: {job.vm.name} • Mode: {job.mode.replace(/_/g, ' ')} • {job.ownerSection}
        </p>
      </div>

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
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24' }}>{job.manualCount}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: '#fbbf24', textTransform: 'uppercase' }}>Manual</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fca5a5', marginTop: 12 }}>{job.errorCount}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: '#fca5a5', textTransform: 'uppercase' }}>Error</div>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {job.evidences.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--color-bg-glass)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>
                  {ev.artifactType.includes('HTML') ? '🌐' :
                   ev.artifactType.includes('JSON') ? '📊' :
                   ev.artifactType.includes('SCREENSHOT') ? '📸' :
                   ev.artifactType.includes('PDF') ? '📄' : '📁'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{ev.artifactName}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {ev.artifactType} • {ev.sizeBytes ? `${(ev.sizeBytes / 1024).toFixed(1)} KB` : ''}
                  </div>
                </div>
                <span className="badge badge-info" style={{ fontSize: 10 }}>{ev.mimeType || 'file'}</span>
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
          <span>{job.durationMs ? `${(job.durationMs / 1000).toFixed(1)}s` : '—'}</span>
        </div>
      </div>
    </main>
  );
}
