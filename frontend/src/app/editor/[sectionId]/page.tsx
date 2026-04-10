'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { getCurrentUser, getEditorConfig } from '../../../lib/api';
import type { User, EditorConfigResponse } from '../../../lib/types';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: Record<string, unknown>) => unknown;
    };
  }
}

export default function EditorPage() {
  const params = useParams();
  const sectionId = parseInt(params.sectionId as string, 10);
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
        if (!u) {
          window.location.href = '/';
          return;
        }
        setUser(u);

        const data = await getEditorConfig(sectionId);
        setEditorData(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load editor');
        setLoading(false);
      }
    }
    init();
  }, [sectionId]);

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
          editorRef.current = new window.DocsAPI.DocEditor('onlyoffice-editor', editorData.config as unknown as Record<string, unknown>);
        } catch (err) {
          setError(`Editor initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
        document.head.removeChild(script);
      } catch {
        // Script may already be removed
      }
    };
  }, [editorData]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải editor...</span>
      </div>
    );
  }

  const isLeader = user?.role === 'LEADER';

  return (
    <>
      {/* Minimal top bar for editor */}
      <div className="editor-header">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="btn btn-ghost btn-sm">
            ← Quay về
          </a>
          {editorData && (
            <div>
              <span
                className="font-mono"
                style={{
                  color: 'var(--color-accent-primary-hover)',
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  marginRight: 'var(--space-2)',
                }}
              >
                {editorData.section.code}
              </span>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                {editorData.section.title}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className={`badge ${isLeader ? 'badge-primary' : 'badge-info'}`}>
                {isLeader ? 'Leader' : 'Member'}
              </span>
              {user.avatarUrl && (
                <Image 
                  src={user.avatarUrl} 
                  alt="" 
                  className="navbar-avatar" 
                  width={32} 
                  height={32}
                  unoptimized
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor container */}
      <div className="editor-container">
        {error ? (
          <div
            className="empty-state"
            style={{ flex: 1 }}
          >
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-title">Không thể tải Editor</div>
            <div className="empty-state-desc" style={{ maxWidth: 600 }}>
              {error}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => window.location.reload()} className="btn btn-primary">
                Thử lại
              </button>
              <a href="/dashboard" className="btn btn-secondary">
                Quay về Dashboard
              </a>
            </div>
          </div>
        ) : (
          <div
            id="onlyoffice-editor"
            className="editor-frame"
            style={{ flex: 1, width: '100%' }}
          />
        )}
      </div>
    </>
  );
}
