import { Role } from '@prisma/client';

export const PRIMARY_LEADER_GITHUB_USERNAME = 'LQH-coding-frenzy';

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

type UserLike = {
  githubUsername?: string | null;
  role?: Role | null;
  roles?: Role[] | null;
};

const CAPABILITY_ROLES: Record<AppCapability, Role[]> = {
  admin_panel: [Role.LEADER, Role.ADMIN],
  manage_users: [Role.LEADER, Role.ADMIN],
  manage_roles: [Role.LEADER, Role.ADMIN],
  manage_sections: [Role.LEADER, Role.ADMIN],
  manage_settings: [Role.LEADER, Role.ADMIN],
  view_audit_logs: [Role.LEADER, Role.ADMIN],
  manage_audit_packs: [Role.LEADER, Role.ADMIN, Role.AUDITOR],
  run_audits: [Role.LEADER, Role.ADMIN, Role.AUDITOR],
  run_remediation: [Role.LEADER, Role.ADMIN, Role.AUDITOR],
  manage_lab: [Role.LEADER, Role.ADMIN, Role.AUDITOR],
  use_lab_ssh: [Role.LEADER, Role.ADMIN, Role.AUDITOR],
  view_archive: [Role.LEADER, Role.ADMIN, Role.AUDITOR, Role.VIEWER],
  view_reports: [Role.LEADER, Role.ADMIN, Role.VIEWER],
  manage_reports: [Role.LEADER, Role.ADMIN],
  view_releases: [Role.LEADER, Role.ADMIN, Role.VIEWER],
  manage_releases: [Role.LEADER, Role.ADMIN],
  view_performance: [Role.LEADER, Role.ADMIN],
};

const ROLE_PRIORITY: Role[] = [Role.LEADER, Role.ADMIN, Role.AUDITOR, Role.MEMBER, Role.VIEWER];

function sortRoles(roles: Iterable<Role>): Role[] {
  return Array.from(new Set(roles)).sort((left, right) => ROLE_PRIORITY.indexOf(left) - ROLE_PRIORITY.indexOf(right));
}

export function getEffectiveRoles(user: UserLike | null | undefined): Role[] {
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

  if (user.githubUsername === PRIMARY_LEADER_GITHUB_USERNAME) {
    roles.add(Role.LEADER);
  }

  if (roles.size === 0) {
    roles.add(Role.MEMBER);
  }

  return sortRoles(roles);
}

export function normalizeAssignableRoles(githubUsername: string, roles: Role[]): Role[] {
  if (githubUsername === PRIMARY_LEADER_GITHUB_USERNAME) {
    return [Role.LEADER];
  }

  const normalized = new Set<Role>(roles.filter((role) => role !== Role.LEADER));

  if (normalized.size === 0) {
    normalized.add(Role.MEMBER);
  }

  return sortRoles(normalized);
}

export function hasRole(user: UserLike | null | undefined, role: Role): boolean {
  return getEffectiveRoles(user).includes(role);
}

export function hasAnyRole(user: UserLike | null | undefined, roles: Role[]): boolean {
  const effective = getEffectiveRoles(user);
  return roles.some((role) => effective.includes(role));
}

export function hasCapability(user: UserLike | null | undefined, capability: AppCapability): boolean {
  const effective = getEffectiveRoles(user);

  if (effective.includes(Role.LEADER)) {
    return true;
  }

  return CAPABILITY_ROLES[capability].some((role) => effective.includes(role));
}
