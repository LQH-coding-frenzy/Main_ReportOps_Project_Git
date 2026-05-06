'use client';

import { useEffect, useState } from 'react';
import { getSections } from '../../../lib/api';
import type { Section } from '../../../lib/types';

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const s = await getSections();
        setSections(s);
      } catch (err) {
        console.error('Failed to load sections:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải sections...</span>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Quản Lý Sections</h1>
        <p className="page-subtitle">Phân công thành viên và quản lý cấu trúc CIS Benchmark</p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Section</th>
              <th>Tiêu đề</th>
              <th>Chương CIS</th>
              <th>Người phụ trách</th>
              <th>Trạng thái</th>
              <th>Dung lượng</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <tr key={section.id}>
                <td>
                  <code className="admin-code" style={{ color: 'var(--color-accent-primary-hover)', fontWeight: 700 }}>
                    {section.code}
                  </code>
                </td>
                <td style={{ maxWidth: '300px' }}>
                  <span style={{ fontSize: 'var(--text-sm)' }}>{section.title}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {section.cisChapters.map(ch => (
                      <span key={ch} className="admin-chip">§{ch}</span>
                    ))}
                  </div>
                </td>
                <td>
                  {section.assignees[0]
                    ? <span>{section.assignees[0].displayName || section.assignees[0].githubUsername}</span>
                    : <span className="text-muted">Chưa gán</span>
                  }
                </td>
                <td>
                  {section.document?.lastEditedAt ? (
                    <span className="badge badge-success">Đã chỉnh sửa</span>
                  ) : (
                    <span className="badge badge-warning">Chưa bắt đầu</span>
                  )}
                </td>
                <td>
                  {section.document?.fileSize
                    ? `${(section.document.fileSize / 1024).toFixed(1)} KB`
                    : <span className="text-muted">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section JSON Preview */}
      <div className="card" style={{ marginTop: 'var(--space-6)' }}>
        <h4 style={{ marginBottom: 'var(--space-3)' }}>📋 Cấu trúc Section (JSON)</h4>
        <pre className="admin-json-preview">
{JSON.stringify({
  section_key: "M1",
  title: "Filesystem, Package, Boot, Process Hardening, Crypto, Time Sync, Schedule",
  owner: "LQH",
  cis_sections: ["1.1", "1.2", "1.4", "1.5", "1.6", "2.3", "2.4"]
}, null, 2)}
        </pre>
      </div>
    </div>
  );
}
