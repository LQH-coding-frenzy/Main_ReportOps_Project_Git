/**
 * Script Validator — Phase 7
 *
 * Validates uploaded .sh audit scripts before they are accepted into the system.
 * Ensures scripts meet security requirements for audit-only mode.
 */

import { getProjectAnswers } from '../../config/project-answers';
import { isManualM1Control } from './m1-manual-controls';

// ── Types ──

export interface ScriptValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

// ── M1 CIS sections scope ──

const M1_SECTIONS = getProjectAnswers().m1_scope?.sections || ['1.1', '1.2', '1.4', '1.5', '1.6', '2.3', '2.4'];

// ── Blocked destructive commands (MVP audit-only mode) ──

const BLOCKED_COMMANDS = [
  'rm -rf',
  'mkfs',
  'dd if=',
  'dd of=',
  'shutdown',
  'reboot',
  'poweroff',
  'dnf remove',
  'dnf update',
  'dnf install',
  'yum remove',
  'yum update',
  'yum install',
  'modprobe -r',
  'rmmod',
  'systemctl stop',
  'systemctl disable',
  'sed -i',
  'tee -a /etc',
  'chmod',
  'chown',
  'passwd',
  'userdel',
  'usermod',
];

const MAX_SCRIPT_SIZE = 200 * 1024; // 200KB

// ── Validator ──

export function validateAuditScript(
  filename: string,
  content: string | Buffer,
  controlId: string,
  options: { maxSize?: number } = {}
): ScriptValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxSize = options.maxSize ?? MAX_SCRIPT_SIZE;

  const textContent =
    typeof content === 'string' ? content : content.toString('utf-8');

  // 1. File extension must be .sh
  if (!filename.endsWith('.sh')) {
    errors.push(`File extension must be .sh, got: ${filename}`);
  }

  // 2. UTF-8 text check (if Buffer, check for invalid sequences)
  if (Buffer.isBuffer(content)) {
    try {
      const decoded = content.toString('utf-8');
      const reEncoded = Buffer.from(decoded, 'utf-8');
      if (!content.equals(reEncoded)) {
        errors.push('File is not valid UTF-8 text');
      }
    } catch {
      errors.push('File is not valid UTF-8 text');
    }
  }

  // 3. Size check
  const sizeBytes = Buffer.byteLength(textContent, 'utf-8');
  if (sizeBytes > maxSize) {
    errors.push(
      `Script size (${(sizeBytes / 1024).toFixed(1)}KB) exceeds maximum (${(maxSize / 1024).toFixed(0)}KB)`
    );
  }

  // 4. Bash shebang check
  const firstLine = textContent.split('\n')[0]?.trim() ?? '';
  if (!firstLine.startsWith('#!/')) {
    errors.push('Script must start with a shebang line (e.g., #!/usr/bin/env bash)');
  } else if (!/bash/.test(firstLine)) {
    warnings.push(
      `Shebang line does not reference bash: "${firstLine}". Scripts should use bash.`
    );
  }

  // 5. Control ID in M1 scope
  const sectionPrefix = controlId.split('.').slice(0, 2).join('.');
  // Check if section prefix starts with any M1 section
  const isInM1Scope = M1_SECTIONS.some(
    (s) => sectionPrefix === s || sectionPrefix.startsWith(s + '.')
  );
  if (!isInM1Scope) {
    errors.push(
      `Control ${controlId} (section ${sectionPrefix}) is not in M1 scope. ` +
        `M1 sections: ${M1_SECTIONS.join(', ')}`
    );
  }

  if (isManualM1Control(controlId)) {
    errors.push(`Control ${controlId} requires manual review and is disabled in this automated-only system`);
  }

  // 6. Path traversal check
  if (/\.\.\//g.test(textContent)) {
    errors.push('Script contains path traversal pattern (../)');
  }

  // 7. Destructive command check
  const lowerContent = textContent.toLowerCase();
  const foundBlocked: string[] = [];
  for (const cmd of BLOCKED_COMMANDS) {
    if (lowerContent.includes(cmd.toLowerCase())) {
      foundBlocked.push(cmd);
    }
  }
  if (foundBlocked.length > 0) {
    errors.push(
      `Script contains blocked destructive commands (audit-only mode): ${foundBlocked.join(', ')}`
    );
  }

  if (/(\*{2,3}\s*REVIEW\s*\*{2,3})|manual review required|print_manual\s*\(/i.test(textContent)) {
    errors.push('Manual review patterns are not allowed. This system accepts automated-only audits.');
  }

  // 8. CIS audit result pattern check (warn if missing)
  const hasCisPattern =
    /\*{2,3}\s*(PASS|FAIL)\s*\*{2,3}/.test(textContent) ||
    /echo.*\*\*(PASS|FAIL)\*\*/.test(textContent) ||
    /printf.*\*\*(PASS|FAIL)\*\*/.test(textContent) ||
    /NOT_APPLICABLE|ERROR/i.test(textContent);

  if (!hasCisPattern) {
    warnings.push(
      'Script does not contain recognizable CIS result patterns (** PASS **, ** FAIL **, ** NOT_APPLICABLE **). ' +
        'Parser may return UNKNOWN status.'
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
