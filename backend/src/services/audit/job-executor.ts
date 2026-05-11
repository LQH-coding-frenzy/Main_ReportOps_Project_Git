import { PrismaClient, AuditJob, LabVm, AuditScript } from '@prisma/client';
import { SSHRunner } from './ssh-runner';
import { parseCisStdout, NormalizedAuditResult } from './cis-stdout-parser';
import { renderTerminalEvidenceHtml, renderDashboardEvidenceHtml } from './evidence-renderer';
import { env } from '../../config/env';
import { getProjectAnswers } from '../../config/project-answers';
import { supabase } from '../../config/supabase';
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const prisma = new PrismaClient();
const documentsBucket = env.SUPABASE_STORAGE_BUCKET;
const archiveBucket = env.SUPABASE_ARCHIVE_BUCKET;
const projectAnswers = getProjectAnswers();
const benchmarkName = projectAnswers.benchmark?.name || 'CIS AlmaLinux OS 9 Benchmark';
const benchmarkVersion = projectAnswers.benchmark?.version || '2.0.0';
const benchmarkProfile = projectAnswers.benchmark?.profile || 'Level 1 - Server';
const benchmarkLabel = `${benchmarkName} v${benchmarkVersion}`;

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
  const actionableRows = input.rows.filter((row) => {
    const normalized = row.result.toLowerCase();
    return !['notselected', 'notchecked'].includes(normalized);
  });

  return JSON.stringify(
    {
      benchmark: input.benchmark,
      profile: input.profile,
      ownerSection: input.ownerSection,
      scope: 'M1',
      m1Sections: projectAnswers.m1_scope?.sections || [],
      counts: input.counts,
      ruleResults: actionableRows,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export class AuditJobExecutor {
  private jobId: number;
  private runner?: SSHRunner;
  private job: (AuditJob & { vm: LabVm }) | null = null;
  private logs: string[] = [];

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
            await this.addLog('Detected and decoded Base64 SSH key.');
          }
        } catch {
          await this.addLog('Warning: Failed to decode Base64 key, using as-is.');
        }
      } else {
        // If it's already a PEM string, ensure literal \n are handled
        privateKeyBuffer = rawPrivateKey.replace(/\\n/g, '\n').trim();
      }
      
      await this.addLog(`Connecting to VM at ${job.vm.publicIp} as audituser...`);
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
          await this.addLog(`Running script: ${script.controlId} (${script.title})`);
          
          const scriptStartTime = Date.now();

          // Download script from Supabase
          const { data: fileData, error: downloadError } = await supabase.storage
            .from(documentsBucket)
            .download(script.scriptStoragePath);

          if (downloadError || !fileData) {
            await this.addLog(`ERROR: Failed to download script ${script.controlId}: ${downloadError?.message}`);
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
          await this.addLog(`Script ${script.controlId} finished with exit code ${cmdResult.exitCode}`);
          if (cmdResult.stderr) await this.addLog(`Stderr: ${cmdResult.stderr}`);
          
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
        const openScapPrefix = `archives/audits/${this.jobId}/m1/openscap`;
        const oscapResultsXmlPath = `${remoteDir}/oscap-results.xml`;
        const oscapArfXmlPath = `${remoteDir}/oscap-results-arf.xml`;
        const oscapReportHtmlPath = `${remoteDir}/oscap-report.html`;
        
        // Ensure oscap is installed (should be done by Terraform, but just in case)
        await this.runner.execCommand(`sudo dnf install -y openscap-scanner scap-security-guide`);
        
        const oscapCmd = `sudo oscap xccdf eval --profile ${profile} --results ${oscapResultsXmlPath} --results-arf ${oscapArfXmlPath} --report ${oscapReportHtmlPath} ${dsPath}`;
        
        // oscap exit code is 2 if there are failures, 0 if 100% pass, 1 on error
        await this.runner.execCommand(oscapCmd);
        
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
        
        // Download raw OpenSCAP artifacts and upload to Supabase
        const oscapHtml = await this.runner.execCommand(`cat ${oscapReportHtmlPath}`);
        const oscapXml = await this.runner.execCommand(`cat ${oscapResultsXmlPath}`);
        const oscapArf = await this.runner.execCommand(`cat ${oscapArfXmlPath}`);
        const bucket = archiveBucket;

        const oscapReportPath = `${openScapPrefix}/report.html`;
        const oscapXmlPath = `${openScapPrefix}/results.xml`;
        const oscapArfPath = `${openScapPrefix}/results-arf.xml`;

        if (oscapHtml.stdout) {
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

        if (oscapXml.stdout) {
          await supabase.storage.from(bucket).upload(oscapXmlPath, Buffer.from(oscapXml.stdout, 'utf-8'), { contentType: 'application/xml', upsert: true });
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
          await supabase.storage.from(bucket).upload(oscapArfPath, Buffer.from(oscapArf.stdout, 'utf-8'), { contentType: 'application/xml', upsert: true });
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
        const oscapSummaryPath = `${openScapPrefix}/openscap-m1-filtered.json`;
        const oscapSummaryJson = buildOpenScapFilteredJson({
          benchmark: benchmarkLabel,
          profile: benchmarkProfile,
          ownerSection: job.ownerSection,
          counts: { pass: oPass, fail: oFail, error: oError },
          rows: parseOpenScapResultRows(oscapXml.stdout),
        });
        await supabase.storage.from(bucket).upload(oscapSummaryPath, Buffer.from(oscapSummaryJson, 'utf-8'), { contentType: 'application/json', upsert: true });
        await prisma.auditEvidence.create({
          data: {
            auditJobId: this.jobId,
            artifactType: 'OPENSCAP_M1_FILTERED_JSON',
            artifactName: 'OpenSCAP M1 Filtered JSON',
            storagePath: oscapSummaryPath,
            mimeType: 'application/json',
            sizeBytes: Buffer.byteLength(oscapSummaryJson, 'utf-8'),
          }
        });
      }

      // Cleanup VM temp dir
      await this.runner.execCommand(`sudo rm -rf ${remoteDir}`);

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
      if (score !== null) {
        riskLevel = score >= 80 ? 'Low' : score >= 60 ? 'Medium' : score >= 40 ? 'High' : 'Critical';
      }

      const dashboardHtml = renderDashboardEvidenceHtml({
        benchmark: benchmarkLabel,
        scope: job.ownerSection,
        score: score || 0,
        passCount, failCount, manualCount, errorCount, unknownCount,
        riskLevel: riskLevel || 'Unknown',
        auditJobId: this.jobId,
        timestamp,
        results,
      });

      // 6. Upload Evidence to Supabase
      const bucket = archiveBucket;
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
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
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

        const pdfPath = `${evidencePathPrefix}/dashboard-evidence.pdf`;
        await supabase.storage.from(bucket).upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

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
