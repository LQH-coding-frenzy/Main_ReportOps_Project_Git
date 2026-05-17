'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { usePolling } from '../../../hooks/usePolling';
import { getCurrentUser, getLabVm, getLabVmObservability, deleteLabVm, purgeLabVmIndex } from '../../../lib/api';
import { getLabVmHardwareProfile } from '../../../lib/lab-vm-hardware';
import type { LabVm, AuditJob, LabVmObservability, User } from '../../../lib/types';
import { ConfirmModal } from '../../../components/ui/ConfirmModal';
import { SshTerminalModal } from '../../../components/ui/SshTerminalModal';
import { useToast } from '../../../components/ui/Toast';
import { hasCapability } from '../../../lib/system-roles';

function withGoogleAccountChooser(targetUrl: string): string {
  return `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(targetUrl)}`;
}

export default function LabVmDetailPage() {
  const params = useParams();
  const vmId = parseInt(params.vmId as string, 10);
  const [, setUser] = useState<User | null>(null);
  const [vm, setVm] = useState<(LabVm & { auditJobs?: Pick<AuditJob, 'id' | 'status' | 'score' | 'riskLevel' | 'createdAt' | 'finishedAt' | 'mode'>[] }) | null>(null);
  const [observability, setObservability] = useState<LabVmObservability | null>(null);
  const [observabilityError, setObservabilityError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSshOpen, setIsSshOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmText: string;
    confirmLoadingText: string;
    type: 'danger' | 'primary';
    onConfirm: () => Promise<void>;
  } | null>(null);
  const observableVmId = vm?.id ?? null;
  const isObservabilityEnabled = !!vm && vm.status === 'RUNNING' && !!vm.publicIp;
  const { showToast } = useToast();

  useEffect(() => {
    if (!vmId) return;
    async function init() {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser || !hasCapability(currentUser, 'manage_lab')) {
          window.location.href = '/dashboard';
          return;
        }

        setUser(currentUser);
        const data = await getLabVm(vmId);
        setVm(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [vmId]);

  usePolling(async () => {
    if (!vmId) return;
    try {
      const next = await getLabVm(vmId);
      setVm(next);
    } catch (err) {
      console.error('Failed to refresh VM detail:', err);
    }
  }, 5000, !!vm && (vm.status === 'PROVISIONING' || vm.status === 'DESTROYING'));

  useEffect(() => {
    if (!observableVmId || !isObservabilityEnabled) {
      return;
    }

    let isMounted = true;
    const currentVmId = observableVmId;

    async function loadObservability() {
      try {
        const data = await getLabVmObservability(currentVmId);
        if (!isMounted) return;
        setObservability(data);
        setObservabilityError(null);
      } catch (error) {
        if (!isMounted) return;
        setObservability(null);
        setObservabilityError(error instanceof Error ? error.message : 'Không thể tải observability');
      }
    }

    loadObservability();
    return () => {
      isMounted = false;
    };
  }, [observableVmId, isObservabilityEnabled]);

  usePolling(async () => {
    if (!observableVmId || !isObservabilityEnabled) return;
    try {
      const data = await getLabVmObservability(observableVmId);
      setObservability(data);
      setObservabilityError(null);
    } catch (error) {
      setObservability(null);
      setObservabilityError(error instanceof Error ? error.message : 'Không thể tải observability');
    }
  }, 10000, isObservabilityEnabled);

  function handleDestroy() {
    if (!vm) return;

    setConfirmState({
      title: `Destroy VM "${vm.name}"`,
      message: 'VM sẽ chuyển sang trạng thái DESTROYING và bị hủy bởi Terraform runner.',
      confirmText: 'Destroy VM',
      confirmLoadingText: 'Đang gửi lệnh destroy...',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteLabVm(vm.id);
          setVm({ ...vm, status: 'DESTROYING' });
          showToast(`Đã gửi lệnh destroy cho VM "${vm.name}"`, 'success');
        } catch (err) {
          console.error(err);
          showToast('Không thể hủy VM', 'error');
        }
      },
    });
  }

  function handlePurge() {
    if (!vm) return;

    setConfirmState({
      title: `Xóa index VM "${vm.name}"`,
      message: 'Thao tác này sẽ xóa index VM cũ và toàn bộ lịch sử audit gắn với VM này.',
      confirmText: 'Xóa index',
      confirmLoadingText: 'Đang xóa...',
      type: 'danger',
      onConfirm: async () => {
        try {
          await purgeLabVmIndex(vm.id);
          window.location.href = '/lab';
        } catch (err) {
          console.error(err);
          showToast('Không thể xóa index VM cũ', 'error');
        }
      },
    });
  }

  if (loading) {
    return (
      <main className="main-content">
        <div className="admin-loading"><div className="spinner" /><span>Đang tải...</span></div>
      </main>
    );
  }

  if (!vm) {
    return (
      <main className="main-content">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <div className="empty-state-title">Không tìm thấy VM</div>
          <Link href="/lab" className="btn btn-secondary" style={{ marginTop: 16 }}>← Quay lại</Link>
        </div>
      </main>
    );
  }

  const gcpConsoleUrl = withGoogleAccountChooser(
    `https://console.cloud.google.com/compute/instancesDetail/zones/${vm.gcpZone || 'asia-southeast1-c'}/instances/${vm.gcpInstanceName || vm.name}?project=${vm.gcpProjectId || ''}`
  );
  const gcpSshUrl = withGoogleAccountChooser(
    `https://ssh.cloud.google.com/v2/ssh/projects/${vm.gcpProjectId || ''}/zones/${vm.gcpZone || 'asia-southeast1-c'}/instances/${vm.gcpInstanceName || vm.name}`
  );
  const hardwareProfile = getLabVmHardwareProfile(vm.machineType);

  return (
    <main className="main-content">
      <div className="container page">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Link href="/lab" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
            ← Quay lại danh sách
          </Link>
        </div>

        <div className="page-header">
          <h1 className="page-title">🖥️ {vm.name}</h1>
          <p className="page-subtitle">
            {vm.machineType} • {vm.osFamily} • {vm.diskSizeGb}GB
          </p>
        </div>

        {/* Status + Actions */}
        <div className="card" style={{ marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span className={`badge ${vm.status === 'RUNNING' ? 'badge-success' : vm.status === 'ERROR' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: 14, padding: '4px 16px' }}>
              {vm.status === 'RUNNING' ? '🟢' : vm.status === 'ERROR' ? '❌' : '🔄'} {vm.status}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {vm.publicIp && vm.status !== 'DESTROYED' && vm.status !== 'DESTROYING' && (
              <>
                <a href={`http://${vm.publicIp}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                  🌐 Welcome Page
                </a>
                {vm.gcpProjectId && (
                <a
                  href={gcpConsoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  ☁️ GCP Console
                </a>
                )}
                {vm.gcpProjectId && (
                <a
                  href={gcpSshUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  📟 GCP SSH
                </a>
                )}
                {vm.status === 'RUNNING' && (
                <button className="btn btn-primary btn-sm" onClick={() => setIsSshOpen(true)}>
                  &gt;_ Web SSH
                </button>
                )}
                {vm.status === 'RUNNING' && (
                <Link href={`/audit/new`} className="btn btn-primary btn-sm">
                  🚀 Run Audit
                </Link>
                )}
              </>
            )}
            {vm.latestRunUrl && (
              <a
                href={vm.latestRunUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
              >
                📋 View Log
              </a>
            )}
            {vm.status !== 'DESTROYED' && vm.status !== 'DESTROYING' && (
              <button className="btn btn-danger btn-sm" onClick={handleDestroy}>
                🗑️ Destroy
              </button>
            )}
            {vm.status === 'DESTROYED' && (
              <button className="btn btn-danger btn-sm" onClick={handlePurge}>
                🗑️ Xóa Index
              </button>
            )}
          </div>
        </div>

        {/* VM Details */}
        <div className="grid grid-2" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>📋 Thông tin VM</h3>
            <div style={{ fontSize: 'var(--text-sm)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Public IP:</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{vm.publicIp || '—'}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>Zone:</span>
              <span>{vm.gcpZone || '—'}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>Instance:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{vm.gcpInstanceName || '—'}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>Token:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{vm.verificationToken || '—'}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>Created:</span>
              <span>{new Date(vm.createdAt).toLocaleString('vi-VN')}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>Created by:</span>
              <span>{vm.createdBy.displayName || vm.createdBy.githubUsername}</span>
            </div>
          </div>

          {vm.errorMessage && (
            <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', color: '#f87171' }}>⚠️ Error</h3>
              <pre style={{ fontSize: 'var(--text-xs)', color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {vm.errorMessage}
              </pre>
            </div>
          )}
        </div>

        <div className="grid grid-2" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>🧩 Hardware Profile</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Machine Type</div>
                <div style={{ fontWeight: 700 }}>{vm.machineType}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>vCPU</div>
                <div style={{ fontWeight: 700 }}>{hardwareProfile ? hardwareProfile.vcpu : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>RAM</div>
                <div style={{ fontWeight: 700 }}>{hardwareProfile ? `${hardwareProfile.memoryGb} GB` : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Disk</div>
                <div style={{ fontWeight: 700 }}>{vm.diskSizeGb} GB</div>
              </div>
            </div>
            {hardwareProfile && (
              <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {hardwareProfile.note} • {hardwareProfile.monthlyCost}
              </div>
            )}
          </div>

          {vm.status !== 'DESTROYED' && (
            <div className="card">
              <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>📈 Live Observability</h3>
              {observability ? (
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>CPU Model</div>
                      <div style={{ fontWeight: 700 }}>{observability.cpuModel || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>CPU Threads</div>
                      <div style={{ fontWeight: 700 }}>{observability.cpuCount}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>CPU Pressure</div>
                      <div style={{ fontWeight: 700 }}>{observability.cpuPressurePercent}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Uptime</div>
                      <div style={{ fontWeight: 700 }}>{observability.uptimeHuman || '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Load Avg</div>
                      <div style={{ fontWeight: 700 }}>{observability.load1.toFixed(2)} / {observability.load5.toFixed(2)} / {observability.load15.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>RAM Used</div>
                      <div style={{ fontWeight: 700 }}>{observability.memoryUsedMb} MB / {observability.memoryTotalMb} MB</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>RAM Usage</div>
                      <div style={{ fontWeight: 700 }}>{observability.memoryUsagePercent}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Root Disk</div>
                      <div style={{ fontWeight: 700 }}>{observability.rootDiskUsedMb} MB / {observability.rootDiskTotalMb} MB ({observability.rootDiskUsagePercent}%)</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <span className={`badge ${observability.nginxStatus === 'active' ? 'badge-success' : 'badge-danger'}`}>nginx: {observability.nginxStatus}</span>
                    <span className={`badge ${observability.sshdStatus === 'active' ? 'badge-success' : 'badge-danger'}`}>sshd: {observability.sshdStatus}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Updated: {new Date(observability.collectedAt).toLocaleString('vi-VN')}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 'var(--text-sm)', color: observabilityError ? '#f87171' : 'var(--color-text-muted)' }}>
                  {observabilityError || 'Đang tải observability...'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Audit Jobs */}
        {vm.auditJobs && vm.auditJobs.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>📊 Recent Audit Jobs</h3>
            </div>
            <div className="table-responsive">
              <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Risk</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vm.auditJobs.map((j: Pick<AuditJob, 'id' | 'status' | 'score' | 'riskLevel' | 'createdAt' | 'finishedAt' | 'mode'>) => (
                  <tr key={j.id}>
                    <td><code className="admin-code">#{j.id}</code></td>
                    <td><span className="badge badge-info" style={{ fontSize: 10 }}>{j.mode.replace(/_/g, ' ')}</span></td>
                    <td><span className={`badge ${j.status === 'COMPLETED' ? 'badge-success' : j.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}`}>{j.status}</span></td>
                    <td style={{ fontWeight: 700 }}>{j.score != null ? `${j.score.toFixed(0)}%` : '—'}</td>
                    <td>{j.riskLevel || '—'}</td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{new Date(j.createdAt).toLocaleString('vi-VN')}</td>
                    <td><Link href={`/audit/jobs/${j.id}`} className="btn btn-secondary btn-sm">Chi tiết →</Link></td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        )}

        {isSshOpen ? (
          <SshTerminalModal
            isOpen={isSshOpen}
            onClose={() => setIsSshOpen(false)}
            vmId={vm.status === 'RUNNING' ? vm.id : null}
            vmName={vm.name}
          />
        ) : null}

        <ConfirmModal
          isOpen={!!confirmState}
          onClose={() => setConfirmState(null)}
          onConfirm={confirmState?.onConfirm || (async () => {})}
          title={confirmState?.title || ''}
          message={confirmState?.message || ''}
          confirmText={confirmState?.confirmText || 'Xác nhận'}
          confirmLoadingText={confirmState?.confirmLoadingText || 'Đang xử lý...'}
          type={confirmState?.type || 'primary'}
        />
      </div>
    </main>
  );
}
