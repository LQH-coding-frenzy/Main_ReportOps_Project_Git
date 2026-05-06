'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getAuditLogs } from '../../../lib/api';
import type { AuditLogEntry } from '../../../lib/types';

const ACTION_ICONS: Record<string, string> = {
  login: '🔐',
  edit_section: '✏️',
  save_document: '💾',
  generate_report: '📊',
  release: '📦',
  logout: '🚪',
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function loadLogs() {
      setLoading(true);
      try {
        const res = await getAuditLogs(page, 20);
        setLogs(res.data.logs);
        setTotalPages(res.data.pagination.totalPages);
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, [page]);

  return (
    <div className="admin-content">
      <div className="page-header">
        <h1 className="page-title">Nhật Ký Hoạt Động</h1>
        <p className="page-subtitle">Theo dõi tất cả hành động của người dùng trong hệ thống</p>
      </div>

      {loading ? (
        <div className="loading-page">
          <div className="spinner" />
          <span>Đang tải nhật ký...</span>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Hành động</th>
                  <th>Người dùng</th>
                  <th>Chi tiết</th>
                  <th>IP</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ textAlign: 'center', fontSize: '1.1rem' }}>
                      {ACTION_ICONS[log.action] || '📌'}
                    </td>
                    <td>
                      <code className="admin-code">{log.action}</code>
                    </td>
                    <td>
                      <div className="admin-user-cell">
                        {log.user.avatarUrl && (
                          <Image
                            src={log.user.avatarUrl}
                            alt=""
                            width={24}
                            height={24}
                            className="admin-user-avatar"
                            style={{ width: 24, height: 24 }}
                            unoptimized
                          />
                        )}
                        <span style={{ fontSize: 'var(--text-sm)' }}>
                          {log.user.displayName || log.user.githubUsername}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.details ? JSON.stringify(log.details).slice(0, 60) : '—'}
                    </td>
                    <td>
                      <code className="admin-code" style={{ fontSize: '11px' }}>{log.ipAddress || '—'}</code>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
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

          {logs.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <div className="empty-state-title">Chưa có nhật ký</div>
              <div className="empty-state-desc">Các hoạt động sẽ được ghi lại tại đây.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
