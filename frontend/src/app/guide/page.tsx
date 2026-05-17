'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../../lib/api';
import type { User } from '../../lib/types';
import { FRONTEND_SECTION_DEFINITIONS, FRONTEND_SECTION_DEFINITION_MAP } from '../../lib/section-definitions';
import { hasRole } from '../../lib/system-roles';

function GuidePageContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'M1' | 'M2' | 'M3' | 'M4'>('M1');

  useEffect(() => {
    async function init() {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          window.location.href = '/';
          return;
        }

        setUser(currentUser);

        if (!hasRole(currentUser, 'LEADER')) {
          const firstAssignedCode = currentUser.sections?.[0]?.code as 'M1' | 'M2' | 'M3' | 'M4' | undefined;
          if (firstAssignedCode && FRONTEND_SECTION_DEFINITION_MAP[firstAssignedCode]) {
            setActiveSection(firstAssignedCode);
          }
        }
      } catch {
        window.location.href = '/';
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const assignedSectionCodes = useMemo(
    () => new Set((user?.sections || []).map((section) => section.code)),
    [user]
  );
  const isLeader = hasRole(user, 'LEADER');
  const activeDefinition = FRONTEND_SECTION_DEFINITION_MAP[activeSection];

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span>Đang tải writing guide...</span>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 80,
              height: 80,
              borderRadius: 24,
              background: 'var(--gradient-primary)',
              fontSize: '2rem',
              boxShadow: 'var(--shadow-glow)',
              marginBottom: 'var(--space-5)',
            }}
          >
            📘
          </div>
          <h1 className="page-title" style={{ fontSize: 'var(--text-5xl)', marginBottom: 'var(--space-3)' }}>
            ReportOps Writing Guide
          </h1>
          <p className="page-subtitle" style={{ maxWidth: 840, margin: '0 auto' }}>
            Guide này bám theo `plan_complete.md` mới của nhóm: 4 section M1-M4, 28 control automated, audit script tách riêng remediation,
            và format stdout/manifest để ReportOps parse ổn định.
          </p>
        </div>

        <div className="grid grid-2" style={{ gap: 'var(--space-5)', marginBottom: 'var(--space-8)' }}>
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Flow bài nhóm</h3>
            <p className="card-body" style={{ margin: 0 }}>
              Nền tảng server an toàn → Giảm bề mặt tấn công → Bảo vệ truy cập quản trị → Tài khoản, mật khẩu, logging và audit trail
            </p>
          </div>
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Trạng thái xem guide</h3>
            <p className="card-body" style={{ margin: 0 }}>
              {isLeader
                ? 'Bạn đang xem chế độ leader: thấy toàn bộ guide và có thể chuyển giữa cả 4 section.'
                : `Bạn đang được focus vào phần ${activeSection}, nhưng vẫn có thể chuyển tab để tham khảo các phần còn lại.`}
            </p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Quy định bắt buộc</h3>
          <div style={{ display: 'grid', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <div>Script chính là audit-only, không remediation trực tiếp trong file audit.</div>
            <div>Mỗi control phải có header `### CONTROL_ID - TITLE` và block `- Audit Result:`.</div>
            <div>Trạng thái hợp lệ: `PASS`, `FAIL`, `ERROR`, `NOT_APPLICABLE`.</div>
            <div>Nhóm nộp đúng 4 script tên cố định, 4 manifest, before/after logs, screenshots, và remediation scripts tách riêng.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
          {FRONTEND_SECTION_DEFINITIONS.map((definition) => {
            const assigned = assignedSectionCodes.has(definition.code);
            const active = activeSection === definition.code;

            return (
              <button
                key={definition.code}
                className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveSection(definition.code)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <span>{definition.code}</span>
                <span>{definition.shortTitle}</span>
                {(assigned || (isLeader && definition.code === 'M1')) && <span>•</span>}
                {assigned && <span>Bạn phụ trách</span>}
                {isLeader && definition.code === 'M1' && <span>Leader</span>}
              </button>
            );
          })}
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header" style={{ marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 className="card-title" style={{ fontSize: 'var(--text-2xl)' }}>
                {activeDefinition.code} • {activeDefinition.title}
              </h2>
              <p style={{ color: 'var(--color-text-tertiary)', marginTop: 6 }}>{activeDefinition.flowRole}</p>
            </div>
          </div>

          <div className="grid grid-2" style={{ gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
            <div>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Phạm vi</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>{activeDefinition.description}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeDefinition.cisChapters.map((chapter) => (
                  <span key={chapter} className="admin-chip">§{chapter}</span>
                ))}
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>File phải nộp</h3>
              <div style={{ display: 'grid', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                <div><code>{activeDefinition.scriptPath}</code></div>
                <div><code>{activeDefinition.manifestPath}</code></div>
                <div><code>{activeDefinition.remediationPath}</code></div>
                <div><code>{activeDefinition.beforeLogPath}</code></div>
                <div><code>{activeDefinition.afterLogPath}</code></div>
                <div><code>{activeDefinition.screenshotDir}</code></div>
              </div>
            </div>
          </div>

          <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Danh sách 7 control</h3>
          <div className="table-responsive" style={{ marginBottom: 'var(--space-6)' }}>
            <table className="admin-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Control ID</th>
                  <th>Tên tiêu chí</th>
                  <th>Mục đích kiểm tra</th>
                </tr>
              </thead>
              <tbody>
                {activeDefinition.controls.map((control) => (
                  <tr key={control.id}>
                    <td><code>{control.id}</code></td>
                    <td>{control.title}</td>
                    <td>{control.objective}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-2" style={{ gap: 'var(--space-5)' }}>
            <div>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Nội dung cần viết trong báo cáo</h3>
              <ul style={{ paddingLeft: '1.25rem', color: 'var(--color-text-secondary)', display: 'grid', gap: 8 }}>
                {activeDefinition.reportFocus.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Mẫu stdout parser đọc</h3>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{`### 5.1.20 - Ensure sshd PermitRootLogin is disabled\n\n- Audit Result:\n ** PASS **\n\n### 5.1.20 - Ensure sshd PermitRootLogin is disabled\n\n- Audit Result:\n ** FAIL **\n - Reason(s) for audit failure:\n - PermitRootLogin is set to yes`}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <Suspense fallback={<div className="loading-page"><div className="spinner" /><span>Đang tải...</span></div>}>
      <GuidePageContent />
    </Suspense>
  );
}
