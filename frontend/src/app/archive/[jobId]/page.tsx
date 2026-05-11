'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getAuditJob, getAuditJobEvidence, getAuditJobEvidenceFile } from '../../../lib/api';
import type { AuditEvidence, AuditJob } from '../../../lib/types';

function formatSize(sizeBytes: number | null): string {
  if (!sizeBytes) return '—';
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

export default function ArchiveJobPage() {
  const params = useParams();
  const jobId = parseInt(params.jobId as string, 10);
  const [job, setJob] = useState<AuditJob | null>(null);
  const [evidence, setEvidence] = useState<AuditEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [jobData, evidenceData] = await Promise.all([getAuditJob(jobId), getAuditJobEvidence(jobId)]);
        if (!isMounted) return;
        setJob(jobData);
        setEvidence(evidenceData);
      } catch (error) {
        console.error(error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  const grouped = useMemo(() => {
    return evidence.reduce<Record<string, AuditEvidence[]>>((acc, item) => {
      const key = item.artifactType || 'OTHER';
      acc[key] ||= [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [evidence]);

  async function handlePreview(ev: AuditEvidence) {
    const blob = await getAuditJobEvidenceFile(jobId, ev.id);
    const url = URL.createObjectURL(blob);
    setPreviewName(ev.artifactName);
    setPreviewUrl(url);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (loading) {
    return <main className="main-content"><div className="admin-loading"><div className="spinner" /><span>Đang tải archive job...</span></div></main>;
  }

  if (!job) {
    return <main className="main-content"><div className="empty-state"><div className="empty-state-icon">📦</div><div className="empty-state-title">Không tìm thấy archive</div><Link href="/archive" className="btn btn-secondary" style={{ marginTop: 16 }}>← Quay lại archive</Link></div></main>;
  }

  return (
    <main className="main-content">
      <div className="container page">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Link href="/archive" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>← Quay lại archive</Link>
        </div>

        <div className="page-header">
          <h1 className="page-title">Archive Job #{job.id}</h1>
          <p className="page-subtitle">{job.vm.name} • {job.ownerSection} • {job.mode.replace(/_/g, ' ')}</p>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
            <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Score</div><div style={{ fontWeight: 700 }}>{job.score != null ? `${job.score.toFixed(1)}%` : '—'}</div></div>
            <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Risk</div><div style={{ fontWeight: 700 }}>{job.riskLevel || '—'}</div></div>
            <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Completed</div><div style={{ fontWeight: 700 }}>{job.finishedAt ? new Date(job.finishedAt).toLocaleString('vi-VN') : '—'}</div></div>
            <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Artifacts</div><div style={{ fontWeight: 700 }}>{evidence.length}</div></div>
          </div>
        </div>

        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>{type}</h3>
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {items.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className="card"
                  style={{ textAlign: 'left', padding: 12, cursor: 'pointer' }}
                  onClick={() => handlePreview(ev)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{ev.artifactName}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{ev.mimeType || 'file'} • {formatSize(ev.sizeBytes)}</div>
                    </div>
                    <span className="badge badge-info">Preview</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {previewUrl && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setPreviewUrl(null)}>
            <div className="card" style={{ width: 'min(1200px, 100%)', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <strong>{previewName}</strong>
                <button className="btn btn-secondary btn-sm" onClick={() => setPreviewUrl(null)}>Đóng</button>
              </div>
              <iframe src={previewUrl} title={previewName} style={{ width: '100%', height: '80vh', border: 'none' }} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
