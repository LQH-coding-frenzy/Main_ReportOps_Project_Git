'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createAuditJob, getAuditPacks, getLabVms } from '../../../lib/api';
import type { AuditPack, LabVm } from '../../../lib/types';
import { benchmarkLabel, projectConfig } from '../../../lib/project-config';
import { useToast } from '../../../components/ui/Toast';
import { FRONTEND_SECTION_DEFINITION_MAP } from '../../../lib/section-definitions';

const MODES = [
  { value: 'OPENSCAP_ONLY', label: 'OpenSCAP Only', icon: '🛡️', desc: 'Chạy baseline scan trên VM' },
  { value: 'SCRIPTS_ONLY', label: 'Shell Scripts Only', icon: '📜', desc: 'Chạy control scripts của pack được chọn' },
  { value: 'OPENSCAP_AND_SCRIPTS', label: 'OpenSCAP + Scripts', icon: '🔒', desc: 'Chạy cả baseline và control scripts' },
];

export default function NewAuditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vms, setVms] = useState<LabVm[]>([]);
  const [packs, setPacks] = useState<AuditPack[]>([]);
  const [selectedVm, setSelectedVm] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState('SCRIPTS_ONLY');
  const [selectedSection, setSelectedSection] = useState<'M1' | 'M2' | 'M3' | 'M4'>('M1');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const [vmData, packData] = await Promise.all([getLabVms(), getAuditPacks()]);
        setVms(vmData.filter((vm) => vm.status === 'RUNNING'));
        setPacks(packData);

        const requestedSection = searchParams.get('section') as 'M1' | 'M2' | 'M3' | 'M4' | null;
        if (requestedSection && FRONTEND_SECTION_DEFINITION_MAP[requestedSection]) {
          setSelectedSection(requestedSection);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [searchParams]);

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.ownerSection === selectedSection) || null,
    [packs, selectedSection]
  );
  const selectedDefinition = FRONTEND_SECTION_DEFINITION_MAP[selectedSection];
  const packReady = selectedPack ? !selectedPack.isPlaceholder : false;

  async function handleCreate() {
    if (!selectedVm) {
      return;
    }

    if (!packReady) {
      showToast(`Pack ${selectedSection} hiện đang ở trạng thái placeholder`, 'error');
      return;
    }

    setCreating(true);
    try {
      const job = await createAuditJob(selectedVm, selectedMode, selectedSection);
      router.push(`/audit/jobs/${job.id}`);
    } catch (err) {
      console.error(err);
      showToast('Không thể tạo audit job. Vui lòng thử lại.', 'error');
      setCreating(false);
    }
  }

  return (
    <div className="admin-content">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Link href="/audit" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
            ← Quay lại danh sách
          </Link>
        </div>

        <div className="page-header">
          <h1 className="page-title">Tạo Audit Job mới</h1>
          <p className="page-subtitle">
            Chọn VM target, section pack và mode chạy cho {benchmarkLabel} • {projectConfig.benchmarkProfile}
          </p>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: 'var(--color-accent-primary)', color: 'white', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>1</span>
            Chọn section pack
          </h3>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {(['M1', 'M2', 'M3', 'M4'] as const).map((sectionCode) => {
              const definition = FRONTEND_SECTION_DEFINITION_MAP[sectionCode];
              const pack = packs.find((item) => item.ownerSection === sectionCode);
              const ready = pack ? !pack.isPlaceholder : false;

              return (
                <div
                  key={sectionCode}
                  onClick={() => setSelectedSection(sectionCode)}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-lg)',
                    border: `2px solid ${selectedSection === sectionCode ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                    background: selectedSection === sectionCode ? 'rgba(59,130,246,0.08)' : 'var(--color-bg-glass)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{selectedSection === sectionCode ? '✅' : '📦'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <strong>{sectionCode}</strong>
                      <span className={`badge ${ready ? 'badge-success' : 'badge-warning'}`}>
                        {ready ? 'Ready' : 'Placeholder'}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600 }}>{definition.title}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{definition.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: 'var(--color-accent-primary)', color: 'white', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>2</span>
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
              <div className="empty-state-desc">Bạn cần tạo một Lab VM trước khi chạy audit.</div>
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

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: 'var(--color-accent-primary)', color: 'white', borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>3</span>
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
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{mode.desc}</div>
                </div>
                {selectedMode === mode.value && (
                  <span style={{ marginLeft: 'auto', color: 'var(--color-accent-primary)', fontWeight: 700 }}>✓</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>Tóm tắt pack đang chọn</h3>
          <p style={{ color: 'var(--color-text-secondary)' }}>{selectedDefinition.flowRole}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'var(--space-3)' }}>
            {selectedDefinition.controls.map((control) => (
              <span key={control.id} className="admin-chip">{control.id}</span>
            ))}
          </div>
          {!packReady && (
            <div className="admin-note" style={{ marginTop: 'var(--space-4)' }}>
              <span>⚠️</span>
              <span>Pack {selectedSection} chưa có scripts. Hãy chạy <code>npm run audit:import-all</code> trên server để upload scripts.</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <Link href="/audit" className="btn btn-secondary">Hủy</Link>
          <button
            className="btn btn-primary"
            disabled={!selectedVm || creating || !packReady}
            onClick={handleCreate}
            style={{ minWidth: 180 }}
          >
            {creating ? '⏳ Đang tạo...' : `🚀 Bắt đầu ${selectedSection} Audit`}
          </button>
        </div>
    </div>
  );
}
