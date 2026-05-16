'use client';

import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { getAuditPacks, toggleAuditScript, uploadAuditScript } from '../../../lib/api';
import type { AuditPack, ScriptValidationResult } from '../../../lib/types';
import { benchmarkLabel, projectConfig } from '../../../lib/project-config';
import { useToast } from '../../../components/ui/Toast';
import { FRONTEND_SECTION_DEFINITION_MAP } from '../../../lib/section-definitions';

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

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.packId === selectedPackId) || packs[0] || null,
    [packs, selectedPackId]
  );
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
        <h1 className="page-title">Audit Packs Registry</h1>
        <p className="page-subtitle">4 pack M1-M4 mới theo `plan_complete.md`, trong đó M1 là bản thật và M2-M4 đang là placeholder có metadata sẵn.</p>
      </div>

      <div className="card admin-info-card" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
          <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
          <div>
            <strong>{currentBenchmarkLabel} — {profileLabel}</strong>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Script audit chính luôn là audit-only. Remediation được tách riêng theo `remediation/m*_remediate.sh` và hiện chỉ M1 có runtime remediation thật.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 'var(--space-6)' }}>
        {packs.map((pack) => {
          const definition = FRONTEND_SECTION_DEFINITION_MAP[pack.ownerSection as keyof typeof FRONTEND_SECTION_DEFINITION_MAP];
          const isM1 = pack.ownerSection === 'M1';

          return (
            <div key={pack.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-4)' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span className="admin-chip">{pack.ownerSection}</span>
                    <span className={`badge ${pack.isPlaceholder ? 'badge-warning' : 'badge-success'}`}>
                      {pack.isPlaceholder ? 'Placeholder' : 'Ready'}
                    </span>
                  </div>
                  <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{pack.title}</h3>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    <code className="admin-code">{pack.packId}</code>
                  </div>
                </div>
                <span className={`badge ${pack.enabled ? 'badge-success' : 'badge-danger'}`}>
                  {pack.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{definition?.description}</p>

              <div style={{ display: 'grid', gap: 8, margin: 'var(--space-4) 0' }}>
                <div><strong>Manifest:</strong> <code>{pack.manifestPath || definition?.manifestPath}</code></div>
                <div><strong>Audit script:</strong> <code>{pack.auditScriptPath || definition?.scriptPath}</code></div>
                <div><strong>Remediation:</strong> <code>{pack.remediationPath || definition?.remediationPath}</code></div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-4)' }}>
                {definition?.controls.map((control) => (
                  <span key={control.id} className="admin-chip">{control.id}</span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {isM1 ? (
                  <Link href="/audit/new?section=M1" className="btn btn-primary btn-sm">
                    Chạy M1 Audit
                  </Link>
                ) : (
                  <span className="badge badge-warning">Đang chờ nội dung nhóm viên</span>
                )}
                {isM1 && (
                  <span className="badge badge-info">Remediation chạy từ audit job detail</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {packs.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>Register Per-Control Audit Script</h3>
          <form onSubmit={handleUploadScript} style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gap: 'var(--space-2)', gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Audit Pack</span>
                <select
                  className="admin-input"
                  value={selectedPack?.packId || ''}
                  onChange={(event) => setSelectedPackId(event.target.value)}
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

      {packs.map((pack) => (
        <div key={`${pack.id}-scripts`} className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-4)' }}>
            <div>
              <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{pack.title} Scripts</h3>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {pack.ownerSection} • {pack.sections.join(', ')}
              </div>
            </div>
            <span className={`badge ${pack.isPlaceholder ? 'badge-warning' : 'badge-success'}`}>
              {pack.isPlaceholder ? 'Placeholder metadata' : 'Runtime pack'}
            </span>
          </div>

          {pack.scripts && pack.scripts.length > 0 ? (
            <div style={{ overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Control ID</th>
                    <th>Title</th>
                    <th>Section</th>
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
                      <td style={{ fontSize: 'var(--text-sm)', maxWidth: 320 }}>{script.title}</td>
                      <td><span className="admin-chip">{script.section}</span></td>
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
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(script.id)}>
                          {script.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
              {pack.isPlaceholder
                ? 'Pack placeholder này đã có manifest/control registry, nhưng chưa có audit script runtime thật.'
                : 'Pack này chưa có control script nào được đăng ký trong storage.'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
