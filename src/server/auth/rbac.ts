import type { Role } from '@/server/db/schema';

export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读',
};

export function can(role: Role | undefined | null, min: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function isAdmin(role: Role | undefined | null): boolean {
  return can(role, 'admin');
}

export function isWriter(role: Role | undefined | null): boolean {
  return can(role, 'member');
}
