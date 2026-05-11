'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuditJobs } from '../../lib/api';
import type { AuditJob } from '../../lib/types';

const STATUS_BADGES: Record<string, { cls: string; icon: string }> = {
  PENDING: { cls: 'badge-warning', icon: '⏳' },
  RUNNING: { cls: 'badge-info', icon: '🔄' },
  COMPLETED: { cls: 'badge-success', icon: '✅' },
  FAILED: { cls: 'badge-danger', icon: '❌' },
  CANCELLED: { cls: 'badge-secondary', icon: '🚫' },
};

export default function AuditPage() {
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditJobs()
      .then((data) => setJobs(data.jobs))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED');
  const latestScore = completedJobs[0]?.score;

  return (
    <main className="main-content">
      <div className="container page">
        <div className="page-header">
          <h1 className="page-title">🔒 Auto-Audit</h1>
          <p className="page-subtitle">
            CIS AlmaLinux OS 9 Benchmark v2.0.0 — Level 1 Server
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-accent-primary)' }}>
              {jobs.length}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: 4 }}>
              Total Jobs
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80' }}>
              {completedJobs.length}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: 4 }}>
              Completed
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 800,
                color: latestScore != null ? (latestScore >= 80 ? '#4ade80' : latestScore >= 60 ? '#fbbf24' : '#f87171') : 'var(--color-text-muted)',
              }}
            >
              {latestScore != null ? `${latestScore.toFixed(0)}%` : '—'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: 4 }}>
              Latest Score
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <Link href="/audit/new" className="btn btn-primary" style={{ display: 'inline-flex', gap: 8 }}>
              🚀 New Audit
            </Link>
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Audit Jobs</h3>
          </div>
          {loading ? (
            <div className="admin-loading">
              <div className="spinner" />
              <span>Đang tải...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">Chưa có audit job nào</div>
              <div className="empty-state-desc">
                Tạo một Lab VM trước, sau đó tạo audit job mới.
              </div>
              <Link href="/lab" className="btn btn-primary" style={{ marginTop: 16 }}>
                → Quản lý Lab VMs
              </Link>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>VM</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>P / F / M / E</th>
                  <th>Risk</th>
                  <th>Thời gian</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const badge = STATUS_BADGES[job.status] || STATUS_BADGES.PENDING;
                  return (
                    <tr key={job.id}>
                      <td><code className="admin-code">#{job.id}</code></td>
                      <td>{job.vm.name}</td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: 11 }}>
                          {job.mode.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${badge.cls}`}>
                          {badge.icon} {job.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {job.score != null ? `${job.score.toFixed(0)}%` : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        <span style={{ color: '#4ade80' }}>{job.passCount}</span>{' / '}
                        <span style={{ color: '#f87171' }}>{job.failCount}</span>{' / '}
                        <span style={{ color: '#fbbf24' }}>{job.manualCount}</span>{' / '}
                        <span style={{ color: '#fca5a5' }}>{job.errorCount}</span>
                      </td>
                      <td>
                        {job.riskLevel && (
                          <span className={`badge ${
                            job.riskLevel === 'Critical' ? 'badge-danger' :
                            job.riskLevel === 'High' ? 'badge-warning' :
                            job.riskLevel === 'Medium' ? 'badge-info' : 'badge-success'
                          }`}>
                            {job.riskLevel}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', color: 'var(--color-text-tertiary)' }}>
                        {new Date(job.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td>
                        <Link href={`/audit/jobs/${job.id}`} className="btn btn-secondary btn-sm">
                          Chi tiết →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
