'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getAuditPacks, toggleAuditScript } from '../../../lib/api';
import type { AuditPack } from '../../../lib/types';
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
            <strong>CIS AlmaLinux OS 9 Benchmark v2.0.0 — Level 1 Server</strong>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Upload các file .sh theo format CIS stdout. Script phải có shebang bash,
              không chứa lệnh phá hoại, và phải thuộc scope M1. Parser sẽ tự detect
              PASS/FAIL/MANUAL/ERROR từ stdout.
            </p>
          </div>
        </div>
      </div>

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
