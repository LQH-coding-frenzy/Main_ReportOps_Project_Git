import type { AuditJob, AuditResultStatus, AuditScriptRun, VmOpsOperationContext, VmOpsOperationType } from './types';

export const VM_OPS_TABS: Array<{ type: 'AUDIT' | VmOpsOperationType; label: string; href: string }> = [
  { type: 'AUDIT', label: 'Audit', href: '/audit' },
  { type: 'REMEDIATION', label: 'Remediate', href: '/audit/remediate' },
  { type: 'NOT_APPLICABLE_FIX', label: 'Not Applicable Fix', href: '/audit/not-applicable-fix' },
  { type: 'REVERSE_REMEDIATE', label: 'Reverse Remediate', href: '/audit/reverse-remediate' },
];

export function getVmOpsOperationLabel(operationType: VmOpsOperationType): string {
  switch (operationType) {
    case 'REMEDIATION':
      return 'Remediate';
    case 'NOT_APPLICABLE_FIX':
      return 'Not Applicable Fix';
    case 'REVERSE_REMEDIATE':
      return 'Reverse Remediate';
    default:
      return operationType;
  }
}

export function getVmOpsJobListHref(jobType: string): string {
  switch (jobType) {
    case 'REMEDIATION':
      return '/audit/remediate';
    case 'NOT_APPLICABLE_FIX':
      return '/audit/not-applicable-fix';
    case 'REVERSE_REMEDIATE':
      return '/audit/reverse-remediate';
    default:
      return '/audit';
  }
}

export function getVmOpsEligibleStatus(operationType: VmOpsOperationType): AuditResultStatus {
  switch (operationType) {
    case 'REMEDIATION':
      return 'FAIL';
    case 'NOT_APPLICABLE_FIX':
      return 'NOT_APPLICABLE';
    case 'REVERSE_REMEDIATE':
      return 'PASS';
    default:
      return 'UNKNOWN';
  }
}

export function getVmOpsJobTitle(jobType: string): string {
  if (jobType === 'AUDIT') {
    return 'Audit';
  }

  return getVmOpsOperationLabel(jobType as VmOpsOperationType);
}

export function extractVmOpsOperationContext(job: Pick<AuditJob, 'summaryJson'> | null | undefined): VmOpsOperationContext | null {
  const context = job?.summaryJson?.operationContext;
  if (!context || !Array.isArray(context.selectedControlIds)) {
    return null;
  }

  if (
    typeof context.sourceJobId !== 'number' ||
    typeof context.operationType !== 'string' ||
    !['REMEDIATION', 'NOT_APPLICABLE_FIX', 'REVERSE_REMEDIATE'].includes(context.operationType)
  ) {
    return null;
  }

  return {
    sourceJobId: context.sourceJobId,
    operationType: context.operationType as VmOpsOperationType,
    selectedControlIds: context.selectedControlIds.filter((value): value is string => typeof value === 'string'),
    requestedById: typeof context.requestedById === 'number' ? context.requestedById : undefined,
    requestedAt: typeof context.requestedAt === 'string' ? context.requestedAt : undefined,
  };
}

export function getEligibleVmOpsRuns(job: AuditJob | null, operationType: VmOpsOperationType): AuditScriptRun[] {
  if (!job?.scriptRuns) {
    return [];
  }

  const requiredStatus = getVmOpsEligibleStatus(operationType);
  return job.scriptRuns.filter((run) => run.status === requiredStatus);
}
