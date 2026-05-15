'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'primary';
  confirmLoadingText?: string;
}

export function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Xác nhận', 
  cancelText = 'Huỷ',
  type = 'primary',
  confirmLoadingText = 'Đang xử lý...',
}: ConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
    }
  }, [isOpen]);

  async function handleConfirm() {
    try {
      setIsSubmitting(true);
      await onConfirm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-secondary-text text-sm mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn btn-ghost" disabled={isSubmitting}>
          {cancelText}
        </button>
        <button 
          onClick={handleConfirm}
          disabled={isSubmitting}
          className={`btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`}
        >
          {isSubmitting ? confirmLoadingText : confirmText}
        </button>
      </div>
    </Modal>
  );
}
