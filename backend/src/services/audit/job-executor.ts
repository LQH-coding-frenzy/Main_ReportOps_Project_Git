import { PrismaClient, AuditJob, LabVm, AuditScript } from '@prisma/client';
import { SSHRunner, type SSHCommandResult } from './ssh-runner';
import { parseCisStdout, NormalizedAuditResult } from './cis-stdout-parser';
import { renderTerminalEvidenceHtml, renderDashboardEvidenceHtml } from './evidence-renderer';
import { MANUAL_M1_CONTROL_IDS } from './m1-manual-controls';
import { env } from '../../config/env';
import { getProjectAnswers, resolveProjectRoot } from '../../config/project-answers';
import { supabase } from '../../config/supabase';
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getSectionDefinition } from './pack-registry';
import { buildTargetedControlScript, resolveLocalMasterScriptStoragePath } from './runtime-script-registry';

const prisma = new PrismaClient();
const documentsBucket = env.SUPABASE_STORAGE_BUCKET;
const archiveBucket = env.SUPABASE_ARCHIVE_BUCKET;
const projectAnswers = getProjectAnswers();
const benchmarkName = projectAnswers.benchmark?.name || 'CIS AlmaLinux OS 9 Benchmark';
const benchmarkVersion = projectAnswers.benchmark?.version || '2.0.0';
const benchmarkProfile = projectAnswers.benchmark?.profile || 'Level 1 - Server';
const benchmarkLabel = `${benchmarkName} v${benchmarkVersion}`;
const runnerUsername = 'audituser';
const remoteRuntimeRoot = `/home/${runnerUsername}/.reportops-runtime`;
const auditRunnerPublicKey = process.env.AUDIT_RUNNER_SSH_PUBLIC_KEY?.trim() || '';

type VmOpsOperationType = 'REMEDIATION' | 'NOT_APPLICABLE_FIX' | 'REVERSE_REMEDIATE';

type VmOpsOperationContext = {
  sourceJobId: number;
  operationType: VmOpsOperationType;
  selectedControlIds: string[];
};

const VM_OPS_OPERATION_TYPES: VmOpsOperationType[] = ['REMEDIATION', 'NOT_APPLICABLE_FIX', 'REVERSE_REMEDIATE'];

function isVmOpsOperationType(value: string): value is VmOpsOperationType {
  return VM_OPS_OPERATION_TYPES.includes(value as VmOpsOperationType);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveOpenScapProfileId(profileLabel: string): string {
  const normalized = profileLabel.trim().toLowerCase();

  if (normalized.includes('level 1') || normalized.includes('l1')) {
    return 'xccdf_org.ssgproject.content_profile_cis_server_l1';
  }

  if (normalized.includes('level 2') || normalized.includes('l2')) {
    return 'xccdf_org.ssgproject.content_profile_cis';
  }

  return 'xccdf_org.ssgproject.content_profile_cis_server_l1';
}

const REMEDIATION_SCRIPT_MAP: Record<string, string> = {
  M1: 'remediation/m1_remediate.sh',
  M2: 'remediation/m2_remediate.sh',
  M3: 'remediation/m3_remediate.sh',
  M4: 'remediation/m4_remediate.sh',
};

function resolveOperationScriptPath(ownerSection: string, operationType: VmOpsOperationType): string | null {
  switch (operationType) {
    case 'REMEDIATION':
      return REMEDIATION_SCRIPT_MAP[ownerSection] || null;
    case 'NOT_APPLICABLE_FIX':
      return ownerSection === 'M1' ? 'remediation/m1_not_applicable_fix.sh' : null;
    case 'REVERSE_REMEDIATE':
      return ownerSection === 'M1' ? 'remediation/m1_reverse_remediate.sh' : null;
    default:
      return null;
  }
}

function extractVmOpsOperationContext(summaryJson: unknown): VmOpsOperationContext | null {
  if (!summaryJson || typeof summaryJson !== 'object' || Array.isArray(summaryJson)) {
    return null;
  }

  const summary = summaryJson as Record<string, unknown>;
  const rawContext = summary.operationContext;
  if (!rawContext || typeof rawContext !== 'object' || Array.isArray(rawContext)) {
    return null;
  }

  const context = rawContext as Record<string, unknown>;
  const sourceJobId = typeof context.sourceJobId === 'number' ? context.sourceJobId : Number(context.sourceJobId);
  const operationType = typeof context.operationType === 'string' ? context.operationType : '';
  const selectedControlIds = Array.isArray(context.selectedControlIds)
    ? context.selectedControlIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];

  if (!Number.isInteger(sourceJobId) || !isVmOpsOperationType(operationType) || selectedControlIds.length === 0) {
    return null;
  }

  return {
    sourceJobId,
    operationType,
    selectedControlIds,
  };
}

function buildRunnerGuardScript(): string {
  const keyRestore = auditRunnerPublicKey
    ? [
        "cat <<'EOF' > /home/audituser/.ssh/authorized_keys",
        auditRunnerPublicKey,
        'EOF',
      ].join('\n')
    : 'touch /home/audituser/.ssh/authorized_keys';

  return [
    '#!/usr/bin/env bash',
    'set -u',
    '',
    'if ! id audituser >/dev/null 2>&1; then',
    '  useradd -m -s /bin/bash audituser',
    'fi',
    '',
    'mkdir -p /home/audituser/.ssh',
    keyRestore,
    'chown -R audituser:audituser /home/audituser/.ssh',
    'chmod 700 /home/audituser/.ssh',
    'chmod 600 /home/audituser/.ssh/authorized_keys',
    'if command -v restorecon >/dev/null 2>&1; then',
    '  restorecon -Rv /home/audituser/.ssh >/dev/null 2>&1 || true',
    'fi',
    '',
    "cat <<'EOF' > /etc/sudoers.d/audituser",
    'audituser ALL=(ALL) NOPASSWD:ALL',
    'EOF',
    'chmod 0440 /etc/sudoers.d/audituser',
    '',
    "mkdir -p /home/audituser/.reportops-runtime",
    'chown -R audituser:audituser /home/audituser/.reportops-runtime',
  ].join('\n');
}

type OpenScapResultRow = {
  idref: string;
  result: string;
};

function parseOpenScapResultRows(xml: string): OpenScapResultRow[] {
  const rows: OpenScapResultRow[] = [];
  const ruleResultRegex = /<rule-result[^>]*idref="([^"]+)"[^>]*>[\s\S]*?<result>([^<]+)<\/result>/g;
  let match: RegExpExecArray | null;

  while ((match = ruleResultRegex.exec(xml)) !== null) {
    rows.push({ idref: match[1], result: match[2].trim() });
  }

  return rows;
}

function buildOpenScapFilteredJson(input: {
  benchmark: string;
  profile: string;
  ownerSection: string;
  counts: { pass: number; fail: number; error: number };
  rows: OpenScapResultRow[];
}): string {
  const definition = getSectionDefinition(input.ownerSection);
  const actionableRows = input.rows.filter((row) => {
    const normalized = row.result.toLowerCase();
    return !['notselected', 'notchecked'].includes(normalized);
  });

  return JSON.stringify(
    {
      benchmark: input.benchmark,
      profile: input.profile,
      ownerSection: input.ownerSection,
      scope: input.ownerSection,
      sections: definition?.cisChapters || [],
      counts: input.counts,
      ruleResults: actionableRows,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

function readLocalProjectFile(relativePath: string): Buffer {
  const absolutePath = path.resolve(resolveProjectRoot(), relativePath);
  return fs.readFileSync(absolutePath);
}

async function loadAuditScriptContent(script: AuditScript, ownerSection: string): Promise<Buffer> {
  const localMasterPath = resolveLocalMasterScriptStoragePath(script.scriptStoragePath);
  if (localMasterPath) {
    const masterContent = readLocalProjectFile(localMasterPath).toString('utf-8');
    return Buffer.from(buildTargetedControlScript(masterContent, script.controlId), 'utf-8');
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(documentsBucket)
    .download(script.scriptStoragePath);

  if (!downloadError && fileData) {
    return Buffer.from(await fileData.arrayBuffer());
  }

  const fallbackScriptPath = getSectionDefinition(ownerSection)?.scriptPath;
  if (!fallbackScriptPath) {
    throw new Error(`Failed to download script ${script.controlId}: ${downloadError?.message || 'unknown error'}`);
  }

  const masterContent = readLocalProjectFile(fallbackScriptPath).toString('utf-8');
  return Buffer.from(buildTargetedControlScript(masterContent, script.controlId), 'utf-8');
}

async function uploadToBucketOrThrow(bucket: string, storagePath: string, body: string | Buffer, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload ${storagePath}: ${error.message}`);
  }
}

class AuditJobCancelledError extends Error {}

export class AuditJobExecutor {
  private static activeExecutors = new Map<number, AuditJobExecutor>();
  private jobId: number;
  private runner?: SSHRunner;
  private job: (AuditJob & { vm: LabVm }) | null = null;
  private logs: string[] = [];
  private cancellationRequested = false;

  static requestCancel(jobId: number): void {
    const executor = AuditJobExecutor.activeExecutors.get(jobId);
    if (!executor) {
      return;
    }

    executor.cancellationRequested = true;
    if (executor.runner) {
      executor.runner.disconnect().catch(() => {
        // Best-effort interruption only.
      });
    }
  }

  constructor(jobId: number) {
    this.jobId = jobId;
  }

  private async addLog(message: string) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    this.logs.push(entry);
    console.log(`[Job ${this.jobId}] ${message}`);

    // Update database incrementally
    try {
      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: {
          executionLog: this.logs.join('\n')
        }
      });
    } catch (err) {
      console.error(`Failed to update incremental log for job ${this.jobId}:`, err);
    }
  }

  private async isJobMarkedCancelled(): Promise<boolean> {
    const current = await prisma.auditJob.findUnique({
      where: { id: this.jobId },
      select: { status: true },
    });

    return current?.status === 'CANCELLED';
  }

  private async ensureNotCancelled(): Promise<void> {
    if (this.cancellationRequested || await this.isJobMarkedCancelled()) {
      this.cancellationRequested = true;
      throw new AuditJobCancelledError('Audit job cancelled by user');
    }
  }

  private async ensureRunnerAccess(): Promise<void> {
    if (!this.runner) {
      throw new Error('SSH runner is not initialized');
    }

    const guardPath = `${remoteRuntimeRoot}/runner-guard-preflight.sh`;
    await this.runner.execCommand(`mkdir -p ${shellQuote(remoteRuntimeRoot)}`, { cwd: `/home/${runnerUsername}` });
    await this.runner.uploadFile(buildRunnerGuardScript(), guardPath);

    const guardResult = await this.runner.execCommand(`sudo bash ${shellQuote(guardPath)}`, { cwd: remoteRuntimeRoot });
    if (guardResult.exitCode !== 0) {
      throw new Error(`Runner guard failed: ${guardResult.stderr || guardResult.stdout || 'unknown error'}`);
    }

    const sudoCheck = await this.runner.execCommand('sudo -n true', { cwd: remoteRuntimeRoot });
    if (sudoCheck.exitCode !== 0) {
      throw new Error(`audituser lost passwordless sudo access: ${sudoCheck.stderr || sudoCheck.stdout || 'sudo -n true failed'}`);
    }
  }

  private async runManagedRootScript(input: {
    remoteDir: string;
    remoteBaseName: string;
    scriptContent: Buffer | string;
    envVars?: Record<string, string>;
  }): Promise<SSHCommandResult> {
    if (!this.runner) {
      throw new Error('SSH runner is not initialized for managed execution');
    }

    await this.ensureRunnerAccess();

    const remoteScriptPath = `${input.remoteDir}/${input.remoteBaseName}.sh`;
    const remoteGuardPath = `${input.remoteDir}/runner-guard.sh`;
    const remoteWrapperPath = `${input.remoteDir}/${input.remoteBaseName}.wrapper.sh`;
    const exports = Object.entries(input.envVars || {})
      .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
      .join('\n');

    const wrapperScript = [
      '#!/usr/bin/env bash',
      'set +e',
      exports,
      `bash ${shellQuote(remoteScriptPath)}`,
      'rc=$?',
      `bash ${shellQuote(remoteGuardPath)}`,
      'exit "$rc"',
    ].filter(Boolean).join('\n');

    await this.runner.execCommand(`mkdir -p ${shellQuote(input.remoteDir)}`, { cwd: remoteRuntimeRoot });
    await this.runner.uploadFile(input.scriptContent, remoteScriptPath);
    await this.runner.uploadFile(buildRunnerGuardScript(), remoteGuardPath);
    await this.runner.uploadFile(wrapperScript, remoteWrapperPath);

    return this.runner.execCommand(`sudo bash ${shellQuote(remoteWrapperPath)}`, { cwd: remoteRuntimeRoot });
  }

  private async runVmOpsOperationJob(job: AuditJob & { vm: LabVm }, remoteDir: string): Promise<{
    results: NormalizedAuditResult[];
    passCount: number;
    failCount: number;
    errorCount: number;
    unknownCount: number;
  }> {
    if (!this.runner) {
      throw new Error('SSH runner is not initialized for VM Ops operations');
    }

    const operationContext = extractVmOpsOperationContext(job.summaryJson);
    if (!operationContext) {
      throw new Error('VM Ops job is missing a valid operation context');
    }

    const definition = getSectionDefinition(job.ownerSection);
    if (!definition) {
      throw new Error(`Unknown VM Ops section: ${job.ownerSection}`);
    }

    const localScriptPath = resolveOperationScriptPath(job.ownerSection, operationContext.operationType);
    if (!localScriptPath) {
      throw new Error(`Operation ${operationContext.operationType} is not available for ${job.ownerSection}`);
    }

    const sourceJob = await prisma.auditJob.findUnique({
      where: { id: operationContext.sourceJobId },
      include: {
        scriptRuns: {
          where: {
            controlId: { in: operationContext.selectedControlIds },
          },
          include: {
            script: {
              select: {
                id: true,
                controlId: true,
                title: true,
                section: true,
                assessmentType: true,
                risk: true,
              },
            },
          },
          orderBy: { controlId: 'asc' },
        },
      },
    });

    if (!sourceJob) {
      throw new Error(`Source audit job #${operationContext.sourceJobId} was not found`);
    }

    const operationBuffer = readLocalProjectFile(localScriptPath);
    const remoteBaseName = `${job.ownerSection.toLowerCase()}-${operationContext.operationType.toLowerCase()}`;

    await this.addLog(
      `Running ${operationContext.operationType} for ${job.ownerSection} on controls: ${operationContext.selectedControlIds.join(', ')}`
    );

    const startedAt = new Date().toISOString();
    const cmdResult = await this.runManagedRootScript({
      remoteDir,
      remoteBaseName,
      scriptContent: operationBuffer,
      envVars: {
        REPORTOPS_OPERATION: operationContext.operationType,
        TARGET_CONTROL_IDS: operationContext.selectedControlIds.join(','),
      },
    });
    const finishedAt = new Date().toISOString();

    await this.addLog(`${operationContext.operationType} ${job.ownerSection} finished with exit code ${cmdResult.exitCode}`);
    if (cmdResult.stderr) {
      await this.addLog(`Operation stderr: ${cmdResult.stderr}`);
    }

    const sourceRunMap = new Map(sourceJob.scriptRuns.map((run) => [run.controlId, run]));
    const results: NormalizedAuditResult[] = [];
    let passCount = 0;
    let failCount = 0;
    let errorCount = 0;
    let unknownCount = 0;

    for (const controlId of operationContext.selectedControlIds) {
      const referenceRun = sourceRunMap.get(controlId);
      const controlDefinition = definition.controls.find((control) => control.id === controlId);
      const parsed = parseCisStdout({
        controlId,
        title: referenceRun?.script.title || controlDefinition?.title || controlId,
        section: referenceRun?.script.section || controlDefinition?.section || job.ownerSection,
        ownerSection: job.ownerSection,
        assessmentType: 'Automated',
        stdout: cmdResult.stdout,
        stderr: cmdResult.stderr,
        exitCode: cmdResult.exitCode,
        startedAt,
        finishedAt,
      });

      results.push(parsed);

      switch (parsed.status) {
        case 'PASS':
          passCount++;
          break;
        case 'FAIL':
          failCount++;
          break;
        case 'ERROR':
          errorCount++;
          break;
        default:
          unknownCount++;
          break;
      }

      if (referenceRun?.scriptId) {
        await prisma.auditScriptRun.create({
          data: {
            auditJobId: this.jobId,
            scriptId: referenceRun.scriptId,
            controlId,
            status: parsed.status,
            exitCode: parsed.exitCode,
            normalizedResultJson: JSON.parse(JSON.stringify(parsed)),
            startedAt: new Date(startedAt),
            finishedAt: new Date(finishedAt),
            durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
          },
        });
      }
    }

    const bucket = archiveBucket;
    const evidencePrefix = `archives/audits/${this.jobId}/vm-ops/${operationContext.operationType.toLowerCase()}`;

    if (cmdResult.stdout) {
      const stdoutPath = `${evidencePrefix}/stdout.txt`;
      await uploadToBucketOrThrow(bucket, stdoutPath, cmdResult.stdout, 'text/plain');
      await prisma.auditEvidence.create({
        data: {
          auditJobId: this.jobId,
          artifactType: 'VM_OPS_STDOUT',
          artifactName: `${operationContext.operationType} stdout`,
          storagePath: stdoutPath,
          mimeType: 'text/plain',
          sizeBytes: Buffer.byteLength(cmdResult.stdout, 'utf-8'),
        },
      });
    }

    if (cmdResult.stderr) {
      const stderrPath = `${evidencePrefix}/stderr.txt`;
      await uploadToBucketOrThrow(bucket, stderrPath, cmdResult.stderr, 'text/plain');
      await prisma.auditEvidence.create({
        data: {
          auditJobId: this.jobId,
          artifactType: 'VM_OPS_STDERR',
          artifactName: `${operationContext.operationType} stderr`,
          storagePath: stderrPath,
          mimeType: 'text/plain',
          sizeBytes: Buffer.byteLength(cmdResult.stderr, 'utf-8'),
        },
      });
    }

    return {
      results,
      passCount,
      failCount,
      errorCount,
      unknownCount,
    };
  }

  async execute(): Promise<void> {
    AuditJobExecutor.activeExecutors.set(this.jobId, this);

    try {
      // 1. Fetch Job and VM details
      this.job = await prisma.auditJob.findUnique({
        where: { id: this.jobId },
        include: { vm: true }
      });

      if (!this.job) throw new Error(`Audit Job ${this.jobId} not found`);
      const job = this.job; // Local narrowing

      if (job.status === 'CANCELLED') throw new AuditJobCancelledError('Audit job cancelled before execution started');
      if (job.status !== 'PENDING') throw new Error(`Job is already in status ${job.status}`);
      if (!job.vm.publicIp) throw new Error('VM does not have a public IP address');

      // Update status to RUNNING
      const startedAt = new Date();
      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: { status: 'RUNNING', startedAt }
      });

      await this.ensureNotCancelled();

      const isVmOpsOperation = isVmOpsOperationType(job.jobType);
      const isAuditJob = job.jobType === 'AUDIT';
      if (!isAuditJob && !isVmOpsOperation) {
        throw new Error(`Unsupported job type: ${job.jobType}`);
      }

      const isOpenscap = isAuditJob && (job.mode === 'OPENSCAP_ONLY' || job.mode === 'OPENSCAP_AND_SCRIPTS');
      const isScripts = isAuditJob && (job.mode === 'SCRIPTS_ONLY' || job.mode === 'OPENSCAP_AND_SCRIPTS');

      // 2. Fetch active scripts if needed
      let scripts: AuditScript[] = [];
      if (isScripts) {
        scripts = await prisma.auditScript.findMany({
          where: {
            enabled: true,
            assessmentType: { not: 'Manual' },
            controlId: { notIn: [...MANUAL_M1_CONTROL_IDS] },
            pack: { ownerSection: job.ownerSection, enabled: true }
          },
          orderBy: { controlId: 'asc' }
        });

        if (scripts.length === 0) {
          console.warn(`No enabled scripts found for section ${job.ownerSection}`);
        }
      }

      // 3. Connect via SSH
      const rawPrivateKey = process.env.AUDIT_RUNNER_SSH_KEY || '';
      
      if (!rawPrivateKey) {
        throw new Error('AUDIT_RUNNER_SSH_KEY is not configured');
      }
      
      let privateKeyBuffer: Buffer | string = rawPrivateKey;

      // Robust Base64 detection and cleaning
      if (!rawPrivateKey.includes('-----BEGIN')) {
        try {
          await this.addLog('Analyzing Base64 SSH key...');
          // Remove ALL whitespace, quotes, and non-base64 characters
          const cleaned = rawPrivateKey.replace(/[^A-Za-z0-9+/=]/g, '');
          
          const decodedBuffer = Buffer.from(cleaned, 'base64');
          const decodedString = decodedBuffer.toString('utf-8').trim();
          
          if (decodedString.includes('-----BEGIN')) {
            privateKeyBuffer = decodedString;
            await this.addLog(`Successfully decoded Base64 key (Header: ${decodedString.substring(0, 30)}...)`);
          } else {
            await this.addLog('Warning: Decoded string does not look like a PEM key. Using raw value.');
            privateKeyBuffer = rawPrivateKey;
          }
        } catch (err) {
          await this.addLog(`Error decoding Base64 key: ${err}. Using as-is.`);
          privateKeyBuffer = rawPrivateKey;
        }
      } else {
        // If it's already a PEM string, ensure literal \n are handled
        await this.addLog('Using PEM format key directly.');
        privateKeyBuffer = rawPrivateKey.replace(/\\n/g, '\n').trim();
      }
      
      await this.addLog(`Connecting to VM at ${job.vm.publicIp} as ${runnerUsername}...`);
      this.runner = new SSHRunner({
        host: job.vm.publicIp,
        username: runnerUsername,
        privateKey: privateKeyBuffer,
      });

      let connected = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!connected && attempts < maxAttempts) {
        await this.ensureNotCancelled();
        try {
          attempts++;
          if (attempts > 1) {
            await this.addLog(`Retry connection attempt ${attempts}/${maxAttempts}...`);
          }
          await this.runner.connect();
          connected = true;
          await this.addLog('SSH connection established.');
        } catch (connError) {
          const msg = connError instanceof Error ? connError.message : String(connError);
          if (attempts < maxAttempts && (msg.includes('Timed out') || msg.includes('ECONNREFUSED'))) {
            await this.addLog(`Connection attempt ${attempts} failed: ${msg}. Waiting 10s...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          } else {
            await this.addLog(`SSH Connection Failed: ${msg}`);
            if (msg.includes('Authentication failed')) {
              await this.addLog('TIP: This usually means the VM is still initializing or the SSH key is incorrect.');
            }
            throw connError;
          }
        }
      }

      // Create remote directory
      const remoteDir = `${remoteRuntimeRoot}/job-${this.jobId}`;
      await this.runner.execCommand(`mkdir -p ${shellQuote(remoteDir)}`, { cwd: `/home/${runnerUsername}` });
      await this.ensureRunnerAccess();

      const results: NormalizedAuditResult[] = [];
      let passCount = 0;
      let failCount = 0;
      let errorCount = 0;
      let unknownCount = 0;

      if (isVmOpsOperation) {
        const operationResult = await this.runVmOpsOperationJob(job, remoteDir);
        results.push(...operationResult.results);
        passCount = operationResult.passCount;
        failCount = operationResult.failCount;
        errorCount = operationResult.errorCount;
        unknownCount = operationResult.unknownCount;
      }

      // 4. Execute Scripts
      if (isScripts && scripts.length > 0) {
        for (const script of scripts) {
          await this.ensureNotCancelled();
          await this.addLog(`Running script: ${script.controlId} (${script.title})`);
          
          const scriptStartTime = Date.now();

          let scriptContent: Buffer;
          try {
            scriptContent = await loadAuditScriptContent(script, job.ownerSection);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.addLog(`ERROR: Failed to load script ${script.controlId}: ${message}`);
            continue;
          }

          // Run the script with a guard that restores audit runner access before returning.
          const cmdResult = await this.runManagedRootScript({
            remoteDir,
            remoteBaseName: script.controlId,
            scriptContent,
          });
          await this.ensureNotCancelled();
          await this.addLog(`Script ${script.controlId} finished with exit code ${cmdResult.exitCode}`);
          if (cmdResult.stderr) await this.addLog(`Stderr: ${cmdResult.stderr}`);
          
          const scriptEndTime = Date.now();

          // Parse Output
          const parsed = parseCisStdout({
            controlId: script.controlId,
            title: script.title,
            section: script.section,
            ownerSection: job.ownerSection,
            assessmentType: 'Automated',
            stdout: cmdResult.stdout,
            stderr: cmdResult.stderr,
            exitCode: cmdResult.exitCode,
            startedAt: new Date(scriptStartTime).toISOString(),
            finishedAt: new Date(scriptEndTime).toISOString(),
          });

          results.push(parsed);

          // Update counts
          switch(parsed.status) {
            case 'PASS': passCount++; break;
            case 'FAIL': failCount++; break;
            case 'ERROR': errorCount++; break;
            default: unknownCount++; break;
          }

          // Save Script Run DB Record
          await prisma.auditScriptRun.create({
            data: {
              auditJobId: this.jobId,
              scriptId: script.id,
              controlId: script.controlId,
              status: parsed.status,
              exitCode: cmdResult.exitCode,
              normalizedResultJson: JSON.parse(JSON.stringify(parsed)),
              startedAt: new Date(scriptStartTime),
              finishedAt: new Date(scriptEndTime),
              durationMs: scriptEndTime - scriptStartTime,
            }
          });
        }
      }

      // 4.5 Execute OpenSCAP Baseline if requested
      if (isOpenscap) {
        await this.ensureNotCancelled();
        console.log(`Executing OpenSCAP baseline scan for job ${this.jobId} (${job.ownerSection})...`);
        const profile = resolveOpenScapProfileId(benchmarkProfile);
        const dsPath = '/usr/share/xml/scap/ssg/content/ssg-almalinux9-ds.xml';
        const openScapPrefix = `archives/audits/${this.jobId}/${job.ownerSection.toLowerCase()}/openscap`;
        const oscapResultsXmlPath = `${remoteDir}/oscap-results.xml`;
        const oscapArfXmlPath = `${remoteDir}/oscap-results-arf.xml`;
        const oscapReportHtmlPath = `${remoteDir}/oscap-report.html`;
        
        // Ensure oscap is installed (should be done by Terraform, but just in case)
        await this.runner.execCommand(`sudo dnf install -y openscap-scanner scap-security-guide`);
        await this.addLog(`OpenSCAP profile resolved to ${profile} from benchmark profile "${benchmarkProfile}"`);
        
        const oscapCmd = `sudo oscap xccdf eval --profile ${profile} --results ${oscapResultsXmlPath} --results-arf ${oscapArfXmlPath} --report ${oscapReportHtmlPath} ${dsPath}`;
        
        // oscap exit code is 2 if there are failures, 0 if 100% pass, 1 on error
        await this.runner.execCommand(oscapCmd);
        await this.ensureNotCancelled();
        
        // Count pass/fail directly from XML
        const passOutput = await this.runner.execCommand(`grep -c '<result>pass</result>' ${oscapResultsXmlPath} || echo 0`);
        const failOutput = await this.runner.execCommand(`grep -c '<result>fail</result>' ${oscapResultsXmlPath} || echo 0`);
        const errorOutput = await this.runner.execCommand(`grep -c '<result>error</result>' ${oscapResultsXmlPath} || echo 0`);
        
        const oPass = parseInt(passOutput.stdout.trim()) || 0;
        const oFail = parseInt(failOutput.stdout.trim()) || 0;
        const oError = parseInt(errorOutput.stdout.trim()) || 0;
        
        passCount += oPass;
        failCount += oFail;
        errorCount += oError;

        // Add a mock result row for OpenSCAP so it appears in the dashboard
        results.push({
          controlId: 'OpenSCAP',
          title: `${benchmarkLabel} (Pass: ${oPass}, Fail: ${oFail})`,
          section: 'OS',
          status: oFail > 0 ? 'FAIL' : 'PASS',
          assessmentType: 'Automated',
          ownerSection: job.ownerSection,
          evidence: [`OpenSCAP scan completed.`, `Passed: ${oPass}`, `Failed: ${oFail}`, `Errors: ${oError}`],
          info: [],
          failReasons: [],
          correctlySet: [],
          rawStdout: oscapCmd,
          rawStderr: '',
          parser: 'cis_stdout',
          parserWarnings: [],
          exitCode: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        } as NormalizedAuditResult);
        
        // Download raw OpenSCAP artifacts and upload to Supabase
        const oscapHtml = await this.runner.execCommand(`cat ${oscapReportHtmlPath}`);
        const oscapXml = await this.runner.execCommand(`cat ${oscapResultsXmlPath}`);
        const oscapArf = await this.runner.execCommand(`cat ${oscapArfXmlPath}`);
        const bucket = archiveBucket;

        const oscapReportPath = `${openScapPrefix}/report.html`;
        const oscapXmlPath = `${openScapPrefix}/results.xml`;
        const oscapArfPath = `${openScapPrefix}/results-arf.xml`;

        if (oscapHtml.stdout) {
          await uploadToBucketOrThrow(bucket, oscapReportPath, Buffer.from(oscapHtml.stdout, 'utf-8'), 'text/html');
          await prisma.auditEvidence.create({
            data: {
              auditJobId: this.jobId,
              artifactType: 'OPENSCAP_REPORT',
              artifactName: 'OpenSCAP HTML Report',
              storagePath: oscapReportPath,
              mimeType: 'text/html',
              sizeBytes: Buffer.byteLength(oscapHtml.stdout, 'utf-8'),
            }
          });
        }

        if (oscapXml.stdout) {
          await uploadToBucketOrThrow(bucket, oscapXmlPath, Buffer.from(oscapXml.stdout, 'utf-8'), 'application/xml');
          await prisma.auditEvidence.create({
            data: {
              auditJobId: this.jobId,
              artifactType: 'OPENSCAP_RESULTS_XML',
              artifactName: 'OpenSCAP XCCDF Results',
              storagePath: oscapXmlPath,
              mimeType: 'application/xml',
              sizeBytes: Buffer.byteLength(oscapXml.stdout, 'utf-8'),
            }
          });
        }

        if (oscapArf.stdout) {
          await uploadToBucketOrThrow(bucket, oscapArfPath, Buffer.from(oscapArf.stdout, 'utf-8'), 'application/xml');
          await prisma.auditEvidence.create({
            data: {
              auditJobId: this.jobId,
              artifactType: 'OPENSCAP_ARF',
              artifactName: 'OpenSCAP ARF Results',
              storagePath: oscapArfPath,
              mimeType: 'application/xml',
              sizeBytes: Buffer.byteLength(oscapArf.stdout, 'utf-8'),
            }
          });
        }

        // Store a compact normalized JSON summary for archive UI usage
        const oscapSummaryPath = `${openScapPrefix}/openscap-filtered.json`;
        const oscapSummaryJson = buildOpenScapFilteredJson({
          benchmark: benchmarkLabel,
          profile: benchmarkProfile,
          ownerSection: job.ownerSection,
          counts: { pass: oPass, fail: oFail, error: oError },
          rows: parseOpenScapResultRows(oscapXml.stdout),
        });
        await uploadToBucketOrThrow(bucket, oscapSummaryPath, Buffer.from(oscapSummaryJson, 'utf-8'), 'application/json');
        await prisma.auditEvidence.create({
          data: {
            auditJobId: this.jobId,
              artifactType: 'OPENSCAP_FILTERED_JSON',
              artifactName: `OpenSCAP ${job.ownerSection} Filtered JSON`,
            storagePath: oscapSummaryPath,
            mimeType: 'application/json',
            sizeBytes: Buffer.byteLength(oscapSummaryJson, 'utf-8'),
          }
        });
      }

      // Cleanup VM temp dir
      await this.runner.execCommand(`sudo rm -rf ${shellQuote(remoteDir)}`, { cwd: remoteRuntimeRoot });
      await this.ensureNotCancelled();

      // 5. Generate Evidence Artifacts
      const timestamp = new Date().toLocaleString('vi-VN');
      
      const terminalHtml = renderTerminalEvidenceHtml({
        benchmark: benchmarkLabel,
        scope: job.ownerSection,
        vmName: job.vm.name,
        publicIp: job.vm.publicIp,
        auditJobId: this.jobId,
        timestamp,
        results,
      });

      // Simple score calculation (PASS / (PASS + FAIL))
      const totalScorable = passCount + failCount;
      const score = totalScorable > 0 ? (passCount / totalScorable) * 100 : null;
      
      let riskLevel = null;
      if (job.jobType === 'AUDIT' && score !== null) {
        riskLevel = score >= 80 ? 'Low' : score >= 60 ? 'Medium' : score >= 40 ? 'High' : 'Critical';
      }

      const dashboardHtml = renderDashboardEvidenceHtml({
        benchmark: benchmarkLabel,
        scope: job.ownerSection,
        score: score || 0,
        passCount, failCount, errorCount, unknownCount,
        riskLevel: riskLevel || (job.jobType === 'AUDIT' ? 'Unknown' : 'Operation'),
        auditJobId: this.jobId,
        timestamp,
        results,
      });

      // 6. Upload Evidence to Supabase
      const bucket = archiveBucket;
      const evidencePathPrefix = `archives/audits/${this.jobId}`;

      // Upload Terminal HTML
      const terminalPath = `${evidencePathPrefix}/terminal-evidence.html`;
      await uploadToBucketOrThrow(bucket, terminalPath, terminalHtml, 'text/html');

      // Upload Dashboard HTML
      const dashboardPath = `${evidencePathPrefix}/dashboard-evidence.html`;
      await uploadToBucketOrThrow(bucket, dashboardPath, dashboardHtml, 'text/html');

      // Create Evidence DB records
      await prisma.auditEvidence.createMany({
        data: [
          {
            auditJobId: this.jobId,
            artifactType: 'TERMINAL_HTML',
            artifactName: 'Terminal Execution Evidence',
            storagePath: terminalPath,
            mimeType: 'text/html',
            sizeBytes: Buffer.byteLength(terminalHtml, 'utf-8'),
          },
          {
            auditJobId: this.jobId,
            artifactType: 'DASHBOARD_HTML',
            artifactName: 'Dashboard Summary Evidence',
            storagePath: dashboardPath,
            mimeType: 'text/html',
            sizeBytes: Buffer.byteLength(dashboardHtml, 'utf-8'),
          }
        ]
      });

      // 6.5 Capture Screenshot of Dashboard Evidence using Playwright
      try {
        console.log('Capturing Playwright screenshot...');
        const tempHtmlPath = path.join(os.tmpdir(), `dashboard-${this.jobId}.html`);
        fs.writeFileSync(tempHtmlPath, dashboardHtml, 'utf-8');

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle' });
        
        // Wait an extra second for any animations to settle
        await page.waitForTimeout(1000);
        
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        fs.unlinkSync(tempHtmlPath);

        const screenshotPath = `${evidencePathPrefix}/dashboard-screenshot.png`;
        await uploadToBucketOrThrow(bucket, screenshotPath, screenshotBuffer, 'image/png');

        await prisma.auditEvidence.create({
          data: {
            auditJobId: this.jobId,
            artifactType: 'DASHBOARD_SCREENSHOT',
            artifactName: 'Dashboard Screenshot',
            storagePath: screenshotPath,
            mimeType: 'image/png',
            sizeBytes: screenshotBuffer.length,
          }
        });

        const pdfPath = `${evidencePathPrefix}/dashboard-evidence.pdf`;
        await uploadToBucketOrThrow(bucket, pdfPath, pdfBuffer, 'application/pdf');

        await prisma.auditEvidence.create({
          data: {
            auditJobId: this.jobId,
            artifactType: 'DASHBOARD_PDF',
            artifactName: 'Dashboard PDF Report',
            storagePath: pdfPath,
            mimeType: 'application/pdf',
            sizeBytes: pdfBuffer.length,
          }
        });
        await this.addLog('Dashboard screenshot captured successfully.');
      } catch (screenshotError) {
        await this.addLog(`Warning: Failed to capture dashboard screenshot: ${screenshotError}`);
      }

      // 6.6 Upload Audit Log
      try {
        const logContent = this.logs.join('\n');
        const logPath = `archives/audits/${this.jobId}/audit-log.txt`;
        await uploadToBucketOrThrow(bucket, logPath, logContent, 'text/plain');
        
        await prisma.auditEvidence.create({
          data: {
            auditJobId: this.jobId,
            artifactType: 'AUDIT_LOG',
            artifactName: 'Audit Execution Log',
            storagePath: logPath,
            mimeType: 'text/plain',
            sizeBytes: Buffer.byteLength(logContent, 'utf-8'),
          }
        });
      } catch (logError) {
        console.error('Failed to upload audit log:', logError);
      }

      // 7. Complete Job
      const finishedAt = new Date();
      const jobStartedAt = startedAt;
      const durationMs = finishedAt.getTime() - jobStartedAt.getTime();
      const isFailedOperation = isVmOpsOperation && errorCount > 0;

      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: {
          status: isFailedOperation ? 'FAILED' : 'COMPLETED',
          score,
          riskLevel,
          passCount, failCount, errorCount, unknownCount,
          finishedAt,
          durationMs,
          errorMessage: isFailedOperation ? 'VM Ops operation returned a non-zero exit code' : null,
        }
      });

    } catch (error) {
      if (error instanceof AuditJobCancelledError || await this.isJobMarkedCancelled()) {
        await this.addLog('Audit job cancelled by user.');
        await prisma.auditJob.update({
          where: { id: this.jobId },
          data: {
            status: 'CANCELLED',
            finishedAt: new Date(),
            errorMessage: 'Cancelled by user',
          },
        });
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.addLog(`FATAL ERROR: ${errorMessage}`);
      
      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: errorMessage.slice(0, 1000),
        },
      });
    } finally {
      // Always attempt to upload logs at the end
      try {
        if (this.logs.length > 0) {
          const bucket = archiveBucket;
          const logContent = this.logs.join('\n');
          const logPath = `archives/audits/${this.jobId}/audit-log.txt`;
          await uploadToBucketOrThrow(bucket, logPath, logContent, 'text/plain');
          
          // Check if evidence already exists to avoid duplication
          const existing = await prisma.auditEvidence.findFirst({
            where: { auditJobId: this.jobId, artifactType: 'AUDIT_LOG' }
          });

          if (!existing) {
            await prisma.auditEvidence.create({
              data: {
                auditJobId: this.jobId,
                artifactType: 'AUDIT_LOG',
                artifactName: 'Audit Execution Log',
                storagePath: logPath,
                mimeType: 'text/plain',
                sizeBytes: Buffer.byteLength(logContent, 'utf-8'),
              }
            });
          }
        }
      } catch (logFinalError) {
        console.error('Failed to upload final logs:', logFinalError);
      }
      if (this.runner) {
        await this.runner.disconnect();
      }
      AuditJobExecutor.activeExecutors.delete(this.jobId);
    }
  }
}
