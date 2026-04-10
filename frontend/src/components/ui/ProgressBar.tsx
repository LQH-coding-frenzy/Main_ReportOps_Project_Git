'use client';

import React from 'react';

interface ProgressBarProps {
  progress: number; // 0 to 100
  label?: string;
  showPerc?: boolean;
}

export function ProgressBar({ progress, label, showPerc = true }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, progress));

  return (
    <div className="w-full">
      {(label || showPerc) && (
        <div className="flex justify-between items-center mb-1 text-xs text-secondary-text">
          <span>{label}</span>
          {showPerc && <span className="font-mono">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className="progress-container">
        <div 
          className="progress-bar" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
