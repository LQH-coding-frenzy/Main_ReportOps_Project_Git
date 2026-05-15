'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePolling } from '../../hooks/usePolling';
import { getLabVms, purgeLabVmIndex } from '../../lib/api';
import type { LabVm } from '../../lib/types';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { useToast } from '../../components/ui/Toast';

const VM_STATUS_STYLE: Record<string, { cls: string; icon: string }> = {
  PROVISIONING: { cls: 'badge-warning', icon: '🔄' },
  RUNNING: { cls: 'badge-success', icon: '🟢' },
  STOPPED: { cls: 'badge-secondary', icon: '⏸️' },
  DESTROYING: { cls: 'badge-danger', icon: '🗑️' },
  DESTROYED: { cls: 'badge-secondary', icon: '💀' },
  ERROR: { cls: 'badge-danger', icon: '❌' },
};

export default function LabPage() {
  const [vms, setVms] = useState<LabVm[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    getLabVms()
      .then(setVms)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  usePolling(async () => {
    try {
      const next = await getLabVms();
      setVms(next);
    } catch (err) {
      console.error('Failed to refresh lab VMs:', err);
    }
  }, 5000, true);

  const runningVms = vms.filter((v) => v.status === 'RUNNING');

  function handlePurge(vm: LabVm) {
    setConfirmState({
      title: 'Xóa index VM',
      message: `Xóa index cũ của VM "${vm.name}"? Thao tác này sẽ xóa luôn lịch sử audit gắn với VM này.`,
      confirmText: 'Xóa index',
      onConfirm: async () => {
        try {
          await purgeLabVmIndex(vm.id);
          setVms((current) => current.filter((item) => item.id !== vm.id));
          showToast(`Đã xóa index VM "${vm.name}"`, 'success');
        } catch (error) {
          console.error(error);
          showToast('Không thể xóa index VM cũ', 'error');
        }
      },
    });
  }

  return (
    <main className="main-content">
      <div className="container page">
        <div className="page-header">
          <h1 className="page-title">🖥️ Lab VMs</h1>
          <p className="page-subtitle">
            Quản lý máy ảo GCP AlmaLinux 9 cho kiểm thử bảo mật
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-3" style={{ marginBottom: 'var(--space-8)' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-accent-primary)' }}>
              {vms.length}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: 4 }}>
              Total VMs
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80' }}>
              {runningVms.length}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginTop: 4 }}>
              Running
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <Link href="/lab/new" className="btn btn-primary" style={{ display: 'inline-flex', gap: 8 }}>
              + Tạo VM mới
            </Link>
          </div>
        </div>

        {/* VM List */}
        {loading ? (
          <div className="admin-loading">
            <div className="spinner" />
            <span>Đang tải danh sách VM...</span>
          </div>
        ) : vms.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🖥️</div>
              <div className="empty-state-title">Chưa có VM nào</div>
              <div className="empty-state-desc">
                Tạo VM mới để bắt đầu kiểm thử bảo mật CIS.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {vms.map((vm) => {
              const statusStyle = VM_STATUS_STYLE[vm.status] || VM_STATUS_STYLE.ERROR;
              return (
                <div key={vm.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                      <span style={{ fontSize: '1.25rem' }}>🖥️</span>
                      <span style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>{vm.name}</span>
                      <span className={`badge ${statusStyle.cls}`}>
                        {statusStyle.icon} {vm.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                      <span>📦 {vm.machineType}</span>
                      <span>💿 {vm.osFamily}</span>
                      <span>💾 {vm.diskSizeGb}GB</span>
                      {vm.publicIp && <span>🌐 {vm.publicIp}</span>}
                      {vm.gcpZone && <span>📍 {vm.gcpZone}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                    {vm.publicIp && vm.status !== 'DESTROYED' && vm.status !== 'DESTROYING' && (
                      <a
                        href={`http://${vm.publicIp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        🌐 Welcome Page
                      </a>
                    )}
                    {vm.status === 'DESTROYED' && (
                      <button className="btn btn-danger btn-sm" onClick={() => handlePurge(vm)}>
                        🗑️ Xóa Index
                      </button>
                    )}
                    <Link href={`/lab/${vm.id}`} className="btn btn-secondary btn-sm">
                      Chi tiết →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm || (async () => {})}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || 'Xác nhận'}
        confirmLoadingText="Đang xóa..."
        type="danger"
      />
    </main>
  );
}
