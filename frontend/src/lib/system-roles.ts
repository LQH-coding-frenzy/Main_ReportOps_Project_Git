import type { Role, User } from './types';

export type AppCapability =
  | 'admin_panel'
  | 'manage_users'
  | 'manage_roles'
  | 'manage_sections'
  | 'manage_settings'
  | 'view_audit_logs'
  | 'manage_audit_packs'
  | 'run_audits'
  | 'run_remediation'
  | 'manage_lab'
  | 'use_lab_ssh'
  | 'view_archive'
  | 'view_reports'
  | 'manage_reports'
  | 'view_releases'
  | 'manage_releases'
  | 'view_performance';

const CAPABILITY_ROLES: Record<AppCapability, Role[]> = {
  admin_panel: ['LEADER', 'ADMIN'],
  manage_users: ['LEADER', 'ADMIN'],
  manage_roles: ['LEADER', 'ADMIN'],
  manage_sections: ['LEADER', 'ADMIN'],
  manage_settings: ['LEADER', 'ADMIN'],
  view_audit_logs: ['LEADER', 'ADMIN'],
  manage_audit_packs: ['LEADER', 'ADMIN', 'AUDITOR'],
  run_audits: ['LEADER', 'ADMIN', 'AUDITOR'],
  run_remediation: ['LEADER', 'ADMIN', 'AUDITOR'],
  manage_lab: ['LEADER', 'ADMIN', 'AUDITOR'],
  use_lab_ssh: ['LEADER', 'ADMIN', 'AUDITOR'],
  view_archive: ['LEADER', 'ADMIN', 'AUDITOR', 'VIEWER'],
  view_reports: ['LEADER', 'ADMIN', 'VIEWER'],
  manage_reports: ['LEADER', 'ADMIN'],
  view_releases: ['LEADER', 'ADMIN', 'VIEWER'],
  manage_releases: ['LEADER', 'ADMIN'],
  view_performance: ['LEADER', 'ADMIN'],
};

const ROLE_PRIORITY: Role[] = ['LEADER', 'ADMIN', 'AUDITOR', 'MEMBER', 'VIEWER'];

function sortRoles(roles: Iterable<Role>): Role[] {
  return Array.from(new Set(roles)).sort((left, right) => ROLE_PRIORITY.indexOf(left) - ROLE_PRIORITY.indexOf(right));
}

export function getEffectiveRoles(user: Pick<User, 'role' | 'roles'> | null | undefined): Role[] {
  if (!user) {
    return [];
  }

  const roles = new Set<Role>();
  if (Array.isArray(user.roles)) {
    for (const role of user.roles) {
      roles.add(role);
    }
  }
  if (user.role) {
    roles.add(user.role);
  }

  return sortRoles(roles);
}

export function hasRole(user: Pick<User, 'role' | 'roles'> | null | undefined, role: Role): boolean {
  return getEffectiveRoles(user).includes(role);
}

export function hasAnyRole(user: Pick<User, 'role' | 'roles'> | null | undefined, roles: Role[]): boolean {
  const effective = getEffectiveRoles(user);
  return roles.some((role) => effective.includes(role));
}

export function hasCapability(user: Pick<User, 'role' | 'roles'> | null | undefined, capability: AppCapability): boolean {
  const effective = getEffectiveRoles(user);

  if (effective.includes('LEADER')) {
    return true;
  }

  return CAPABILITY_ROLES[capability].some((role) => effective.includes(role));
}
