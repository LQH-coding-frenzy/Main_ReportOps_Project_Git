'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuditJobs, getAuditJobEvidence } from '../../lib/api';
import type { AuditJob } from '../../lib/types';

export default function ArchivePage() {
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<number, Awaited<ReturnType<typeof getAuditJobEvidence>>>>({});

  useEffect(() => {
    getAuditJobs()
      .then((data) => setJobs(data.jobs.filter((j) => j.status === 'COMPLETED')))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleToggleEvidence(jobId: number) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }

    setExpandedJobId(jobId);
    if (!evidenceMap[jobId]) {
      const evidence = await getAuditJobEvidence(jobId);
      setEvidenceMap((prev) => ({ ...prev, [jobId]: evidence }));
    }
  }

  return (
    <main className="main-content">
      <div className="container page">
        <div className="page-header">
          <h1 className="page-title">📦 Archive</h1>
          <p className="page-subtitle">
            Kho lưu trữ kết quả audit, evidence, screenshots và artifacts
          </p>
        </div>

        {loading ? (
          <div className="admin-loading">
            <div className="spinner" />
            <span>Đang tải archive...</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <div className="empty-state-title">Chưa có audit nào hoàn thành</div>
              <div className="empty-state-desc">
                Kết quả audit sẽ được tự động lưu trữ tại đây sau khi job hoàn thành.
              </div>
              <Link href="/audit" className="btn btn-primary" style={{ marginTop: 16 }}>
                → Xem Audit Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {jobs.map((job) => (
              <div key={job.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                    <span style={{ fontSize: '1.25rem' }}>📊</span>
                    <span style={{ fontWeight: 700 }}>Audit #{job.id} — {job.vm.name}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                    <span>📋 {job.ownerSection}</span>
                    <span>🎯 {job.mode.replace(/_/g, ' ')}</span>
                    <span style={{ fontWeight: 700, color: job.score && job.score >= 80 ? '#4ade80' : job.score && job.score >= 60 ? '#fbbf24' : '#f87171' }}>
                      Score: {job.score != null ? `${job.score.toFixed(0)}%` : '—'}
                    </span>
                    <span>
                      ✅{job.passCount} ❌{job.failCount} ⚠️{job.errorCount} ❓{job.unknownCount}
                    </span>
                    <span>{job.finishedAt ? new Date(job.finishedAt).toLocaleString('vi-VN') : ''}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleToggleEvidence(job.id)}>
                    📎 Evidence
                  </button>
                  <Link href={`/archive/${job.id}`} className="btn btn-secondary btn-sm">
                    📦 Open Archive
                  </Link>
                  <Link href={`/audit/jobs/${job.id}`} className="btn btn-secondary btn-sm">
                    📊 Results
                  </Link>
                </div>

                {expandedJobId === job.id && evidenceMap[job.id] && (
                  <div style={{ width: '100%', marginTop: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Artifacts</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {evidenceMap[job.id].map((ev) => (
                        <a
                          key={ev.id}
                          href={`/api/audit-jobs/${job.id}/evidence/${ev.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="card"
                          style={{ padding: 12, textDecoration: 'none' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{ev.artifactName}</div>
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                {ev.artifactType} • {ev.mimeType || 'file'}
                              </div>
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                              {ev.sizeBytes ? `${(ev.sizeBytes / 1024).toFixed(1)} KB` : ''}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
