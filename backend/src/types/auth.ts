export interface User {
  id: string
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  apiCallCount: number
  createdAt: string
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

export interface AuthResponse {
  token: string
  user: Omit<User, 'passwordHash'>
}

export interface AdminSettings {
  deepseekApiKey: string
  modelName: string
  temperature: number
  maxTokens: number
}
