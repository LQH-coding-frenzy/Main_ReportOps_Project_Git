import type { Role } from './types';

export const ROLE_CATALOG: Array<{
  role: Role;
  label: string;
  badgeClass: string;
  description: string;
  permissions: string[];
}> = [
  {
    role: 'LEADER',
    label: 'Leader',
    badgeClass: 'badge-primary',
    description: 'Full access toàn hệ thống. Chỉ tài khoản leader chính được giữ role này.',
    permissions: ['Toàn quyền hệ thống', 'Quản lý users/roles/sections', 'Build report và freeze release', 'Điều phối audit/remediation'],
  },
  {
    role: 'ADMIN',
    label: 'Admin',
    badgeClass: 'badge-danger',
    description: 'Quản trị người dùng, roles, sections, audit packs, settings và audit logs.',
    permissions: ['Quản lý users', 'Quản lý roles', 'Quản lý sections', 'Quản lý settings và audit logs'],
  },
  {
    role: 'AUDITOR',
    label: 'Auditor',
    badgeClass: 'badge-warning',
    description: 'Được chạy Lab VMs, Audit Jobs và VM Ops. Đây là role bắt buộc nếu thành viên cần audit.',
    permissions: ['Quản lý Lab VMs', 'Chạy audit jobs', 'Chạy remediation', 'Xem archives và evidence'],
  },
  {
    role: 'MEMBER',
    label: 'Member',
    badgeClass: 'badge-info',
    description: 'Chỉ phụ trách dashboard, guide và editor cho section được giao. Không có quyền audit, VM Ops hoặc Lab.',
    permissions: ['Xem dashboard', 'Mở guide', 'Chỉnh sửa section được giao', 'Theo dõi tiến độ nội dung'],
  },
  {
    role: 'VIEWER',
    label: 'Viewer',
    badgeClass: 'badge-success',
    description: 'Read-only cho reports, releases, audit results và dashboard tổng quan.',
    permissions: ['Xem reports', 'Xem releases', 'Xem audit results', 'Xem dashboard read-only'],
  },
];

export const ROLE_LABEL_MAP = Object.fromEntries(
  ROLE_CATALOG.map((entry) => [entry.role, entry])
) as Record<Role, (typeof ROLE_CATALOG)[number]>;
