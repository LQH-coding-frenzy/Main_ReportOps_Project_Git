import { Router, Request, Response } from 'express';
import { PrismaClient, VmStatus } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';
import { purgeAuditJobArtifacts } from '../services/audit/archive-cleanup';
import { SSHRunner } from '../services/audit/ssh-runner';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

const ALLOWED_MACHINE_TYPES = ['e2-small', 'e2-medium', 'e2-standard-2'];

function resolveAuditRunnerPrivateKey(): string {
  const rawPrivateKey = env.AUDIT_RUNNER_SSH_KEY;

  if (!rawPrivateKey) {
    throw new Error('AUDIT_RUNNER_SSH_KEY is not configured');
  }

  if (!rawPrivateKey.includes('-----BEGIN')) {
    const cleaned = rawPrivateKey.replace(/[^A-Za-z0-9+/=]/g, '');
    const decoded = Buffer.from(cleaned, 'base64').toString('utf-8').trim();
    if (decoded.includes('-----BEGIN')) {
      return decoded;
    }

    return rawPrivateKey;
  }

  return rawPrivateKey.replace(/\\n/g, '\n').trim();
}

async function collectVmObservability(publicIp: string) {
  const runner = new SSHRunner({
    host: publicIp,
    username: 'audituser',
    privateKey: resolveAuditRunnerPrivateKey(),
    port: 22,
  });

  try {
    await runner.connect();

    const cpuCount = parseInt((await runner.execCommand('nproc')).stdout.trim(), 10) || 0;
    const cpuModel = (await runner.execCommand("grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//'" )).stdout.trim();
    const loadOutput = (await runner.execCommand('cat /proc/loadavg')).stdout.trim().split(/\s+/);
    const memOutput = (await runner.execCommand("awk '/MemTotal:/ {t=int($2/1024)} /MemAvailable:/ {a=int($2/1024)} END {print t, a}' /proc/meminfo")).stdout.trim().split(/\s+/);
    const diskOutput = (await runner.execCommand("df -BM / | awk 'NR==2 {gsub(/M/,\"\", $2); gsub(/M/,\"\", $3); gsub(/%/,\"\", $5); print $2, $3, $5}'")).stdout.trim().split(/\s+/);
    const uptimeHuman = (await runner.execCommand('uptime -p || true')).stdout.trim();
    const nginxStatus = (await runner.execCommand('systemctl is-active nginx || true')).stdout.trim() || 'unknown';
    const sshdStatus = (await runner.execCommand('systemctl is-active sshd || true')).stdout.trim() || 'unknown';

    const memoryTotalMb = parseInt(memOutput[0] || '0', 10) || 0;
    const memoryAvailableMb = parseInt(memOutput[1] || '0', 10) || 0;
    const memoryUsedMb = Math.max(0, memoryTotalMb - memoryAvailableMb);
    const memoryUsagePercent = memoryTotalMb > 0 ? Math.round((memoryUsedMb / memoryTotalMb) * 100) : 0;
    const rootDiskTotalMb = parseInt(diskOutput[0] || '0', 10) || 0;
    const rootDiskUsedMb = parseInt(diskOutput[1] || '0', 10) || 0;
    const rootDiskUsagePercent = parseInt(diskOutput[2] || '0', 10) || 0;
    const load1 = Number.parseFloat(loadOutput[0] || '0') || 0;
    const load5 = Number.parseFloat(loadOutput[1] || '0') || 0;
    const load15 = Number.parseFloat(loadOutput[2] || '0') || 0;
    const cpuPressurePercent = cpuCount > 0 ? Math.min(100, Math.round((load1 / cpuCount) * 100)) : 0;

    return {
      collectedAt: new Date().toISOString(),
      cpuCount,
      cpuModel,
      load1,
      load5,
      load15,
      cpuPressurePercent,
      memoryTotalMb,
      memoryAvailableMb,
      memoryUsedMb,
      memoryUsagePercent,
      rootDiskTotalMb,
      rootDiskUsedMb,
      rootDiskUsagePercent,
      uptimeHuman,
      nginxStatus,
      sshdStatus,
    };
  } finally {
    await runner.disconnect();
  }
}

/**
 * GET /api/lab/vms
 * List all lab VMs.
 */
router.get('/vms', requireAuth, async (_req: Request, res: Response) => {
  try {
    const vms = await prisma.labVm.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, displayName: true, githubUsername: true, avatarUrl: true },
        },
        _count: { select: { auditJobs: true } },
      },
    });
    res.json({ data: vms, status: 200 });
  } catch (error) {
    console.error('List VMs error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/lab/vms/:id
 * Get VM detail.
 */
router.get('/vms/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const vm = await prisma.labVm.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, displayName: true, githubUsername: true, avatarUrl: true },
        },
        auditJobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, status: true, score: true, riskLevel: true,
            createdAt: true, finishedAt: true, mode: true,
          },
        },
      },
    });

    if (!vm) {
      return res.status(404).json({ error: 'VM not found', status: 404 });
    }

    res.json({ data: vm, status: 200 });
  } catch (error) {
    console.error('Get VM error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * POST /api/lab/vms
 * Create a new lab VM (leader only).
 * NOTE: In MVP, this creates a DB record. Terraform provisioning is triggered separately.
 */
router.post('/vms', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { id: number } }).user.id;
    const { name, machineType, diskSizeGb } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'VM name is required', status: 400 });
    }

    if (machineType && !ALLOWED_MACHINE_TYPES.includes(machineType)) {
      return res.status(400).json({ error: 'Unsupported machine type', status: 400 });
    }

    // Check name uniqueness
    const existing = await prisma.labVm.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'VM name already exists', status: 409 });
    }

    // Generate verification token
    const verificationToken = `rops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const vm = await prisma.labVm.create({
      data: {
        name,
        machineType: machineType || 'e2-medium',
        diskSizeGb: diskSizeGb || 20,
        status: 'PROVISIONING',
        verificationToken,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true, githubUsername: true },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
          userId,
          action: 'create_lab_vm',
          details: { vmId: vm.id, name, machineType: machineType || 'e2-medium' },
          ipAddress: req.ip,
        },
      });

    // Trigger Terraform GitHub Action if configured
    if (env.GITHUB_TOKEN && env.GITHUB_REPO_OWNER && env.GITHUB_REPO_NAME) {
      const repo = `${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
      const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'trigger-terraform',
          client_payload: {
            action: 'apply',
            vm_id: vm.id.toString(),
            vm_name: vm.name,
            machine_type: vm.machineType,
            disk_size_gb: vm.diskSizeGb.toString(),
            verification_token: verificationToken,
          }
        })
      });

      if (!dispatchRes.ok) {
        const detail = await dispatchRes.text().catch(() => '');
        await prisma.labVm.update({
          where: { id: vm.id },
          data: {
            status: 'ERROR',
            errorMessage: `Failed to trigger Terraform workflow: ${dispatchRes.status} ${detail}`.slice(0, 500),
          },
        });

        return res.status(502).json({
          error: 'Failed to trigger Terraform workflow',
          status: 502,
          data: vm,
        });
      }
    }

    res.status(201).json({ data: vm, status: 201 });
  } catch (error) {
    console.error('Create VM error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * PATCH /api/lab/vms/:id/status
 * Update VM status (for internal use / runner callbacks).
 */
router.patch('/vms/:id/status', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, publicIp, gcpInstanceName, gcpZone, errorMessage } = req.body;

    const vm = await prisma.labVm.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(publicIp && { publicIp }),
        ...(gcpInstanceName && { gcpInstanceName }),
        ...(gcpZone && { gcpZone }),
        ...(errorMessage !== undefined && { errorMessage }),
      },
    });

    res.json({ data: vm, status: 200 });
  } catch (error) {
    console.error('Update VM status error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * GET /api/lab/vms/:id/observability
 * Collect live VM hardware/service observability over SSH.
 */
router.get('/vms/:id/observability', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const vm = await prisma.labVm.findUnique({ where: { id } });

    if (!vm) {
      return res.status(404).json({ error: 'VM not found', status: 404 });
    }

    if (vm.status !== 'RUNNING' || !vm.publicIp) {
      return res.status(400).json({ error: 'VM is not ready for observability', status: 400 });
    }

    const observability = await collectVmObservability(vm.publicIp);
    res.json({ data: observability, status: 200 });
  } catch (error) {
    console.error('Get VM observability error:', error);
    res.status(500).json({ error: 'Failed to collect VM observability', status: 500 });
  }
});

/**
 * POST /api/lab/vms/:id/callback
 * Internal callback from the Terraform runner.
 */
router.post('/vms/:id/callback', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid VM id', status: 400 });
      return;
    }

    const { status, publicIp, gcpInstanceName, gcpProjectId, gcpZone, errorMessage, runUrl } = req.body as {
      status?: string;
      publicIp?: string;
      gcpInstanceName?: string;
      gcpProjectId?: string;
      gcpZone?: string;
      errorMessage?: string;
      runUrl?: string;
    };

    const nextStatus =
      status === 'PROVISIONING' ||
      status === 'RUNNING' ||
      status === 'STOPPED' ||
      status === 'DESTROYING' ||
      status === 'DESTROYED' ||
      status === 'ERROR'
        ? (status as VmStatus)
        : undefined;

    const vm = await prisma.labVm.findUnique({ where: { id } });
    if (!vm) {
      res.status(404).json({ error: 'VM not found', status: 404 });
      return;
    }

    const providedToken = req.header('x-verification-token');
    if (!providedToken || providedToken !== vm.verificationToken) {
      res.status(403).json({ error: 'Invalid verification token', status: 403 });
      return;
    }

    const updated = await prisma.labVm.update({
      where: { id },
      data: {
        ...(nextStatus && { status: nextStatus }),
        ...(publicIp && { publicIp }),
        ...(gcpInstanceName && { gcpInstanceName }),
        ...(gcpProjectId && { gcpProjectId }),
        ...(gcpZone && { gcpZone }),
        ...(errorMessage !== undefined && { errorMessage }),
        ...(runUrl && { latestRunUrl: runUrl }),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: vm.createdById,
        action: 'lab_vm_callback',
        details: { vmId: vm.id, status, publicIp, gcpInstanceName, gcpProjectId, gcpZone, errorMessage, runUrl },
      },
    });

    res.json({ data: updated, status: 200 });
  } catch (error) {
    console.error('Lab VM callback error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * DELETE /api/lab/vms/:id
 * Delete/destroy a VM (leader only).
 */
router.delete('/vms/:id', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { id: number } }).user.id;
    const id = parseInt(req.params.id, 10);

    const vm = await prisma.labVm.findUnique({ where: { id } });
    if (!vm) {
      return res.status(404).json({ error: 'VM not found', status: 404 });
    }

    // Mark as destroying (actual Terraform destroy is handled by runner)
    await prisma.labVm.update({
      where: { id },
      data: { status: 'DESTROYING' },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'destroy_lab_vm',
        details: { vmId: id, name: vm.name },
        ipAddress: req.ip,
      },
    });

    // Trigger Terraform GitHub Action to destroy if configured
    if (env.GITHUB_TOKEN && env.GITHUB_REPO_OWNER && env.GITHUB_REPO_NAME) {
      const repo = `${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
      const dispatchRes = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'trigger-terraform',
          client_payload: {
            action: 'destroy',
            vm_id: vm.id.toString(),
            vm_name: vm.name,
            machine_type: vm.machineType,
            disk_size_gb: vm.diskSizeGb.toString(),
            verification_token: vm.verificationToken || 'none',
          }
        })
      });

      if (!dispatchRes.ok) {
        const detail = await dispatchRes.text().catch(() => '');
        await prisma.labVm.update({
          where: { id },
          data: {
            status: 'ERROR',
            errorMessage: `Failed to trigger Terraform destroy workflow: ${dispatchRes.status} ${detail}`.slice(0, 500),
          },
        });

        res.status(502).json({
          error: 'Failed to trigger Terraform destroy workflow',
          status: 502,
        });
        return;
      }
    }

    res.json({ data: { message: 'VM destruction initiated' }, status: 200 });
  } catch (error) {
    console.error('Delete VM error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

/**
 * DELETE /api/lab/vms/:id/index
 * Permanently remove a destroyed VM record and its historical audit indexes.
 */
router.delete('/vms/:id/index', requireAuth, requireLeader, async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { id: number } }).user.id;
    const id = parseInt(req.params.id, 10);

    const vm = await prisma.labVm.findUnique({ where: { id } });
    if (!vm) {
      return res.status(404).json({ error: 'VM not found', status: 404 });
    }

    if (vm.status !== 'DESTROYED') {
      return res.status(400).json({ error: 'Only destroyed VMs can be removed from index', status: 400 });
    }

    const jobs = await prisma.auditJob.findMany({
      where: { vmId: id },
      select: { id: true },
    });

    for (const job of jobs) {
      await purgeAuditJobArtifacts(prisma, job.id);
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'purge_lab_vm_index',
        details: { vmId: id, name: vm.name, deletedAuditJobs: jobs.length },
        ipAddress: req.ip,
      },
    });

    await prisma.labVm.delete({ where: { id } });

    res.json({ data: { deleted: true }, status: 200 });
  } catch (error) {
    console.error('Purge VM index error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
