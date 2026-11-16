/**
 * Account and permission shapes shared by the Worker and the Express server.
 *
 * Permissions are enforced server-side (see middleware/authMiddleware.ts and
 * getAuth() in worker.ts). The frontend copy only decides what to render; it is
 * never the gate.
 */

export type PermissionKey =
  | 'productGrid'
  | 'listingGenerator'
  | 'knowledgeBase'
  | 'modelManager'
  | 'finance'

export const ALL_PERMISSIONS: PermissionKey[] = [
  'productGrid',
  'listingGenerator',
  'knowledgeBase',
  'modelManager',
  'finance',
]

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && (ALL_PERMISSIONS as string[]).includes(value)
}

/** Full record as stored in D1 / the dev memory store. Never leaves the server. */
export interface User {
  id: string
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  permissions: PermissionKey[]
  disabled: boolean
  createdAt: string
  updatedAt: string
}

/** What the API returns. Password hashes are stripped by toPublicUser(). */
export interface PublicUser {
  id: string
  username: string
  role: 'admin' | 'user'
  permissions: PermissionKey[]
  disabled: boolean
  createdAt: string
  updatedAt: string
}

export interface JwtPayload {
  userId: string
  username: string
  role: 'admin' | 'user'
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  password: string
}

export interface AuthResponse {
  token: string
  user: PublicUser
}

/** Admin-only user update. Absent fields are left untouched. */
export interface UserUpdate {
  role?: 'admin' | 'user'
  permissions?: PermissionKey[]
  disabled?: boolean
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: user.role === 'admin' ? [...ALL_PERMISSIONS] : [...user.permissions],
    disabled: user.disabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}
