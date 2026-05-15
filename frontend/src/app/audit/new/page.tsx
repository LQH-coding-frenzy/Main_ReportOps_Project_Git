'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getLabVms, createAuditJob } from '../../../lib/api';
import type { LabVm } from '../../../lib/types';
import { benchmarkLabel, projectConfig } from '../../../lib/project-config';
import { useToast } from '../../../components/ui/Toast';

const MODES = [
  { value: 'OPENSCAP_ONLY', label: 'OpenSCAP Only', icon: '🛡️', desc: 'Chạy OpenSCAP baseline CIS Level 1 Server' },
  { value: 'SCRIPTS_ONLY', label: 'M1 Scripts Only', icon: '📜', desc: 'Chạy uploaded shell scripts cho M1' },
  { value: 'OPENSCAP_AND_SCRIPTS', label: 'OpenSCAP + M1 Scripts', icon: '🔒', desc: 'Chạy cả OpenSCAP và shell scripts' },
];

export default function NewAuditPage() {
  const router = useRouter();
  const [vms, setVms] = useState<LabVm[]>([]);
  const [selectedVm, setSelectedVm] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState('SCRIPTS_ONLY');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    getLabVms()
      .then((data) => {
        setVms(data.filter((v) => v.status === 'RUNNING'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!selectedVm) return;
    setCreating(true);
    try {
      const job = await createAuditJob(selectedVm, selectedMode);
      router.push(`/audit/jobs/${job.id}`);
    } catch (err) {
      console.error(err);
      showToast('Không thể tạo audit job. Vui lòng thử lại.', 'error');
      setCreating(false);
    }
  }

  return (
    <main className="main-content">
      <div className="container page">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Link href="/audit" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
            ← Quay lại danh sách
          </Link>
        </div>

        <div className="page-header">
          <h1 className="page-title">🚀 Tạo Audit Job mới</h1>
          <p className="page-subtitle">
            Chọn VM target và chế độ kiểm thử cho {benchmarkLabel} • {projectConfig.benchmarkProfile}
          </p>
        </div>

        {/* Step 1: Choose VM */}
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--color-accent-primary)', color: 'white', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>1</span>
          Chọn VM Target
        </h3>
        {loading ? (
          <div className="admin-loading">
            <div className="spinner" />
            <span>Đang tải VM...</span>
          </div>
        ) : vms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🖥️</div>
            <div className="empty-state-title">Không có VM nào đang chạy</div>
            <div className="empty-state-desc">
              Bạn cần tạo một Lab VM trước khi chạy audit.
            </div>
            <Link href="/lab/new" className="btn btn-primary" style={{ marginTop: 12 }}>
              + Tạo Lab VM
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {vms.map((vm) => (
              <div
                key={vm.id}
                onClick={() => setSelectedVm(vm.id)}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-lg)',
                  border: `2px solid ${selectedVm === vm.id ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                  background: selectedVm === vm.id ? 'rgba(59,130,246,0.08)' : 'var(--color-bg-glass)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>{selectedVm === vm.id ? '✅' : '🖥️'}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{vm.name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {vm.machineType} • {vm.publicIp || 'No IP'} • {vm.osFamily}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        {/* Step 2: Choose Mode */}
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'var(--color-accent-primary)', color: 'white', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>2</span>
          Chọn chế độ Audit
        </h3>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {MODES.map((mode) => (
            <div
              key={mode.value}
              onClick={() => setSelectedMode(mode.value)}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-lg)',
                border: `2px solid ${selectedMode === mode.value ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                background: selectedMode === mode.value ? 'rgba(59,130,246,0.08)' : 'var(--color-bg-glass)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>{mode.icon}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{mode.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {mode.desc}
                </div>
              </div>
              {selectedMode === mode.value && (
                <span style={{ marginLeft: 'auto', color: 'var(--color-accent-primary)', fontWeight: 700 }}>✓</span>
              )}
            </div>
          ))}
        </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <Link href="/audit" className="btn btn-secondary">
            Hủy
          </Link>
          <button
            className="btn btn-primary"
            disabled={!selectedVm || creating}
            onClick={handleCreate}
            style={{ minWidth: 160 }}
          >
            {creating ? '⏳ Đang tạo...' : '🚀 Bắt đầu Audit'}
          </button>
        </div>
      </div>
    </main>
  );
}
