import { PrismaClient } from '@prisma/client';
import { SSHRunner } from './ssh-runner';
import { parseCisStdout, NormalizedAuditResult } from './cis-stdout-parser';
import { renderTerminalEvidenceHtml, renderDashboardEvidenceHtml } from './evidence-renderer';
import { supabase } from '../../config/supabase';

const prisma = new PrismaClient();

export class AuditJobExecutor {
  private jobId: number;
  private runner?: SSHRunner;
  private job?: any;

  constructor(jobId: number) {
    this.jobId = jobId;
  }

  async execute(): Promise<void> {
    try {
      // 1. Fetch Job and VM details
      this.job = await prisma.auditJob.findUnique({
        where: { id: this.jobId },
        include: { vm: true }
      });

      if (!this.job) throw new Error(`Audit Job ${this.jobId} not found`);
      if (this.job.status !== 'PENDING') throw new Error(`Job is already in status ${this.job.status}`);
      if (!this.job.vm.publicIp) throw new Error('VM does not have a public IP address');

      // Update status to RUNNING
      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: { status: 'RUNNING', startedAt: new Date() }
      });

      // 2. Fetch active scripts for the given ownerSection (e.g., M1)
      const scripts = await prisma.auditScript.findMany({
        where: {
          enabled: true,
          pack: { ownerSection: this.job.ownerSection, enabled: true }
        },
        orderBy: { controlId: 'asc' }
      });

      if (scripts.length === 0) {
        throw new Error(`No enabled scripts found for section ${this.job.ownerSection}`);
      }

      // 3. Connect via SSH
      // IMPORTANT: In production, the private key should be loaded from Secret Manager or env
      const privateKey = process.env.AUDIT_RUNNER_SSH_KEY;
      if (!privateKey) throw new Error('AUDIT_RUNNER_SSH_KEY is not configured');

      this.runner = new SSHRunner({
        host: this.job.vm.publicIp,
        username: 'audituser',
        privateKey: privateKey.replace(/\\n/g, '\n'),
      });

      await this.runner.connect();

      // Create remote directory
      const remoteDir = `/tmp/audit-run-${this.jobId}`;
      await this.runner.execCommand(`mkdir -p ${remoteDir}`);

      const results: NormalizedAuditResult[] = [];
      let passCount = 0;
      let failCount = 0;
      let manualCount = 0;
      let errorCount = 0;
      let unknownCount = 0;

      // 4. Execute Scripts
      for (const script of scripts) {
        if (!script.scriptStoragePath) continue;
        
        const scriptStartTime = Date.now();

        // Download script from Supabase
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents')
          .download(script.scriptStoragePath);

        if (downloadError || !fileData) {
          console.error(`Failed to download script ${script.controlId}:`, downloadError);
          continue;
        }

        const scriptContent = Buffer.from(await fileData.arrayBuffer());
        const remoteScriptPath = `${remoteDir}/${script.controlId}.sh`;

        // Upload to VM
        await this.runner.uploadFile(scriptContent, remoteScriptPath);

        // Make executable
        await this.runner.execCommand(`chmod +x ${remoteScriptPath}`);

        // Run the script (Audit scripts in M1 read state, running with sudo if required by CIS)
        // MVP policy: allow_sudo_for_read_only_audit_commands = yes
        const cmdResult = await this.runner.execCommand(`sudo ${remoteScriptPath}`);
        
        const scriptEndTime = Date.now();

        // Parse Output
        const parsed = parseCisStdout({
          controlId: script.controlId,
          title: script.title,
          section: script.section,
          ownerSection: this.job.ownerSection as 'M1',
          assessmentType: script.assessmentType as 'Automated' | 'Manual',
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
          case 'MANUAL': manualCount++; break;
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
            normalizedResultJson: parsed as any,
            startedAt: new Date(scriptStartTime),
            finishedAt: new Date(scriptEndTime),
            durationMs: scriptEndTime - scriptStartTime,
          }
        });
      }

      // Cleanup VM temp dir
      await this.runner.execCommand(`rm -rf ${remoteDir}`);

      // 5. Generate Evidence Artifacts
      const timestamp = new Date().toLocaleString('vi-VN');
      
      const terminalHtml = renderTerminalEvidenceHtml({
        benchmark: 'CIS AlmaLinux OS 9 Benchmark v2.0.0',
        scope: this.job.ownerSection,
        vmName: this.job.vm.name,
        publicIp: this.job.vm.publicIp,
        auditJobId: this.jobId,
        timestamp,
        results,
      });

      // Simple score calculation (PASS / (PASS + FAIL))
      const totalScorable = passCount + failCount;
      const score = totalScorable > 0 ? (passCount / totalScorable) * 100 : null;
      
      let riskLevel = null;
      if (score !== null) {
        riskLevel = score >= 80 ? 'Low' : score >= 60 ? 'Medium' : score >= 40 ? 'High' : 'Critical';
      }

      const dashboardHtml = renderDashboardEvidenceHtml({
        benchmark: 'CIS AlmaLinux OS 9 Benchmark v2.0.0',
        scope: this.job.ownerSection,
        score: score || 0,
        passCount, failCount, manualCount, errorCount, unknownCount,
        riskLevel: riskLevel || 'Unknown',
        auditJobId: this.jobId,
        timestamp,
        results,
      });

      // 6. Upload Evidence to Supabase
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents';
      const evidencePathPrefix = `archives/audits/${this.jobId}`;

      // Upload Terminal HTML
      const terminalPath = `${evidencePathPrefix}/terminal-evidence.html`;
      await supabase.storage.from(bucket).upload(terminalPath, terminalHtml, { contentType: 'text/html', upsert: true });

      // Upload Dashboard HTML
      const dashboardPath = `${evidencePathPrefix}/dashboard-evidence.html`;
      await supabase.storage.from(bucket).upload(dashboardPath, dashboardHtml, { contentType: 'text/html', upsert: true });

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

      // 7. Complete Job
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - this.job.startedAt.getTime();

      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: {
          status: 'COMPLETED',
          score,
          riskLevel,
          passCount, failCount, manualCount, errorCount, unknownCount,
          finishedAt,
          durationMs,
        }
      });

    } catch (error) {
      console.error(`Audit Job ${this.jobId} Failed:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: {
          status: 'FAILED',
          errorMessage,
          finishedAt: new Date(),
        }
      });
    } finally {
      if (this.runner) {
        await this.runner.disconnect();
      }
    }
  }
}
