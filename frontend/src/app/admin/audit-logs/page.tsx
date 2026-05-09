'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getAuditLogs } from '../../../lib/api';
import type { AuditLogEntry } from '../../../lib/types';
import { Select } from '../../../components/ui/Select';

const ACTION_ICONS: Record<string, string> = {
  login: '🔐',
  logout: '🚪',
  edit_section: '✏️',
  save_document: '💾',
  generate_report: '📊',
  release: '📦',
  assign_section: '📌',
  unassign_section: '📌',
  change_user_role: '🛡️',
  freeze_release: '❄️',
};

const ACTION_COLORS: Record<string, string> = {
  login: 'badge-success',
  logout: 'badge-info',
  edit_section: 'badge-primary',
  save_document: 'badge-primary',
  generate_report: 'badge-warning',
  release: 'badge-warning',
  assign_section: 'badge-info',
  unassign_section: 'badge-info',
  change_user_role: 'badge-danger',
  freeze_release: 'badge-success',
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    async function loadLogs() {
      setLoading(true);
      try {
        const res = await getAuditLogs(page, 25);
        setLogs(res.data.logs);
        setTotalPages(res.data.pagination.totalPages);
        setTotal(res.data.pagination.total);
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, [page]);

  const filtered = actionFilter === 'all'
    ? logs
    : logs.filter(l => l.action === actionFilter);

  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Nhật Ký Hoạt Động</h1>
        <p className="page-subtitle">Toàn bộ thao tác trong hệ thống đều được ghi lại</p>
      </div>

      {/* Toolbar */}
      <div className="admin-toolbar">
        <div style={{ minWidth: '200px' }}>
          <Select
            value={actionFilter}
            onChange={value => setActionFilter(value)}
            options={[
              { value: 'all', label: 'Tất cả hành động' },
              ...uniqueActions.map(action => ({ value: action, label: action }))
            ]}
          />
        </div>
        <div className="admin-toolbar-actions">
          <span className="badge badge-info">{total} logs tổng</span>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">
          <div className="spinner" />
          <span>Đang tải nhật ký...</span>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}></th>
                  <th>Hành động</th>
                  <th>Người dùng</th>
                  <th>Chi tiết</th>
                  <th>IP</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id}>
                    <td style={{ textAlign: 'center', fontSize: '1rem' }}>
                      {ACTION_ICONS[log.action] || '📌'}
                    </td>
                    <td>
                      <span className={`badge ${ACTION_COLORS[log.action] || 'badge-info'}`} style={{ fontSize: '11px' }}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div className="admin-user-cell">
                        {log.user.avatarUrl ? (
                          <Image
                            src={log.user.avatarUrl}
                            alt=""
                            width={24}
                            height={24}
                            className="admin-user-avatar"
                            style={{ width: 24, height: 24 }}
                            unoptimized
                          />
                        ) : (
                          <div className="admin-user-avatar-placeholder" style={{ width: 24, height: 24, fontSize: '10px' }}>
                            {(log.user.displayName || log.user.githubUsername)[0].toUpperCase()}
                          </div>
                        )}
                        <span style={{ fontSize: 'var(--text-sm)' }}>
                          {log.user.displayName || log.user.githubUsername}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: '240px' }}>
                      <div className="admin-log-details">
                        {log.details
                          ? Object.entries(log.details as Record<string, unknown>).map(([k, v]) => (
                              <span key={k}>
                                <span style={{ color: 'var(--color-text-tertiary)' }}>{k}:</span>{' '}
                                <span style={{ color: 'var(--color-text-secondary)' }}>{String(v)}</span>
                              </span>
                            ))
                          : '—'
                        }
                      </div>
                    </td>
                    <td>
                      {log.ipAddress ? (
                        <code className="admin-code" style={{ fontSize: '11px' }}>{log.ipAddress}</code>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', color: 'var(--color-text-tertiary)' }}>
                      {new Date(log.createdAt).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="admin-pagination">
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                ← Trước
              </button>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                Trang {page} / {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Sau →
              </button>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <div className="empty-state-title">Không có nhật ký</div>
              <div className="empty-state-desc">Chưa có hoạt động nào được ghi lại.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
