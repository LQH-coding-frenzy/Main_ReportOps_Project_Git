'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createLabVm } from '../../../lib/api';

const MACHINE_TYPES = [
  { value: 'e2-micro', label: 'e2-micro (0.25 vCPU, 1 GB)', cost: '~$6/mo' },
  { value: 'e2-small', label: 'e2-small (0.5 vCPU, 2 GB)', cost: '~$12/mo' },
  { value: 'e2-medium', label: 'e2-medium (1 vCPU, 4 GB)', cost: '~$24/mo' },
];

export default function NewLabVmPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [machineType, setMachineType] = useState('e2-micro');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link href="/lab" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
          ← Quay lại danh sách
        </Link>
      </div>

      <div className="page-header">
        <h1 className="page-title">+ Tạo Lab VM mới</h1>
        <p className="page-subtitle">
          Tạo máy ảo AlmaLinux 9 trên GCP cho kiểm thử CIS Benchmark
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
            {MACHINE_TYPES.map((mt) => (
              <div
                key={mt.value}
                onClick={() => setMachineType(mt.value)}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${machineType === mt.value ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                  background: machineType === mt.value ? 'rgba(59,130,246,0.08)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 'var(--text-sm)' }}>{mt.label}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{mt.cost}</span>
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
            Sẽ tự cài: nginx, openscap-scanner, scap-security-guide, jq
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
    </main>
  );
}
