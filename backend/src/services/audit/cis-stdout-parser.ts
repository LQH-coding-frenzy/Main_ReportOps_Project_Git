/**
 * CIS Stdout Parser — Phase 8
 *
 * Parses raw CIS-style stdout output from audit scripts and normalizes
 * results into a structured JSON format for dashboard, archive, and reporting.
 *
 * Parser logic (from master plan):
 * - exitCode != 0 → ERROR
 * - stdout contains "** PASS **" or "*** PASS ***" → PASS
 * - stdout contains "** FAIL **" or "*** FAIL ***" → FAIL
 * - assessmentType == Manual → MANUAL
 * - stdout contains "REVIEW" or "Review the generated output" → MANUAL
 * - else → UNKNOWN
 */

// ── Types ──

export type CisStdoutParserInput = {
  controlId: string;
  title: string;
  section: string;
  ownerSection: 'M1';
  assessmentType: 'Automated' | 'Manual';
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
};

export type AuditStatus =
  | 'PASS'
  | 'FAIL'
  | 'MANUAL'
  | 'NOT_APPLICABLE'
  | 'ERROR'
  | 'UNKNOWN';

export type NormalizedAuditResult = {
  controlId: string;
  title: string;
  section: string;
  ownerSection: 'M1';
  status: AuditStatus;
  assessmentType: 'Automated' | 'Manual';
  info: string[];
  failReasons: string[];
  correctlySet: string[];
  evidence: string[];
  rawStdoutRef?: string;
  rawStderrRef?: string;
  rawStdout: string;
  rawStderr: string;
  exitCode: number;
  parser: 'cis_stdout';
  parserWarnings: string[];
  startedAt: string;
  finishedAt: string;
};

// ── Helpers ──

function extractSection(
  stdout: string,
  headerPattern: RegExp,
  endPatterns: RegExp[] = []
): string[] {
  const lines = stdout.split('\n');
  const results: string[] = [];
  let capturing = false;

  for (const line of lines) {
    if (headerPattern.test(line)) {
      capturing = true;
      continue;
    }

    if (capturing) {
      // Stop at next header or end pattern
      if (
        endPatterns.some((p) => p.test(line)) ||
        /^(--|==|\*\*|--- )/.test(line.trim())
      ) {
        capturing = false;
        continue;
      }

      const trimmed = line.trim();
      if (trimmed.length > 0) {
        results.push(trimmed);
      }
    }
  }

  return results;
}

// ── Main Parser ──

export function parseCisStdout(input: CisStdoutParserInput): NormalizedAuditResult {
  let { stdout } = input;
  const { stderr, exitCode, assessmentType, controlId } = input;
  const warnings: string[] = [];

  // 0. Segment Filtering: If stdout contains section headers (### 1.1.1.1), isolate the relevant part
  if (stdout.includes(`### ${controlId}`)) {
    const lines = stdout.split('\n');
    let segment = '';
    let capturing = false;
    
    for (const line of lines) {
      if (line.trim().startsWith(`### ${controlId}`)) {
        capturing = true;
        segment += line + '\n';
        continue;
      }
      if (capturing) {
        if (line.trim().startsWith('### ') && !line.trim().startsWith(`### ${controlId}`)) {
          break; // Next section started
        }
        segment += line + '\n';
      }
    }
    
    if (segment) {
      stdout = segment; // Only parse this segment
    }
  }

  // Determine status
  let status: AuditStatus;

  if (exitCode !== 0) {
    status = 'ERROR';
    if (stderr.trim().length === 0 && stdout.trim().length === 0) {
      warnings.push(`Script exited with code ${exitCode} but produced no output`);
    }
  } else if (/\*{2,3}\s*PASS\s*\*{2,3}/.test(stdout)) {
    status = 'PASS';
  } else if (/\*{2,3}\s*FAIL\s*\*{2,3}/.test(stdout)) {
    status = 'FAIL';
  } else if (/\*{2,3}\s*NOT_APPLICABLE\s*\*{2,3}/.test(stdout)) {
    status = 'NOT_APPLICABLE';
  } else if (assessmentType === 'Manual') {
    status = 'MANUAL';
  } else if (/REVIEW|Review the generated output/i.test(stdout)) {
    status = 'MANUAL';
    warnings.push('Automated control returned REVIEW status — marked as MANUAL');
  } else {
    status = 'UNKNOWN';
    warnings.push('Could not determine PASS/FAIL/NA status from stdout');
  }

  // Extract structured sections from stdout
  const info = extractSection(
    stdout,
    /--\s*INFO\s*--/i,
    [/--\s*(PASS|FAIL|END|RESULT)/i]
  );

  const failReasons = extractSection(
    stdout,
    /Reason\(s\)\s*for\s*audit\s*failure/i,
    [/Correctly\s*set/i, /--\s*(PASS|FAIL|END|INFO)/i]
  );

  const correctlySet = extractSection(
    stdout,
    /Correctly\s*set/i,
    [/Reason\(s\)/i, /--\s*(PASS|FAIL|END|INFO)/i]
  );

  // Build evidence array based on status
  let evidence: string[];
  switch (status) {
    case 'PASS':
      evidence = [...info, ...correctlySet];
      break;
    case 'FAIL':
      evidence = [...info, ...failReasons];
      break;
    case 'ERROR':
      evidence = stderr.trim().length > 0 ? [stderr.trim()] : info;
      break;
    default:
      evidence = [...info, ...failReasons, ...correctlySet];
  }

  // If no structured evidence found, use first N lines of stdout
  if (evidence.length === 0 && stdout.trim().length > 0) {
    evidence = stdout
      .trim()
      .split('\n')
      .slice(0, 20)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (evidence.length > 0) {
      warnings.push('No structured sections found; using raw stdout lines as evidence');
    }
  }

  return {
    controlId: input.controlId,
    title: input.title,
    section: input.section,
    ownerSection: input.ownerSection,
    status,
    assessmentType: input.assessmentType,
    info,
    failReasons,
    correctlySet,
    evidence,
    rawStdout: stdout,
    rawStderr: stderr,
    exitCode,
    parser: 'cis_stdout',
    parserWarnings: warnings,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };
}
