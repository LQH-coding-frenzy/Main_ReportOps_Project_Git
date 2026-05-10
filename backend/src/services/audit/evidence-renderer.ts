/**
 * Evidence HTML Renderer — Phase 11
 *
 * Generates Terminal Evidence HTML and Dashboard Evidence HTML
 * from normalized audit results.
 */

import type { NormalizedAuditResult } from './cis-stdout-parser';

// ── Secret redaction ──

const SECRET_PATTERNS = [
  /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
  /DATABASE_URL=\S+/g,
  /GITHUB_CLIENT_SECRET=\S+/g,
  /GOOGLE_APPLICATION_CREDENTIALS=\S+/g,
  /Authorization:\s*Bearer\s+\S+/gi,
  /private_key["']?\s*[:=]\s*["']?\S+/gi,
  /access_token["']?\s*[:=]\s*["']?\S+/gi,
  /refresh_token["']?\s*[:=]\s*["']?\S+/gi,
  /SUPABASE_SERVICE_ROLE_KEY=\S+/g,
  /ONLYOFFICE_JWT_SECRET=\S+/g,
];

function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Shared CSS ──

const SHARED_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
    background: #0a0e1a;
    color: #e2e8f0;
    padding: 2rem;
    line-height: 1.6;
  }
  .header {
    background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1));
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: 12px;
    padding: 1.5rem 2rem;
    margin-bottom: 2rem;
  }
  .header h1 {
    font-size: 1.5rem;
    background: linear-gradient(135deg, #60a5fa, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0.5rem;
  }
  .meta { font-size: 0.85rem; color: #94a3b8; }
  .meta span { margin-right: 1.5rem; }
  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge-pass { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .badge-fail { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .badge-manual { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
  .badge-error { background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.4); }
  .badge-unknown { background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }
  .control-card {
    background: rgba(15,23,42,0.6);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  .control-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .control-id {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-weight: 700;
    color: #60a5fa;
    margin-right: 0.75rem;
  }
  .control-title { font-weight: 500; }
  pre {
    background: #020617;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    padding: 1rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.8rem;
    overflow-x: auto;
    color: #cbd5e1;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 400px;
    overflow-y: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }
  th, td {
    text-align: left;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  th {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
  }
  .score-display {
    font-size: 3rem;
    font-weight: 800;
    text-align: center;
    padding: 1rem;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0;
  }
  .stat-card {
    background: rgba(15,23,42,0.6);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    padding: 1rem;
    text-align: center;
  }
  .stat-value { font-size: 1.75rem; font-weight: 700; }
  .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; margin-top: 0.25rem; }
`;

function statusBadge(status: string): string {
  const cls = status.toLowerCase().replace('not_applicable', 'unknown');
  return `<span class="badge badge-${cls}">${status}</span>`;
}

// ── Terminal Evidence HTML (Phase 11) ──

export interface TerminalEvidenceInput {
  benchmark: string;
  scope: string;
  vmName: string;
  publicIp: string;
  auditJobId: number;
  timestamp: string;
  results: NormalizedAuditResult[];
}

export function renderTerminalEvidenceHtml(input: TerminalEvidenceInput): string {
  const controlCards = input.results
    .map(
      (r) => `
    <div class="control-card">
      <div class="control-header">
        <div>
          <span class="control-id">${escapeHtml(r.controlId)}</span>
          <span class="control-title">${escapeHtml(r.title)}</span>
        </div>
        ${statusBadge(r.status)}
      </div>
      <pre>${escapeHtml(redactSecrets(r.rawStdout))}</pre>
      ${
        r.rawStderr.trim()
          ? `<div style="margin-top:0.5rem"><strong style="color:#f87171">STDERR:</strong></div><pre style="border-color:rgba(239,68,68,0.2)">${escapeHtml(redactSecrets(r.rawStderr))}</pre>`
          : ''
      }
    </div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terminal Evidence — Job #${input.auditJobId}</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="header">
    <h1>🔒 Terminal Evidence — CIS Audit</h1>
    <div class="meta">
      <span>📋 ${escapeHtml(input.benchmark)}</span>
      <span>📌 ${escapeHtml(input.scope)}</span>
      <span>🖥️ ${escapeHtml(input.vmName)}</span>
      <span>🌐 ${escapeHtml(input.publicIp)}</span>
      <span>🆔 Job #${input.auditJobId}</span>
      <span>🕐 ${escapeHtml(input.timestamp)}</span>
    </div>
  </div>
  ${controlCards}
</body>
</html>`;
}

// ── Dashboard Evidence HTML (Phase 11) ──

export interface DashboardEvidenceInput {
  benchmark: string;
  scope: string;
  score: number;
  passCount: number;
  failCount: number;
  manualCount: number;
  errorCount: number;
  unknownCount: number;
  riskLevel: string;
  auditJobId: number;
  timestamp: string;
  results: NormalizedAuditResult[];
}

export function renderDashboardEvidenceHtml(input: DashboardEvidenceInput): string {
  const scoreColor =
    input.score >= 80
      ? '#4ade80'
      : input.score >= 60
        ? '#fbbf24'
        : '#f87171';

  const failedRows = input.results
    .filter((r) => r.status === 'FAIL')
    .map(
      (r) => `
    <tr>
      <td><span class="control-id">${escapeHtml(r.controlId)}</span></td>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.section)}</td>
      <td>${r.failReasons.map((f) => escapeHtml(f)).join('<br>') || '—'}</td>
    </tr>`
    )
    .join('\n');

  const manualRows = input.results
    .filter((r) => r.status === 'MANUAL')
    .map(
      (r) => `
    <tr>
      <td><span class="control-id">${escapeHtml(r.controlId)}</span></td>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.section)}</td>
      <td>${escapeHtml(r.assessmentType)}</td>
    </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Evidence — Job #${input.auditJobId}</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="header">
    <h1>📊 M1 Audit Summary</h1>
    <div class="meta">
      <span>📋 ${escapeHtml(input.benchmark)}</span>
      <span>📌 ${escapeHtml(input.scope)}</span>
      <span>🆔 Job #${input.auditJobId}</span>
      <span>🕐 ${escapeHtml(input.timestamp)}</span>
    </div>
  </div>

  <div class="score-display" style="color: ${scoreColor}">
    ${input.score.toFixed(1)}%
  </div>
  <p style="text-align:center;color:#64748b;margin-bottom:1.5rem">
    Risk Level: <strong style="color:${scoreColor}">${escapeHtml(input.riskLevel)}</strong>
  </p>

  <div class="stats-grid">
    <div class="stat-card"><div class="stat-value" style="color:#4ade80">${input.passCount}</div><div class="stat-label">Pass</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#f87171">${input.failCount}</div><div class="stat-label">Fail</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#fbbf24">${input.manualCount}</div><div class="stat-label">Manual</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#fca5a5">${input.errorCount}</div><div class="stat-label">Error</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#94a3b8">${input.unknownCount}</div><div class="stat-label">Unknown</div></div>
  </div>

  ${
    failedRows
      ? `<h2 style="margin:2rem 0 1rem;font-size:1.1rem">❌ Failed Controls</h2>
  <table>
    <thead><tr><th>ID</th><th>Title</th><th>Section</th><th>Failure Reasons</th></tr></thead>
    <tbody>${failedRows}</tbody>
  </table>`
      : ''
  }

  ${
    manualRows
      ? `<h2 style="margin:2rem 0 1rem;font-size:1.1rem">📋 Manual Review Controls</h2>
  <table>
    <thead><tr><th>ID</th><th>Title</th><th>Section</th><th>Type</th></tr></thead>
    <tbody>${manualRows}</tbody>
  </table>`
      : ''
  }
</body>
</html>`;
}
