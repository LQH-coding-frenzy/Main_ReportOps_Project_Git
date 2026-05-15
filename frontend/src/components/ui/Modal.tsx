'use client';

import React, { CSSProperties, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  description?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl' | 'fullscreen';
  titleActions?: React.ReactNode;
  dialogStyle?: CSSProperties;
  contentStyle?: CSSProperties;
  closeOnOverlayClick?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  description,
  size = 'md',
  titleActions,
  dialogStyle,
  contentStyle,
  closeOnOverlayClick = true,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={closeOnOverlayClick ? onClose : undefined}>
      <div className={`modal modal-${size}`} style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title font-bold">{title}</h2>
            {description ? <div className="modal-description">{description}</div> : null}
          </div>
          <div className="modal-header-actions">
            {titleActions}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng popup">
              ✕
            </button>
          </div>
        </div>
        <div className="modal-content" style={contentStyle}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
