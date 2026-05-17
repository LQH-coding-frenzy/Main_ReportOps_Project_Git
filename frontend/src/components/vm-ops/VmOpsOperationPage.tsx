'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createVmOpsOperationJob, getAuditJob, getAuditJobs } from '../../lib/api';
import type { AuditJob, AuditScriptRun, VmOpsOperationType } from '../../lib/types';
import { getEligibleVmOpsRuns, getVmOpsEligibleStatus, getVmOpsOperationLabel } from '../../lib/vm-ops';
import { useToast } from '../ui/Toast';
import { Select } from '../ui/Select';

const STATUS_COLORS: Record<string, string> = {
  PASS: '#4ade80',
  FAIL: '#f87171',
  NOT_APPLICABLE: '#94a3b8',
  ERROR: '#fca5a5',
  UNKNOWN: '#94a3b8',
};

type VmOpsOperationPageProps = {
  operationType: VmOpsOperationType;
  title: string;
  description: string;
};

export function VmOpsOperationPage({ operationType, title, description }: VmOpsOperationPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const [sourceJob, setSourceJob] = useState<AuditJob | null>(null);
  const [sourceJobId, setSourceJobId] = useState<number | null>(null);
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSourceJob, setLoadingSourceJob] = useState(false);
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const requestedSourceJobId = Number(new URLSearchParams(searchKey).get('sourceJobId'));

    getAuditJobs()
      .then((data) => {
        const nextJobs = data.jobs;
        setJobs(nextJobs);

        if (Number.isInteger(requestedSourceJobId) && requestedSourceJobId > 0) {
          setLoadingSourceJob(true);
          setSourceJobId(requestedSourceJobId);
          return;
        }

        const firstCandidate = nextJobs.find((job) => job.jobType === 'AUDIT' && job.ownerSection === 'M1' && job.status === 'COMPLETED');
        if (firstCandidate) {
          setLoadingSourceJob(true);
          setSourceJobId(firstCandidate.id);
        }
      })
      .catch((error) => {
        console.error(error);
        showToast('Không thể tải VM Ops jobs', 'error');
      })
      .finally(() => setLoading(false));
  }, [searchKey, showToast]);

  useEffect(() => {
    if (!sourceJobId) {
      return;
    }

    let isMounted = true;

    getAuditJob(sourceJobId)
      .then((job) => {
        if (!isMounted) {
          return;
        }

        setSourceJob(job);
        setSelectedControlIds(getEligibleVmOpsRuns(job, operationType).map((run) => run.controlId));
      })
      .catch((error) => {
        console.error(error);
        if (isMounted) {
          showToast('Không thể tải source audit job', 'error');
          setSourceJob(null);
          setSelectedControlIds([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingSourceJob(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sourceJobId, operationType, showToast]);

  const sourceAuditJobs = useMemo(
    () => jobs.filter((job) => job.jobType === 'AUDIT' && job.ownerSection === 'M1' && job.status === 'COMPLETED'),
    [jobs]
  );

  const operationJobs = useMemo(
    () => jobs.filter((job) => job.jobType === operationType),
    [jobs, operationType]
  );

  const eligibleRuns = useMemo(() => getEligibleVmOpsRuns(sourceJob, operationType), [sourceJob, operationType]);
  const eligibleStatus = getVmOpsEligibleStatus(operationType);

  function toggleControl(controlId: string) {
    setSelectedControlIds((current) => (
      current.includes(controlId)
        ? current.filter((item) => item !== controlId)
        : [...current, controlId]
    ));
  }

  async function handleRun() {
    if (!sourceJobId || selectedControlIds.length === 0) {
      return;
    }

    setCreating(true);
    try {
      const job = await createVmOpsOperationJob(sourceJobId, operationType, selectedControlIds);
      showToast(`Đã tạo ${getVmOpsOperationLabel(operationType)} job #${job.id}`, 'success');
      router.push(`/audit/jobs/${job.id}`);
    } catch (error) {
      console.error(error);
      showToast('Không thể tạo VM Ops operation job', 'error');
      setCreating(false);
    }
  }

  function renderRunCard(run: AuditScriptRun) {
    const checked = selectedControlIds.includes(run.controlId);

    return (
      <label
        key={run.id}
        className="card"
        style={{
          padding: 'var(--space-4)',
          cursor: 'pointer',
          borderColor: checked ? 'var(--color-accent-primary)' : 'var(--color-border)',
          background: checked ? 'rgba(99, 102, 241, 0.08)' : 'var(--color-bg-card)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleControl(run.controlId)}
            style={{ marginTop: 4 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              <code className="admin-code" style={{ color: 'var(--color-accent-primary-hover)', fontWeight: 700 }}>
                {run.controlId}
              </code>
              <span className="badge badge-info">{run.script.section}</span>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: STATUS_COLORS[run.status] || '#94a3b8' }}>
                {run.status}
              </span>
            </div>
            <div style={{ fontWeight: 600 }}>{run.script.title}</div>
          </div>
        </div>
      </label>
    );
  }

  return (
    <div className="admin-content">
        <div className="page-header">
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{description}</p>
        </div>

        <div className="admin-note" style={{ marginBottom: 'var(--space-6)' }}>
          <span>ℹ️</span>
          <span>Runtime operation thật hiện chỉ bật cho M1. M2-M4 vẫn giữ placeholder cho đến khi bạn upload script sau.</span>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>1. Chọn source audit job</h3>
            {loading ? (
              <div className="admin-loading"><div className="spinner" /><span>Đang tải audit jobs...</span></div>
            ) : sourceAuditJobs.length === 0 ? (
              <div className="empty-state" style={{ padding: 0 }}>
                <div className="empty-state-icon">🧪</div>
                <div className="empty-state-title">Chưa có M1 audit job hoàn thành</div>
                <Link href="/audit/new?section=M1" className="btn btn-primary" style={{ marginTop: 12 }}>
                  🚀 Tạo M1 Audit
                </Link>
              </div>
            ) : (
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Source Audit Job</span>
                <Select
                  value={sourceJobId?.toString() || ''}
                  onChange={(val) => {
                    const nextSourceJobId = Number(val) || null;
                    setLoadingSourceJob(!!nextSourceJobId);
                    setSourceJobId(nextSourceJobId);
                    if (!nextSourceJobId) {
                      setSourceJob(null);
                      setSelectedControlIds([]);
                    }
                  }}
                  options={sourceAuditJobs.map(job => ({
                    value: job.id.toString(),
                    label: `#${job.id} - ${job.vm.name} - ${new Date(job.createdAt).toLocaleString('vi-VN')}`
                  }))}
                  placeholder="Chọn Source Audit Job..."
                />
              </label>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>2. Chọn control</h3>
            {loadingSourceJob ? (
              <div className="admin-loading"><div className="spinner" /><span>Đang tải control results...</span></div>
            ) : !sourceJob ? (
              <p style={{ margin: 0 }}>Chọn source audit job để xem controls khả dụng.</p>
            ) : eligibleRuns.length === 0 ? (
              <div className="empty-state" style={{ padding: 0 }}>
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-title">Không có control trạng thái {eligibleStatus}</div>
                <div className="empty-state-desc">Source audit job này không có control phù hợp cho thao tác {getVmOpsOperationLabel(operationType)}.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelectedControlIds(eligibleRuns.map((run) => run.controlId))}>
                    Select All
                  </button>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setSelectedControlIds([])}>
                    Clear
                  </button>
                  <span className="badge badge-info">{selectedControlIds.length} / {eligibleRuns.length} selected</span>
                </div>
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  {eligibleRuns.map(renderRunCard)}
                </div>
              </>
            )}
          </div>
        </div>

        {sourceJob && (
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>Source Audit Snapshot</h3>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
              <span><strong>Job:</strong> #{sourceJob.id}</span>
              <span><strong>VM:</strong> {sourceJob.vm.name}</span>
              <span><strong>Section:</strong> {sourceJob.ownerSection}</span>
              <span><strong>Score:</strong> {sourceJob.score != null ? `${sourceJob.score.toFixed(1)}%` : '—'}</span>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Link href={`/audit/jobs/${sourceJob.id}`} className="btn btn-secondary btn-sm">
                Xem source audit job
              </Link>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-8)' }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!sourceJobId || selectedControlIds.length === 0 || creating}
            onClick={handleRun}
          >
            {creating ? '⏳ Đang tạo...' : `▶ Chạy ${getVmOpsOperationLabel(operationType)}`}
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{getVmOpsOperationLabel(operationType)} Jobs</h3>
          </div>
          {operationJobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">Chưa có job nào</div>
              <div className="empty-state-desc">Các job {getVmOpsOperationLabel(operationType)} bạn tạo sẽ xuất hiện ở đây.</div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>VM</th>
                  <th>Status</th>
                  <th>Selected</th>
                  <th>Pass / Fail</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {operationJobs.map((job) => {
                  const selectedCount = job.summaryJson?.operationContext?.selectedControlIds?.length || job.totalControls;
                  return (
                    <tr key={job.id}>
                      <td><code className="admin-code">#{job.id}</code></td>
                      <td>{job.vm.name}</td>
                      <td><span className="badge badge-info">{job.status}</span></td>
                      <td>{selectedCount}</td>
                      <td>
                        <span style={{ color: '#4ade80' }}>{job.passCount}</span>{' / '}
                        <span style={{ color: '#f87171' }}>{job.failCount}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
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
            </div>
          )}
        </div>
    </div>
  );
}
