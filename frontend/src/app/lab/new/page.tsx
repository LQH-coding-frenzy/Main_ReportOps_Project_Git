'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createLabVm, getCurrentUser } from '../../../lib/api';
import { benchmarkLabel } from '../../../lib/project-config';
import { LAB_VM_MACHINE_TYPES } from '../../../lib/lab-vm-hardware';
import { hasCapability } from '../../../lib/system-roles';

export default function NewLabVmPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [machineType, setMachineType] = useState('e2-medium');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function guard() {
      const currentUser = await getCurrentUser();
      if (!currentUser || !hasCapability(currentUser, 'manage_lab')) {
        window.location.href = '/dashboard';
      }
    }

    guard().catch(console.error);
  }, []);

  async function handleCreate() {
    if (!name.trim()) {
      setError('Tên VM không được để trống');
      return;
    }
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) || name.length < 3) {
      setError('Tên VM phải bắt đầu bằng chữ thường, chỉ chứa a-z, 0-9, dấu gạch ngang, tối thiểu 3 ký tự');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const vm = await createLabVm(name, machineType);
      router.push(`/lab/${vm.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo VM';
      setError(msg);
      setCreating(false);
    }
  }

  return (
    <main className="main-content">
      <div className="container page">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Link href="/lab" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
            ← Quay lại danh sách
          </Link>
        </div>

        <div className="page-header">
          <h1 className="page-title">+ Tạo Lab VM mới</h1>
          <p className="page-subtitle">
            Tạo máy ảo AlmaLinux 9 trên GCP cho kiểm thử {benchmarkLabel}
          </p>
        </div>

        <div className="card" style={{ maxWidth: 600 }}>
          {/* VM Name */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              Tên VM
            </label>
            <input
              type="text"
              className="input admin-search"
              placeholder="reportops-audit-vm-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Chỉ chứa a-z, 0-9, dấu gạch ngang. Bắt đầu bằng chữ, tối thiểu 3 ký tự.
            </div>
          </div>

          {/* Machine Type */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              Loại máy
            </label>
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              {LAB_VM_MACHINE_TYPES.map((mt) => (
                <div
                  key={mt.machineType}
                  onClick={() => setMachineType(mt.machineType)}
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${machineType === mt.machineType ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                    background: machineType === mt.machineType ? 'rgba(59,130,246,0.08)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{mt.label}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {mt.vcpu} vCPU • {mt.memoryGb} GB RAM • {mt.note}
                    </div>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{mt.monthlyCost}</span>
                </div>
              ))}
            </div>
          </div>

          {/* OS Info */}
          <div style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-3)', background: 'var(--color-bg-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              OS Configuration
            </div>
            <div style={{ fontSize: 'var(--text-sm)' }}>
              📦 AlmaLinux 9 • 💾 20 GB disk • 🌐 Public IP • 🔒 SSH enabled
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Gói này ưu tiên welcome page và SSH ổn định trước, sau đó mới cài audit packages.
            </div>
          </div>

          {error && (
            <div style={{ padding: 'var(--space-3)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', color: '#f87171', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <Link href="/lab" className="btn btn-secondary">Hủy</Link>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating}
              style={{ minWidth: 140 }}
            >
              {creating ? '⏳ Đang tạo...' : '🚀 Tạo VM'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
