'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { getCurrentUser, getReportEditorConfig } from '../../../../lib/api';
import type { User, EditorConfigResponse } from '../../../../lib/types';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: Record<string, unknown>) => unknown;
    };
  }
}

export default function ReportViewerPage() {
  const params = useParams();
  const buildId = parseInt(params.buildId as string, 10);
  const [user, setUser] = useState<User | null>(null);
  const [editorData, setEditorData] = useState<EditorConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<unknown>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    async function init() {
      try {
        const u = await getCurrentUser();
        if (!u || u.role !== 'LEADER') {
          window.location.href = '/dashboard';
          return;
        }
        setUser(u);

        const data = await getReportEditorConfig(buildId);
        setEditorData(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report viewer');
        setLoading(false);
      }
    }
    init();
  }, [buildId]);

  useEffect(() => {
    if (!editorData || scriptLoadedRef.current) return;

    // Load ONLYOFFICE Document Server API script
    const script = document.createElement('script');
    script.src = `${editorData.documentServerUrl}/web-apps/apps/api/documents/api.js`;
    script.async = true;

    script.onload = () => {
      scriptLoadedRef.current = true;

      if (window.DocsAPI) {
        try {
          editorRef.current = new window.DocsAPI.DocEditor('onlyoffice-report-viewer', editorData.config as unknown as Record<string, unknown>);
        } catch (err) {
          setError(`Viewer initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } else {
        setError('ONLYOFFICE API failed to load. Is the Document Server running?');
      }
    };

    script.onerror = () => {
      setError(
        'Không thể kết nối đến ONLYOFFICE Document Server. ' +
        'Kiểm tra xem Document Server đã chạy chưa và URL đúng không.'
      );
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      try {
        if (script.parentNode) {
          document.head.removeChild(script);
        }
      } catch {
        // Script may already be removed
      }
    };
  }, [editorData]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang chuẩn bị bản xem trước báo cáo...</span>
      </div>
    );
  }

  return (
    <>
      {/* Minimal top bar for viewer */}
      <div className="editor-header bg-slate-900 border-b border-white/10">
        <div className="flex items-center gap-4">
          <a href="/reports" className="btn btn-ghost btn-sm">
            ← Quay về danh sách
          </a>
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              Preview Mode (Read-Only)
            </span>
            <span className="text-sm font-medium text-white">
              Báo cáo đã ghép #{buildId}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="badge badge-primary">Leader</span>
              {user.avatarUrl && (
                <Image 
                  src={user.avatarUrl} 
                  alt="" 
                  className="navbar-avatar border border-white/20" 
                  width={32} 
                  height={32}
                  unoptimized
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Viewer container */}
      <div className="editor-container">
        {error ? (
          <div
            className="empty-state"
            style={{ flex: 1 }}
          >
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">Không thể xem báo cáo</div>
            <div className="empty-state-desc" style={{ maxWidth: 600 }}>
              {error}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => window.location.reload()} className="btn btn-primary">
                Thử lại
              </button>
              <a href="/reports" className="btn btn-secondary">
                Quay về quản lý báo cáo
              </a>
            </div>
          </div>
        ) : (
          <div
            id="onlyoffice-report-viewer"
            className="editor-frame"
            style={{ flex: 1, width: '100%' }}
          />
        )}
      </div>
    </>
  );
}
