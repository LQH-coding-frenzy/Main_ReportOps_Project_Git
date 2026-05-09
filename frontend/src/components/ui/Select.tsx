'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, disabled, placeholder, className = '' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Bounding box logic to prevent right-edge overflow and add padding
      let left: number | string = rect.left;
      let right: number | string = 'auto';
      const dropdownWidth = Math.max(rect.width, 160); // Ensure min-width for dropdown

      // If it would overflow the right edge of the screen, align to right edge instead
      if (rect.left + dropdownWidth > window.innerWidth - 16) {
        left = 'auto';
        right = window.innerWidth - rect.right;
      }

      setDropdownStyle({
        position: 'absolute',
        top: rect.bottom + window.scrollY + 4,
        left,
        right,
        width: dropdownWidth,
        zIndex: 99999,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Check if click is outside both the trigger container and the dropdown portal
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(event.target as Node);
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(event.target as Node);
      
      if (isOutsideContainer && isOutsideDropdown) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dropdownContent = (
    <div 
      ref={dropdownRef}
      className="custom-select-dropdown"
      style={{ ...dropdownStyle, top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width }}
    >
      {options.length === 0 ? (
        <div className="custom-select-empty">Không có dữ liệu</div>
      ) : (
        options.map(opt => (
          <div 
            key={opt.value}
            className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
            onClick={() => {
              onChange(opt.value);
              setIsOpen(false);
            }}
          >
            {opt.label}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div 
      ref={containerRef} 
      className={`custom-select-container ${disabled ? 'disabled' : ''} ${className}`}
    >
      <div 
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="custom-select-value">
          {selectedOption ? selectedOption.label : placeholder || 'Chọn...'}
        </span>
        <svg 
          className="custom-select-arrow" 
          width="12" 
          height="12" 
          viewBox="0 0 12 12" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M6 8L1 3H11L6 8Z" fill="currentColor"/>
        </svg>
      </div>

      {mounted && isOpen && !disabled && createPortal(dropdownContent, document.body)}
    </div>
  );
}
