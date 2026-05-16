'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from 'xterm';
import { createLabVmSshSession } from '../../lib/api';
import { Modal } from './Modal';

type TerminalStatus = 'connecting' | 'ready' | 'error' | 'closed';

interface SshTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmId: number | null;
  vmName: string;
}

const STATUS_BADGE: Record<TerminalStatus, { label: string; className: string }> = {
  connecting: { label: 'Connecting', className: 'badge badge-warning' },
  ready: { label: 'Live SSH', className: 'badge badge-success' },
  error: { label: 'Connection Error', className: 'badge badge-danger' },
  closed: { label: 'Session Closed', className: 'badge badge-secondary' },
};

export function SshTerminalModal({ isOpen, onClose, vmId, vmName }: SshTerminalModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const badge = useMemo(() => STATUS_BADGE[status], [status]);

  useEffect(() => {
    if (!isOpen || !vmId || !containerRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: 4000,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#020617',
        foreground: '#dbeafe',
        cursor: '#818cf8',
        selectionBackground: 'rgba(99, 102, 241, 0.28)',
        black: '#0f172a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#334155',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#c4b5fd',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminal.writeln(`Connecting to audituser@${vmName}...`);
    terminal.writeln('');
    terminalRef.current = terminal;
    let isDisposed = false;

    const sendResize = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      fitAddon.fit();
      socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    };

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(sendResize);
    });
    resizeObserver.observe(containerRef.current);

    const disposeOnData = terminal.onData((data) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: 'input', data }));
    });

    void (async () => {
      try {
        const { wsUrl } = await createLabVmSshSession(vmId);

        if (isDisposed) {
          return;
        }

        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string) as {
              type?: string;
              data?: string;
              message?: string;
            };

            if (message.type === 'output' && typeof message.data === 'string') {
              terminal.write(message.data);
              return;
            }

            if (message.type === 'ready') {
              setStatus('ready');
              setErrorMessage(null);
              window.requestAnimationFrame(sendResize);
              return;
            }

            if (message.type === 'status' && message.message) {
              terminal.writeln(message.message);
              return;
            }

            if (message.type === 'error') {
              const nextError = message.message || 'Không thể mở phiên SSH.';
              setStatus('error');
              setErrorMessage(nextError);
              terminal.writeln(`\r\n[${nextError}]`);
              return;
            }

            if (message.type === 'closed') {
              setStatus((current) => (current === 'error' ? current : 'closed'));
              terminal.writeln('\r\n[SSH session closed]');
            }
          } catch {
            terminal.writeln('\r\n[Received malformed SSH message]');
          }
        };

        ws.onclose = () => {
          setStatus((current) => (current === 'error' ? current : 'closed'));
        };

        ws.onerror = () => {
          setStatus('error');
          setErrorMessage('Không thể kết nối Web SSH sau khi đã tạo session. Kiểm tra proxy backend hoặc Nginx upgrade headers.');
        };
      } catch (error) {
        const nextError = error instanceof Error ? error.message : 'Không thể chuẩn bị Web SSH session.';
        setStatus('error');
        setErrorMessage(nextError);
        terminal.writeln(`\r\n[${nextError}]`);
      }
    })();

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      disposeOnData.dispose();
      socketRef.current?.close();
      terminal.dispose();
      socketRef.current = null;
      terminalRef.current = null;
    };
  }, [isOpen, vmId, vmName]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Web SSH • ${vmName}`}
      description="audituser session chạy trực tiếp trong popup của ReportOps"
      size="fullscreen"
      titleActions={<span className={badge.className}>{badge.label}</span>}
      contentStyle={{ display: 'flex', flexDirection: 'column', minHeight: '70vh' }}
    >
      {errorMessage ? (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Không thể mở Web SSH</div>
          <div style={{ fontSize: 'var(--text-sm)' }}>{errorMessage}</div>
        </div>
      ) : null}

      <div style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
        Hỗ trợ shell tương tác cơ bản. Nhấn ra vùng tối hoặc phím <code>Esc</code> để đóng phiên hiện tại.
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: '68vh',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          overflow: 'hidden',
          background: '#020617',
          boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.7)',
          padding: 'var(--space-2)',
        }}
      />
    </Modal>
  );
}
