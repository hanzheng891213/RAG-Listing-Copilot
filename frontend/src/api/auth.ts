import client from './client'

export interface LoginParams {
  username: string
  password: string
}

export interface UserInfo {
  id: string
  username: string
  role: 'admin' | 'user'
  apiCallCount: number
  createdAt: string
}

export interface AuthResponse {
  token: string
  user: UserInfo
}

export function login(params: LoginParams): Promise<AuthResponse> {
  return client.post('/auth/login', params) as any
}

export function fetchMe(): Promise<UserInfo> {
  return client.get('/auth/me') as any
}

/**
 * Directory of registered accounts, admin only.
 *
 * Empty when the backend is unavailable — the permission page then falls back
 * to the accounts registered in this browser.
 */
export function fetchUsers(): Promise<{ users: UserInfo[] }> {
  return client.get('/auth/users') as any
}
