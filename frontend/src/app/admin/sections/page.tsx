'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSections, getAdminUsers, adminAssignSection, adminUnassignSection } from '../../../lib/api';
import type { Section } from '../../../lib/types';
import type { AdminUser } from '../../../lib/api';
import { useToast } from '../../../components/ui/Toast';
import { Select } from '../../../components/ui/Select';
import { FRONTEND_SECTION_DEFINITION_MAP } from '../../../lib/section-definitions';

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<number | null>(null); // sectionId being modified
  const [selectedUsers, setSelectedUsers] = useState<Record<number, string>>({}); // sectionId -> userId string
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([getSections(), getAdminUsers()]);
      setSections(s);
      setUsers(u);
    } catch (err) {
      console.error('Failed to load sections:', err);
      showToast('Không thể tải dữ liệu sections', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAssign(sectionId: number) {
    const userId = parseInt(selectedUsers[sectionId] ?? '', 10);
    if (!userId || isNaN(userId)) {
      showToast('Vui lòng chọn người dùng trước', 'error');
      return;
    }
    setAssigning(sectionId);
    try {
      await adminAssignSection(sectionId, userId);
      showToast('Đã phân công thành công!', 'success');
      await loadData();
      setSelectedUsers(prev => ({ ...prev, [sectionId]: '' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      showToast(`Phân công thất bại: ${msg}`, 'error');
    } finally {
      setAssigning(null);
    }
  }

  async function handleUnassign(sectionId: number, userId: number, userName: string) {
    setAssigning(sectionId);
    try {
      await adminUnassignSection(sectionId, userId);
      showToast(`Đã xóa phân công cho ${userName}`, 'success');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      showToast(`Xóa phân công thất bại: ${msg}`, 'error');
    } finally {
      setAssigning(null);
    }
  }

  if (loading) {
    return (
      <div className="admin-content">
        <div className="admin-loading">
          <div className="spinner" />
          <span>Đang tải sections...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Quản Lý Sections</h1>
        <p className="page-subtitle">Phân công thành viên và quản lý cấu trúc CIS Benchmark</p>
      </div>

      {/* Team assignment guide */}
      <div className="card admin-info-card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="admin-section-assignment-guide">
          <div className="admin-assignment-guide-title">📋 Phân công hiện tại theo nhóm</div>
          <div className="admin-assignment-guide-grid">
            {[
              { key: 'M1', name: 'LQH (Leader)' },
              { key: 'M2', name: 'Bao Nguyên' },
              { key: 'M3', name: 'Trương Duy' },
              { key: 'M4', name: 'Lâm Hoàng Phước' },
            ].map(g => (
              <div key={g.key} className="admin-assignment-guide-item">
                <span className="admin-chip">{g.key}</span>
                <span className="admin-assignment-guide-name">{g.name}</span>
                <span className="admin-assignment-guide-chapters">
                  {FRONTEND_SECTION_DEFINITION_MAP[g.key as keyof typeof FRONTEND_SECTION_DEFINITION_MAP].controls.map((control) => control.id).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-sections-list">
        {sections.map(section => (
          <div key={section.id} className="card admin-section-item">
            {/* Section Header */}
            <div className="admin-section-header">
              <div className="admin-section-identity">
                <code className="admin-code" style={{ color: 'var(--color-accent-primary-hover)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                  {section.code}
                </code>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    {section.title}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {section.cisChapters.map(ch => (
                      <span key={ch} className="admin-chip" style={{ fontSize: '11px' }}>§{ch}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: 8 }}>
                    {section.controls.map(control => (
                      <span key={control.id} className="admin-chip" style={{ fontSize: '11px' }}>{control.id}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="admin-section-status">
                {section.document?.lastEditedAt ? (
                  <span className="badge badge-success">✓ Đã chỉnh sửa</span>
                ) : (
                  <span className="badge badge-warning">○ Chưa bắt đầu</span>
                )}
                {section.document?.fileSize && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {(section.document.fileSize / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            </div>

            {/* Current Assignees */}
            <div className="admin-section-assignees">
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Người phụ trách
              </div>
              <div className="admin-assignee-list">
                {section.assignees.length > 0 ? (
                  section.assignees.map(assignee => (
                    <div key={assignee.id} className="admin-assignee-tag">
                      <span>{assignee.displayName || assignee.githubUsername}</span>
                      <button
                        className="admin-assignee-remove"
                        disabled={assigning === section.id}
                        onClick={() => handleUnassign(section.id, assignee.id, assignee.displayName || assignee.githubUsername)}
                        title="Hủy phân công"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Chưa có người phụ trách</span>
                )}
              </div>
            </div>

            {/* Assign New Member */}
            <div className="admin-section-assign-row">
              <div style={{ flex: 1, maxWidth: '360px' }}>
                <Select
                  value={selectedUsers[section.id] ?? ''}
                  onChange={value => setSelectedUsers(prev => ({ ...prev, [section.id]: value }))}
                  disabled={assigning === section.id}
                  placeholder="— Chọn thành viên để thêm —"
                  options={users.map(u => ({
                    value: String(u.id),
                    label: `${u.displayName || u.githubUsername} (${u.roles.join(' + ')})`
                  }))}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleAssign(section.id)}
                disabled={assigning === section.id || !selectedUsers[section.id]}
              >
                {assigning === section.id ? '⏳ Đang xử lý...' : '+ Phân công'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
