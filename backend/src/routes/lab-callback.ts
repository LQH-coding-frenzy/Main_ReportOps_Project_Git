import { Router, Request, Response } from 'express';
import { PrismaClient, VmStatus } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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

export default router;
