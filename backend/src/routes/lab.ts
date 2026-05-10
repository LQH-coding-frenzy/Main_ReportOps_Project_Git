import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { requireLeader } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

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
        machineType: machineType || 'e2-micro',
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
        details: { vmId: vm.id, name, machineType: machineType || 'e2-micro' },
        ipAddress: req.ip,
      },
    });

    // Trigger Terraform GitHub Action if configured
    if (process.env.GITHUB_PAT && process.env.GITHUB_REPO) {
      fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${process.env.GITHUB_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'trigger-terraform',
          client_payload: {
            action: 'apply',
            vm_id: vm.id.toString(),
            vm_name: vm.name,
            verification_token: verificationToken,
          }
        })
      }).catch(err => console.error('Failed to trigger GitHub Action:', err));
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
    if (process.env.GITHUB_PAT && process.env.GITHUB_REPO) {
      fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${process.env.GITHUB_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'trigger-terraform',
          client_payload: {
            action: 'destroy',
            vm_id: vm.id.toString(),
            vm_name: vm.name,
            verification_token: vm.verificationToken || 'none',
          }
        })
      }).catch(err => console.error('Failed to trigger GitHub Action for destroy:', err));
    }

    res.json({ data: { message: 'VM destruction initiated' }, status: 200 });
  } catch (error) {
    console.error('Delete VM error:', error);
    res.status(500).json({ error: 'Internal server error', status: 500 });
  }
});

export default router;
