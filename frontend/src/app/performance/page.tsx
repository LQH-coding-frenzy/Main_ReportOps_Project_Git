'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { getCurrentUser, getPerformance } from '../../lib/api';
import type { User, PerformanceData } from '../../lib/types';
import { ProgressBar } from '../../components/ui/ProgressBar';

export default function PerformancePage() {
  const [, setUser] = useState<User | null>(null);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPerformance = useCallback(async () => {
    try {
      const res = await getPerformance();
      setData(res);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch performance:', err);
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu hiệu suất');
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const u = await getCurrentUser();
        if (!u || u.role !== 'LEADER') {
          window.location.href = '/dashboard';
          return;
        }
        setUser(u);
        await fetchPerformance();
      } catch {
        window.location.href = '/dashboard';
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchPerformance]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tính toán hiệu suất...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container page">
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">Không thể tải dữ liệu hiệu suất</div>
          <div className="empty-state-desc">{error || 'Dữ liệu chưa sẵn sàng, vui lòng thử lại.'}</div>
          <div className="mt-6">
            <button className="btn btn-primary" onClick={fetchPerformance}>Thử lại</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="page-header">
        <h1 className="page-title">Performance Analytics</h1>
        <p className="page-subtitle">Theo dõi tiến độ đóng góp và hoạt động của các thành viên</p>
      </div>

      <div className="grid grid-2">
        {data.users.map((member) => (
          <div key={member.id} className="card">
            <div className="card-header">
              <div className="flex items-center gap-3">
                {member.avatarUrl && (
                  <Image 
                    src={member.avatarUrl} 
                    alt="" 
                    width={48} 
                    height={48} 
                    className="rounded-full border-2 border-border"
                    unoptimized
                  />
                )}
                <div>
                  <div className="font-bold text-lg">{member.displayName || member.githubUsername}</div>
                  <div className="text-xs text-tertiary-text uppercase tracking-wider">{member.role}</div>
                </div>
              </div>
            </div>
            
            <div className="card-body mt-4">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-secondary-text">Sections Assigned</span>
                    <span className="font-bold">{member.stats.assignedSections} / {data.totalSections}</span>
                  </div>
                  <ProgressBar 
                    progress={data.totalSections > 0 ? (member.stats.assignedSections / data.totalSections) * 100 : 0} 
                    showPerc={false}
                  />
                </div>

                <div className="grid grid-2 bg-glass p-3 rounded-lg gap-4">
                  <div>
                    <div className="text-xs text-tertiary-text">Total Edits</div>
                    <div className="text-xl font-bold">{member.stats.totalEdits}</div>
                  </div>
                  <div>
                    <div className="text-xs text-tertiary-text">Activity</div>
                    <div className="text-sm font-medium">
                      {member.stats.lastActive 
                        ? new Date(member.stats.lastActive).toLocaleDateString('vi-VN')
                        : 'N/A'}
                    </div>
                  </div>
                </div>
                
                {member.stats.lastActive && (
                  <div className="text-[10px] text-tertiary-text text-right">
                    Last active: {new Date(member.stats.lastActive).toLocaleTimeString('vi-VN')}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
