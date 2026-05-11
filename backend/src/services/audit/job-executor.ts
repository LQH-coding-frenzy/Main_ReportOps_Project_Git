import { PrismaClient, AuditJob, LabVm, AuditScript } from '@prisma/client';
import { SSHRunner } from './ssh-runner';
import { parseCisStdout, NormalizedAuditResult } from './cis-stdout-parser';
import { renderTerminalEvidenceHtml, renderDashboardEvidenceHtml } from './evidence-renderer';
import { supabase } from '../../config/supabase';
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const prisma = new PrismaClient();

export class AuditJobExecutor {
  private jobId: number;
  private runner?: SSHRunner;
  private job: (AuditJob & { vm: LabVm }) | null = null;
  private logs: string[] = [];

  constructor(jobId: number) {
    this.jobId = jobId;
  }

  private addLog(message: string) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    this.logs.push(entry);
    console.log(`[Job ${this.jobId}] ${message}`);
  }

  async execute(): Promise<void> {
    try {
      // 1. Fetch Job and VM details
      this.job = await prisma.auditJob.findUnique({
        where: { id: this.jobId },
        include: { vm: true }
      });

      if (!this.job) throw new Error(`Audit Job ${this.jobId} not found`);
      const job = this.job; // Local narrowing

      if (job.status !== 'PENDING') throw new Error(`Job is already in status ${job.status}`);
      if (!job.vm.publicIp) throw new Error('VM does not have a public IP address');

      // Update status to RUNNING
      await prisma.auditJob.update({
        where: { id: this.jobId },
        data: { status: 'RUNNING', startedAt: new Date() }
      });

      const isOpenscap = job.mode === 'OPENSCAP_ONLY' || job.mode === 'OPENSCAP_AND_SCRIPTS';
      const isScripts = job.mode === 'SCRIPTS_ONLY' || job.mode === 'OPENSCAP_AND_SCRIPTS';

      // 2. Fetch active scripts if needed
      let scripts: AuditScript[] = [];
      if (isScripts) {
        scripts = await prisma.auditScript.findMany({
          where: {
            enabled: true,
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
          // Remove ALL whitespace and non-base64 characters
          const cleaned = rawPrivateKey.replace(/[^A-Za-z0-9+/=]/g, '');
          
          // Add padding if missing
          let padded = cleaned;
          while (padded.length % 4 !== 0) {
            padded += '=';
          }

          const decodedBuffer = Buffer.from(padded, 'base64');
          const decodedString = decodedBuffer.toString('utf-8');
          
          if (decodedString.includes('-----BEGIN')) {
            privateKeyBuffer = decodedString; // Use the string!
            this.addLog('Detected and decoded Base64 SSH key.');
          }
        } catch {
          this.addLog('Warning: Failed to decode Base64 key, using as-is.');
        }
      } else {
        // If it's already a PEM string, ensure literal \n are handled
        privateKeyBuffer = rawPrivateKey.replace(/\\n/g, '\n').trim();
      }
      
      this.addLog(`Connecting to VM at ${job.vm.publicIp} as audituser...`);
      this.runner = new SSHRunner({
        host: job.vm.publicIp,
        username: 'audituser',
        privateKey: privateKeyBuffer,
      });

      let connected = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!connected && attempts < maxAttempts) {
        try {
          attempts++;
          if (attempts > 1) {
            this.addLog(`Retry connection attempt ${attempts}/${maxAttempts}...`);
          }
          await this.runner.connect();
          connected = true;
          this.addLog('SSH connection established.');
        } catch (connError) {
          const msg = connError instanceof Error ? connError.message : String(connError);
          if (attempts < maxAttempts && (msg.includes('Timed out') || msg.includes('ECONNREFUSED'))) {
            this.addLog(`Connection attempt ${attempts} failed: ${msg}. Waiting 10s...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          } else {
            this.addLog(`SSH Connection Failed: ${msg}`);
            if (msg.includes('Authentication failed')) {
              this.addLog('TIP: This usually means the VM is still initializing or the SSH key is incorrect.');
            }
            throw connError;
          }
        }
      }

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
      if (isScripts && scripts.length > 0) {
        for (const script of scripts) {
          this.addLog(`Running script: ${script.controlId} (${script.title})`);
          
          const scriptStartTime = Date.now();

          // Download script from Supabase
          const { data: fileData, error: downloadError } = await supabase.storage
            .from(process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents')
            .download(script.scriptStoragePath);

          if (downloadError || !fileData) {
            this.addLog(`ERROR: Failed to download script ${script.controlId}: ${downloadError?.message}`);
            continue;
          }

          const scriptContent = Buffer.from(await fileData.arrayBuffer());
          const remoteScriptPath = `${remoteDir}/${script.controlId}.sh`;

          // Upload to VM
          await this.runner.uploadFile(scriptContent, remoteScriptPath);

          // Make executable
          await this.runner.execCommand(`chmod +x ${remoteScriptPath}`);

          // Run the script
          const cmdResult = await this.runner.execCommand(`sudo ${remoteScriptPath}`);
          this.addLog(`Script ${script.controlId} finished with exit code ${cmdResult.exitCode}`);
          if (cmdResult.stderr) this.addLog(`Stderr: ${cmdResult.stderr}`);
          
          const scriptEndTime = Date.now();

          // Parse Output
          const parsed = parseCisStdout({
            controlId: script.controlId,
            title: script.title,
            section: script.section,
            ownerSection: job.ownerSection as 'M1',
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
        console.log(`Executing OpenSCAP baseline scan for job ${this.jobId}...`);
        const profile = 'xccdf_org.ssgproject.content_profile_cis';
        const dsPath = '/usr/share/xml/scap/ssg/content/ssg-almalinux9-ds.xml';
        
        // Ensure oscap is installed (should be done by Terraform, but just in case)
        await this.runner.execCommand(`sudo dnf install -y openscap-scanner scap-security-guide`);
        
        const oscapCmd = `sudo oscap xccdf eval --profile ${profile} --results ${remoteDir}/oscap-results.xml --report ${remoteDir}/oscap-report.html ${dsPath}`;
        
        // oscap exit code is 2 if there are failures, 0 if 100% pass, 1 on error
        await this.runner.execCommand(oscapCmd);
        
        // Count pass/fail directly from XML
        const passOutput = await this.runner.execCommand(`grep -c '<result>pass</result>' ${remoteDir}/oscap-results.xml || echo 0`);
        const failOutput = await this.runner.execCommand(`grep -c '<result>fail</result>' ${remoteDir}/oscap-results.xml || echo 0`);
        const errorOutput = await this.runner.execCommand(`grep -c '<result>error</result>' ${remoteDir}/oscap-results.xml || echo 0`);
        
        const oPass = parseInt(passOutput.stdout.trim()) || 0;
        const oFail = parseInt(failOutput.stdout.trim()) || 0;
        const oError = parseInt(errorOutput.stdout.trim()) || 0;
        
        passCount += oPass;
        failCount += oFail;
        errorCount += oError;

        // Add a mock result row for OpenSCAP so it appears in the dashboard
        results.push({
          controlId: 'OpenSCAP',
          title: `OpenSCAP CIS Baseline (Pass: ${oPass}, Fail: ${oFail})`,
          section: 'OS',
          status: oFail > 0 ? 'FAIL' : 'PASS',
          assessmentType: 'Automated',
          ownerSection: job.ownerSection as 'M1',
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
        
        // Download HTML report and upload to Supabase
        const oscapHtml = await this.runner.execCommand(`cat ${remoteDir}/oscap-report.html`);
        if (oscapHtml.stdout) {
          const oscapReportPath = `archives/audits/${this.jobId}/openscap-report.html`;
          const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents';
          await supabase.storage.from(bucket).upload(oscapReportPath, Buffer.from(oscapHtml.stdout, 'utf-8'), { contentType: 'text/html', upsert: true });
          
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
      }

      // Cleanup VM temp dir
      await this.runner.execCommand(`sudo rm -rf ${remoteDir}`);

      // 5. Generate Evidence Artifacts
      const timestamp = new Date().toLocaleString('vi-VN');
      
      const terminalHtml = renderTerminalEvidenceHtml({
        benchmark: 'CIS AlmaLinux OS 9 Benchmark v2.0.0',
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
      if (score !== null) {
        riskLevel = score >= 80 ? 'Low' : score >= 60 ? 'Medium' : score >= 40 ? 'High' : 'Critical';
      }

      const dashboardHtml = renderDashboardEvidenceHtml({
        benchmark: 'CIS AlmaLinux OS 9 Benchmark v2.0.0',
        scope: job.ownerSection,
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
        await browser.close();
        fs.unlinkSync(tempHtmlPath);

        const screenshotPath = `${evidencePathPrefix}/dashboard-screenshot.png`;
        await supabase.storage.from(bucket).upload(screenshotPath, screenshotBuffer, { contentType: 'image/png', upsert: true });

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
        this.addLog('Dashboard screenshot captured successfully.');
      } catch (screenshotError) {
        this.addLog(`Warning: Failed to capture dashboard screenshot: ${screenshotError}`);
      }

      // 6.6 Upload Audit Log
      try {
        const logContent = this.logs.join('\n');
        const logPath = `archives/audits/${this.jobId}/audit-log.txt`;
        await supabase.storage.from(bucket).upload(logPath, logContent, { contentType: 'text/plain', upsert: true });
        
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
      const jobStartedAt = job.startedAt || new Date(); // Fallback
      const durationMs = finishedAt.getTime() - jobStartedAt.getTime();

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog(`FATAL ERROR: ${errorMessage}`);
      
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
          const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'reportops-documents';
          const logContent = this.logs.join('\n');
          const logPath = `archives/audits/${this.jobId}/audit-log.txt`;
          
          await supabase.storage.from(bucket).upload(logPath, logContent, { 
            contentType: 'text/plain', 
            upsert: true 
          });
          
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
    }
  }
}
