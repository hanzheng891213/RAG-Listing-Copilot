import client from './client'

export type PermissionKey =
  | 'productGrid'
  | 'listingGenerator'
  | 'knowledgeBase'
  | 'modelManager'
  | 'finance'

export interface LoginParams {
  username: string
  password: string
}

export interface RegisterParams {
  username: string
  password: string
}

export interface UserInfo {
  id: string
  username: string
  role: 'admin' | 'user'
  permissions: PermissionKey[]
  disabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  token: string
  user: UserInfo
}

export function login(params: LoginParams): Promise<AuthResponse> {
  return client.post('/auth/login', params) as any
}

export function register(params: RegisterParams): Promise<AuthResponse> {
  return client.post('/auth/register', params) as any
}

export function fetchMe(): Promise<UserInfo> {
  return client.get('/auth/me') as any
}

/** Admin-only account directory. */
export function fetchUsers(): Promise<{ users: UserInfo[] }> {
  return client.get('/auth/users') as any
}

/** Admin-only role / permission / disabled update. */
export function updateUser(
  id: string,
  patch: { role?: 'admin' | 'user'; permissions?: PermissionKey[]; disabled?: boolean },
): Promise<{ user: UserInfo }> {
  return client.patch(`/auth/users/${encodeURIComponent(id)}`, patch) as any
}
