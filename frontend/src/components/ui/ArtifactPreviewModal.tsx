'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { getAuditJobEvidenceFile } from '../../lib/api';
import type { AuditEvidence } from '../../lib/types';
import { Modal } from './Modal';

type PreviewKind = 'image' | 'pdf' | 'html' | 'text' | 'unsupported';

interface ArtifactPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: number;
  evidence: AuditEvidence | null;
}

function formatSize(sizeBytes: number | null): string {
  if (!sizeBytes) return '—';
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function resolvePreviewKind(evidence: AuditEvidence): PreviewKind {
  if (evidence.mimeType?.startsWith('image/')) return 'image';
  if (evidence.mimeType === 'application/pdf') return 'pdf';
  if (evidence.mimeType === 'text/html') return 'html';

  if (
    evidence.mimeType?.startsWith('text/') ||
    evidence.mimeType === 'application/json' ||
    evidence.mimeType === 'application/xml' ||
    evidence.mimeType === 'text/xml' ||
    evidence.mimeType === 'application/octet-stream' ||
    evidence.artifactType.includes('LOG') ||
    evidence.artifactType.includes('JSON')
  ) {
    return 'text';
  }

  return 'unsupported';
}

export function ArtifactPreviewModal({ isOpen, onClose, jobId, evidence }: ArtifactPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  const previewKind = useMemo(() => (evidence ? resolvePreviewKind(evidence) : 'unsupported'), [evidence]);

  useEffect(() => {
    if (!isOpen || !evidence) {
      setError(null);
      setTextContent(null);
      return;
    }

    const activeEvidence = evidence;
    let nextUrl: string | null = null;
    let isMounted = true;

    async function loadArtifact() {
      try {
        setLoading(true);
        setError(null);
        setTextContent(null);

        const blob = await getAuditJobEvidenceFile(jobId, activeEvidence.id);
        nextUrl = URL.createObjectURL(blob);

        if (!isMounted) {
          URL.revokeObjectURL(nextUrl);
          return;
        }

        setPreviewUrl((currentUrl) => {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          return nextUrl;
        });

        if (previewKind === 'text') {
          const rawText = await blob.text();
          if (!isMounted) return;

          if (activeEvidence.mimeType === 'application/json') {
            try {
              setTextContent(JSON.stringify(JSON.parse(rawText), null, 2));
              return;
            } catch {
              // Fall back to raw content if file is not valid JSON.
            }
          }

          setTextContent(rawText);
        }
      } catch (loadError) {
        if (!isMounted) return;
        setPreviewUrl((currentUrl) => {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          return null;
        });
        setError(loadError instanceof Error ? loadError.message : 'Không thể tải artifact');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadArtifact();

    return () => {
      isMounted = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [evidence, isOpen, jobId, previewKind]);

  useEffect(() => {
    if (isOpen || !previewUrl) return;

    URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [isOpen, previewUrl]);

  const title = evidence?.artifactName || 'Artifact Preview';
  const description = evidence ? `${evidence.artifactType} • ${evidence.mimeType || 'file'} • ${formatSize(evidence.sizeBytes)}` : undefined;

  return (
    <Modal
      isOpen={isOpen && !!evidence}
      onClose={onClose}
      title={title}
      description={description}
      size="fullscreen"
      titleActions={
        previewUrl && evidence ? (
          <a href={previewUrl} download={evidence.artifactName} className="btn btn-secondary btn-sm">
            Download
          </a>
        ) : null
      }
      contentStyle={{ display: 'flex', flexDirection: 'column', minHeight: '60vh' }}
    >
      {loading ? (
        <div className="admin-loading" style={{ flex: 1 }}>
          <div className="spinner" />
          <span>Đang tải artifact...</span>
        </div>
      ) : error ? (
        <div className="alert alert-danger" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Không thể mở artifact</div>
          <div style={{ fontSize: 'var(--text-sm)' }}>{error}</div>
        </div>
      ) : previewKind === 'image' && previewUrl ? (
        <div style={{ flex: 1, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={previewUrl}
            alt={title}
            style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)' }}
          />
        </div>
      ) : previewKind === 'pdf' && previewUrl ? (
        <iframe src={previewUrl} title={title} style={{ width: '100%', minHeight: '72vh', border: 'none', borderRadius: 'var(--radius-xl)' }} />
      ) : previewKind === 'html' && previewUrl ? (
        <iframe
          src={previewUrl}
          title={title}
          sandbox="allow-same-origin"
          style={{ width: '100%', minHeight: '72vh', border: 'none', borderRadius: 'var(--radius-xl)', background: '#fff' }}
        />
      ) : previewKind === 'text' ? (
        <pre
          style={{
            margin: 0,
            minHeight: '60vh',
            maxHeight: '72vh',
            padding: 'var(--space-5)',
            overflow: 'auto',
            background: 'rgba(2, 6, 23, 0.88)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            borderRadius: 'var(--radius-xl)',
            color: '#cbd5f5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
          }}
        >
          {textContent || 'Không có nội dung để hiển thị.'}
        </pre>
      ) : (
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-state-icon">📁</div>
          <div className="empty-state-title">Không hỗ trợ preview trực tiếp</div>
          <div className="empty-state-desc">Artifact này chưa có trình xem phù hợp trong popup hiện tại.</div>
          {previewUrl && evidence ? (
            <a href={previewUrl} download={evidence.artifactName} className="btn btn-primary" style={{ marginTop: 16 }}>
              Tải artifact xuống
            </a>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
