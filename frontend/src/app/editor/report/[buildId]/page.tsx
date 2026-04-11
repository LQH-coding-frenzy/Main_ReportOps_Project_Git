'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { canonicalizeReportDocx, getCurrentUser, getReportEditorConfig } from '../../../../lib/api';
import { useToast } from '../../../../components/ui/Toast';
import type { User, EditorConfigResponse } from '../../../../lib/types';

type DownloadState = 'idle' | 'requested' | 'canonicalizing' | 'ready' | 'error';

interface DownloadAsEvent {
  data?: {
    fileType?: string;
    title?: string;
    url?: string;
  };
}

interface OnlyOfficeDocEditor {
  downloadAs: (format?: string) => void;
  destroyEditor?: () => void;
}

function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_self';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: Record<string, unknown>) => unknown;
    };
  }
}

export default function ReportViewerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const buildId = parseInt(params.buildId as string, 10);
  const shouldAutoDownload = searchParams.get('download') === 'docx';
  const [user, setUser] = useState<User | null>(null);
  const [editorData, setEditorData] = useState<EditorConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const editorRef = useRef<OnlyOfficeDocEditor | null>(null);
  const scriptLoadedRef = useRef(false);
  const downloadInFlightRef = useRef(false);
  const autoDownloadTriggeredRef = useRef(false);
  const { showToast } = useToast();

  const removeDownloadIntentFromUrl = useCallback(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('download');
    const search = nextUrl.search ? `${nextUrl.search}` : '';
    window.history.replaceState({}, '', `${nextUrl.pathname}${search}`);
  }, []);

  const handleDownloadAs = useCallback(
    async (event: DownloadAsEvent) => {
      const onlyOfficeUrl = event.data?.url;
      if (!onlyOfficeUrl) {
        setDownloadState('error');
        showToast('ONLYOFFICE không trả về URL tải file hợp lệ', 'error');
        return;
      }

      if (downloadInFlightRef.current) {
        return;
      }

      downloadInFlightRef.current = true;
      setDownloadState('canonicalizing');

      try {
        const canonicalized = await canonicalizeReportDocx(buildId, onlyOfficeUrl);
        setDownloadState('ready');
        showToast('Đã chuẩn hóa DOCX từ ONLYOFFICE. Đang tải xuống...', 'success');
        triggerDownload(canonicalized.downloadUrl);
        removeDownloadIntentFromUrl();
      } catch (err) {
        setDownloadState('error');
        showToast(
          `Chuẩn hóa DOCX thất bại: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`,
          'error'
        );
      } finally {
        downloadInFlightRef.current = false;
      }
    },
    [buildId, removeDownloadIntentFromUrl, showToast]
  );

  const requestOnlyOfficeDownload = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || typeof editor.downloadAs !== 'function') {
      showToast('Editor chưa sẵn sàng để tải file', 'error');
      return;
    }

    if (downloadInFlightRef.current) {
      return;
    }

    setDownloadState('requested');
    editor.downloadAs('docx');
  }, [showToast]);

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
          const config = editorData.config as unknown as Record<string, unknown>;
          const baseEvents =
            typeof config.events === 'object' && config.events !== null
              ? (config.events as Record<string, unknown>)
              : {};

          const enrichedConfig: Record<string, unknown> = {
            ...config,
            events: {
              ...baseEvents,
              onDownloadAs: handleDownloadAs,
            },
          };

          editorRef.current = new window.DocsAPI.DocEditor(
            'onlyoffice-report-viewer',
            enrichedConfig
          ) as OnlyOfficeDocEditor;

          if (shouldAutoDownload && !autoDownloadTriggeredRef.current) {
            autoDownloadTriggeredRef.current = true;
            setDownloadState('requested');
            window.setTimeout(() => {
              const editor = editorRef.current;
              if (!editor || typeof editor.downloadAs !== 'function') {
                setDownloadState('error');
                showToast('Không thể kích hoạt tải DOCX từ ONLYOFFICE', 'error');
                return;
              }

              editor.downloadAs('docx');
            }, 900);
          }
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
        if (editorRef.current && typeof editorRef.current.destroyEditor === 'function') {
          editorRef.current.destroyEditor();
        }

        if (script.parentNode) {
          document.head.removeChild(script);
        }
      } catch {
        // Script may already be removed
      }
    };
  }, [editorData, handleDownloadAs, shouldAutoDownload, showToast]);

  const downloadStatusLabel =
    downloadState === 'requested'
      ? 'Đang yêu cầu ONLYOFFICE tạo DOCX...'
      : downloadState === 'canonicalizing'
        ? 'Đang chuẩn hóa DOCX trước khi tải...'
        : downloadState === 'ready'
          ? 'DOCX đã chuẩn hóa và sẵn sàng tải'
          : downloadState === 'error'
            ? 'Tải DOCX thất bại, vui lòng thử lại'
            : '';

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
          <button
            type="button"
            onClick={requestOnlyOfficeDownload}
            className="btn btn-success btn-sm"
            disabled={downloadState === 'requested' || downloadState === 'canonicalizing'}
            title="Tải DOCX qua ONLYOFFICE và chuẩn hóa artifact"
          >
            ⬇️ Download DOCX
          </button>
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

      {downloadStatusLabel && (
        <div className="container" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
          <span className="text-xs text-muted">{downloadStatusLabel}</span>
        </div>
      )}

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
