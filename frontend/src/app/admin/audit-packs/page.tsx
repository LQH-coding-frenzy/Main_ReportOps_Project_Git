'use client';

import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { getAuditPacks, toggleAuditScript, uploadAuditScript } from '../../../lib/api';
import type { AuditPack, ScriptValidationResult } from '../../../lib/types';
import { benchmarkLabel, projectConfig } from '../../../lib/project-config';
import { useToast } from '../../../components/ui/Toast';

const RISK_COLOR: Record<string, string> = {
  critical: 'badge-danger',
  high: 'badge-warning',
  medium: 'badge-info',
  low: 'badge-success',
};

export default function AdminAuditPacksPage() {
  const [packs, setPacks] = useState<AuditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const { showToast } = useToast();

  const loadPacks = useCallback(async () => {
    try {
      const data = await getAuditPacks();
      setPacks(data);
    } catch (err) {
      console.error(err);
      showToast('Không thể tải audit packs', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const selectedPack = useMemo(() => packs.find((pack) => pack.packId === selectedPackId) || packs[0] || null, [packs, selectedPackId]);
  const currentBenchmarkLabel = selectedPack ? `${selectedPack.benchmarkName} v${selectedPack.benchmarkVersion}` : benchmarkLabel;
  const profileLabel = selectedPack?.profile || projectConfig.benchmarkProfile;

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  async function handleToggle(scriptId: number) {
    try {
      await toggleAuditScript(scriptId);
      showToast('Đã cập nhật trạng thái script', 'success');
      await loadPacks();
    } catch {
      showToast('Không thể cập nhật script', 'error');
    }
  }

  async function handleUploadScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPack) {
      showToast('Chưa có audit pack để upload', 'error');
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('packId', selectedPack.packId);

    setUploading(true);
    try {
      const result = await uploadAuditScript(formData);
      showToast(`Đã upload ${result.script.controlId}`, result.validation.valid ? 'success' : 'info');
      form.reset();
      await loadPacks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể upload script', 'error');
    } finally {
      setUploading(false);
    }
  }

  function getValidationBadge(validation?: ScriptValidationResult) {
    if (!validation) {
      return <span className="badge badge-info">No history</span>;
    }

    return <span className={`badge ${validation.valid ? 'badge-success' : 'badge-danger'}`}>{validation.valid ? 'Valid' : 'Invalid'}</span>;
  }

  if (loading) {
    return (
      <div className="admin-content">
        <div className="admin-loading">
          <div className="spinner" />
          <span>Đang tải audit packs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">📦 Audit Packs</h1>
        <p className="page-subtitle">
          Quản lý các gói kịch bản (Shell scripts) dùng để audit cấu hình bảo mật.
        </p>
      </div>

      {/* Info card */}
      <div className="card admin-info-card" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
          <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
          <div>
            <strong>{currentBenchmarkLabel} — {profileLabel}</strong>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Upload các file .sh theo format CIS stdout. Script phải có shebang bash,
              không chứa lệnh phá hoại, không chứa manual review, và phải thuộc scope M1.
              Parser sẽ chỉ chấp nhận PASS/FAIL/ERROR cho automated audit.
            </p>
          </div>
        </div>
      </div>

      {packs.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>Upload Script</h3>
          <form onSubmit={handleUploadScript} style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Audit Pack</span>
                <select
                  className="admin-input"
                  value={selectedPack?.packId || ''}
                  onChange={(e) => setSelectedPackId(e.target.value)}
                >
                  {packs.map((pack) => (
                    <option key={pack.packId} value={pack.packId}>
                      {pack.packId} - {pack.title}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Script File</span>
                <input className="admin-input" name="script" type="file" accept=".sh" required />
              </label>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <input className="admin-input" name="controlId" placeholder="1.2.1.2" required />
              <input className="admin-input" name="title" placeholder="Ensure gpgcheck is globally activated" required />
              <input className="admin-input" name="section" placeholder="1.2" required />
              <input className="admin-input" name="risk" placeholder="medium" defaultValue="medium" />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input type="hidden" name="assessmentType" value="Automated" />
              <span className="badge badge-info" style={{ alignSelf: 'center' }}>Automated only</span>
              <button className="btn btn-primary" type="submit" disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload Script'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Packs */}
      {packs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📜</div>
            <div className="empty-state-title">Chưa có Audit Pack nào cho M1</div>
            <div className="empty-state-desc">
              Audit Pack sẽ được tạo tự động khi upload script đầu tiên,
              hoặc có thể tạo thủ công qua API.
            </div>
          </div>
        </div>
      ) : (
        packs.map((pack) => (
          <div key={pack.id} className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{pack.title}</h3>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <code className="admin-code">{pack.packId}</code>
                  <span>📋 {pack.benchmarkName} v{pack.benchmarkVersion}</span>
                  <span>🎯 {pack.profile}</span>
                </div>
              </div>
              <span className={`badge ${pack.enabled ? 'badge-success' : 'badge-danger'}`}>
                {pack.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>

            {/* Sections */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
              {pack.sections.map((s) => (
                <span key={s} className="admin-chip">§{s}</span>
              ))}
            </div>

            {/* Scripts table */}
            {pack.scripts && pack.scripts.length > 0 ? (
              <div style={{ overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Control ID</th>
                      <th>Title</th>
                      <th>Section</th>
                      <th>Type</th>
                      <th>Risk</th>
                      <th>Status</th>
                      <th>Validation</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.scripts.map((script) => (
                      <tr key={script.id}>
                        <td><code className="admin-code" style={{ fontWeight: 700, color: 'var(--color-accent-primary-hover)' }}>{script.controlId}</code></td>
                        <td style={{ fontSize: 'var(--text-sm)', maxWidth: '300px' }}>{script.title}</td>
                        <td><span className="admin-chip">{script.section}</span></td>
                        <td>
                          <span className={`badge ${script.assessmentType === 'Automated' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: 10 }}>
                            {script.assessmentType}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${RISK_COLOR[script.risk] || 'badge-info'}`} style={{ fontSize: 10 }}>
                            {script.risk}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${script.enabled ? 'badge-success' : 'badge-danger'}`}>
                            {script.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {getValidationBadge(script.validations?.[0])}
                            {script.validations?.length ? (
                              <details>
                                <summary style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                  {script.validations.length} lần kiểm tra
                                </summary>
                                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                  {script.validations.map((validation) => (
                                    <div
                                      key={validation.id}
                                      style={{
                                        padding: '8px 10px',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 'var(--text-xs)',
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <strong>{validation.valid ? 'Valid' : 'Invalid'}</strong>
                                        <span style={{ color: 'var(--color-text-muted)' }}>
                                          {new Date(validation.createdAt).toLocaleString('vi-VN')}
                                        </span>
                                      </div>
                                      {(validation.errorsJson?.length || validation.warningsJson?.length) ? (
                                        <div style={{ marginTop: 6, color: 'var(--color-text-muted)' }}>
                                          {validation.errorsJson?.length ? `Errors: ${validation.errorsJson.join('; ')}` : ''}
                                          {validation.warningsJson?.length ? `${validation.errorsJson?.length ? ' | ' : ''}Warnings: ${validation.warningsJson.join('; ')}` : ''}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleToggle(script.id)}
                          >
                            {script.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                Chưa có script nào trong pack này.
              </p>
            )}
          </div>
        ))
      )}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <Link href="/admin" className="btn btn-secondary">← Quay lại Admin</Link>
      </div>
    </div>
  );
}
