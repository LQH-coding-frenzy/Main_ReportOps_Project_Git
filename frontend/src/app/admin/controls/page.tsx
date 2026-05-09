'use client';

import { useState } from 'react';
import { Select } from '../../../components/ui/Select';

const SAMPLE_CONTROLS = [
  { id: '1.1.1.1', title: 'Ensure cramfs kernel module is not available', owner: 'M1', risk: 'Medium', auto: true, enabled: true },
  { id: '1.1.2.1.2', title: 'Ensure nodev option set on /tmp partition', owner: 'M1', risk: 'Medium', auto: true, enabled: true },
  { id: '1.2.1', title: 'Ensure GPG keys are configured', owner: 'M1', risk: 'High', auto: true, enabled: true },
  { id: '2.1.1', title: 'Ensure xinetd is not installed', owner: 'M2', risk: 'Low', auto: true, enabled: true },
  { id: '3.1.1', title: 'Ensure IPv6 status is identified', owner: 'M2', risk: 'Medium', auto: false, enabled: true },
  { id: '5.1.20', title: 'Ensure sshd PermitRootLogin is disabled', owner: 'M3', risk: 'Critical', auto: true, enabled: true },
  { id: '5.2.1', title: 'Ensure sudo is installed', owner: 'M3', risk: 'High', auto: true, enabled: true },
  { id: '6.3.1.4', title: 'Ensure auditd service is enabled and active', owner: 'M4', risk: 'High', auto: true, enabled: true },
  { id: '7.1.1', title: 'Ensure permissions on /etc/passwd are configured', owner: 'M4', risk: 'Medium', auto: true, enabled: false },
];

const riskColor: Record<string, string> = {
  Critical: 'badge-danger',
  High: 'badge-warning',
  Medium: 'badge-info',
  Low: 'badge-success',
};

export default function AdminControlsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOwner, setFilterOwner] = useState('all');

  const filtered = SAMPLE_CONTROLS.filter(c => {
    const matchSearch = c.id.includes(searchQuery) || c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchOwner = filterOwner === 'all' || c.owner === filterOwner;
    return matchSearch && matchOwner;
  });

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">CIS Controls</h1>
        <p className="page-subtitle">Quản lý các tiêu chí kiểm tra bảo mật CIS Benchmark</p>
      </div>

      <div className="admin-toolbar">
        <input
          type="text"
          className="input admin-search"
          placeholder="🔍 Tìm kiếm theo ID hoặc tiêu đề..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <div style={{ minWidth: '160px' }}>
          <Select
            value={filterOwner}
            onChange={value => setFilterOwner(value)}
            options={[
              { value: 'all', label: 'Tất cả Sections' },
              { value: 'M1', label: 'M1' },
              { value: 'M2', label: 'M2' },
              { value: 'M3', label: 'M3' },
              { value: 'M4', label: 'M4' }
            ]}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Control ID</th>
              <th>Tiêu đề</th>
              <th>Section</th>
              <th>Risk</th>
              <th>Loại</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ctrl => (
              <tr key={ctrl.id}>
                <td><code className="admin-code">{ctrl.id}</code></td>
                <td style={{ fontSize: 'var(--text-sm)', maxWidth: '350px' }}>{ctrl.title}</td>
                <td><span className="admin-chip">{ctrl.owner}</span></td>
                <td><span className={`badge ${riskColor[ctrl.risk]}`}>{ctrl.risk}</span></td>
                <td>
                  <span className={`badge ${ctrl.auto ? 'badge-success' : 'badge-warning'}`}>
                    {ctrl.auto ? 'Auto' : 'Manual'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${ctrl.enabled ? 'badge-success' : 'badge-danger'}`}>
                    {ctrl.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* JSON Preview */}
      <div className="card" style={{ marginTop: 'var(--space-6)' }}>
        <h4 style={{ marginBottom: 'var(--space-3)' }}>🔒 Cấu trúc Control (JSON)</h4>
        <pre className="admin-json-preview">
{JSON.stringify({
  control_id: "5.1.20",
  title: "Ensure sshd PermitRootLogin is disabled",
  owner_section: "M3",
  risk: "Critical",
  automated: true,
  enabled: true
}, null, 2)}
        </pre>
      </div>
    </div>
  );
}
