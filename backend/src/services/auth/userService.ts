/**
 * Durable account directory.
 *
 * D1 is the source of truth in production; the Express dev server (which has no
 * D1 binding) falls back to a process-memory map seeded with the same accounts.
 * That keeps `npm run dev` usable without hiding the real storage contract:
 * every method takes the same shape and production reads/writes D1.
 */

import { ALL_PERMISSIONS, isPermissionKey, type PermissionKey, type User, type UserUpdate } from '../../types/auth.js'
import { SEED_USERS } from './seedUsers.js'

export const USERS_TABLE = 'users'

export class UsernameTakenError extends Error {
  readonly code = 'ERR_USERNAME_TAKEN'

  constructor() {
    super('Username is already registered')
    this.name = 'UsernameTakenError'
  }
}

export class SchemaMissingError extends Error {
  readonly code = 'ERR_DB_SCHEMA'

  constructor() {
    super('The users table is missing. Run: npx wrangler d1 migrations apply rag-listing-copilot --remote')
    this.name = 'SchemaMissingError'
  }
}

function isMissingTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /no such table/i.test(message)
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalisePermissions(value: unknown): PermissionKey[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<PermissionKey>()
  for (const item of value) {
    if (isPermissionKey(item)) seen.add(item)
  }
  return [...seen]
}

function parsePermissions(raw: unknown): PermissionKey[] {
  if (typeof raw !== 'string') return normalisePermissions(raw)
  try {
    return normalisePermissions(JSON.parse(raw))
  } catch {
    return []
  }
}

function rowToUser(row: any): User {
  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    role: row.role === 'admin' ? 'admin' : 'user',
    permissions: parsePermissions(row.permissions),
    disabled: Boolean(row.disabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export class UserService {
  private db: any = null
  private memory = new Map<string, User>()
  private memorySeeded = false

  /** Per-request in the Worker; `undefined` on the Express dev server. */
  bindDatabase(db: any): void {
    this.db = db ?? null
    if (!this.db) this.seedMemory()
  }

  get durable(): boolean {
    return Boolean(this.db)
  }

  private seedMemory(): void {
    if (this.memorySeeded) return
    this.memorySeeded = true
    for (const seed of SEED_USERS) {
      // A test that injects a different admin must not be overwritten.
      if ([...this.memory.values()].some((u) => u.username.toLowerCase() === seed.username.toLowerCase())) {
        continue
      }
      this.memory.set(seed.id, {
        id: seed.id,
        username: seed.username,
        passwordHash: seed.passwordHash,
        role: seed.role,
        permissions: [...seed.permissions],
        disabled: false,
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z',
      })
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    const lower = (username ?? '').trim().toLowerCase()
    if (!lower) return null

    if (this.db) {
      try {
        const row = await this.db
          .prepare(`SELECT * FROM ${USERS_TABLE} WHERE username_lower = ?`)
          .bind(lower)
          .first()
        return row ? rowToUser(row) : null
      } catch (err) {
        if (isMissingTable(err)) throw new SchemaMissingError()
        throw err
      }
    }

    this.seedMemory()
    return [...this.memory.values()].find((u) => u.username.toLowerCase() === lower) ?? null
  }

  async findById(id: string): Promise<User | null> {
    if (!id) return null

    if (this.db) {
      try {
        const row = await this.db
          .prepare(`SELECT * FROM ${USERS_TABLE} WHERE id = ?`)
          .bind(id)
          .first()
        return row ? rowToUser(row) : null
      } catch (err) {
        if (isMissingTable(err)) throw new SchemaMissingError()
        throw err
      }
    }

    this.seedMemory()
    return this.memory.get(id) ?? null
  }

  async list(): Promise<User[]> {
    if (this.db) {
      try {
        const result = await this.db
          .prepare(`SELECT * FROM ${USERS_TABLE} ORDER BY created_at ASC`)
          .all()
        return (result?.results ?? []).map(rowToUser)
      } catch (err) {
        if (isMissingTable(err)) throw new SchemaMissingError()
        throw err
      }
    }
    this.seedMemory()
    return [...this.memory.values()]
  }

  async create(input: {
    username: string
    passwordHash: string
    role?: 'admin' | 'user'
    permissions?: PermissionKey[]
  }): Promise<User> {
    const username = input.username.trim()
    const lower = username.toLowerCase()
    const now = nowIso()
    const user: User = {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      username,
      passwordHash: input.passwordHash,
      role: input.role === 'admin' ? 'admin' : 'user',
      permissions: input.role === 'admin' ? [...ALL_PERMISSIONS] : normalisePermissions(input.permissions),
      disabled: false,
      createdAt: now,
      updatedAt: now,
    }

    if (this.db) {
      try {
        await this.db
          .prepare(
            `INSERT INTO ${USERS_TABLE}
               (id, username, username_lower, password_hash, role, permissions, disabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .bind(
            user.id,
            user.username,
            lower,
            user.passwordHash,
            user.role,
            JSON.stringify(user.permissions),
            user.createdAt,
            user.updatedAt,
          )
          .run()
        return user
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (/unique|constraint/i.test(message)) throw new UsernameTakenError()
        if (isMissingTable(err)) throw new SchemaMissingError()
        throw err
      }
    }

    this.seedMemory()
    if ([...this.memory.values()].some((u) => u.username.toLowerCase() === lower)) {
      throw new UsernameTakenError()
    }
    this.memory.set(user.id, user)
    return user
  }

  async update(id: string, patch: UserUpdate): Promise<User | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const next: User = {
      ...existing,
      role: patch.role === 'admin' || patch.role === 'user' ? patch.role : existing.role,
      permissions:
        patch.permissions !== undefined
          ? normalisePermissions(patch.permissions)
          : existing.permissions,
      disabled: patch.disabled !== undefined ? Boolean(patch.disabled) : existing.disabled,
      updatedAt: nowIso(),
    }
    // Admins always hold every permission; storing a narrower list would only
    // create a second, contradictory source of truth.
    if (next.role === 'admin') next.permissions = [...ALL_PERMISSIONS]
    // Demotion is not a grant. Without this, an admin demoted to user would keep
    // the whole ALL_PERMISSIONS list that was written while they were admin.
    else if (existing.role === 'admin' && patch.permissions === undefined) next.permissions = []

    if (this.db) {
      try {
        await this.db
          .prepare(
            `UPDATE ${USERS_TABLE}
                SET role = ?, permissions = ?, disabled = ?, updated_at = ?
              WHERE id = ?`,
          )
          .bind(
            next.role,
            JSON.stringify(next.permissions),
            next.disabled ? 1 : 0,
            next.updatedAt,
            id,
          )
          .run()
        return next
      } catch (err) {
        if (isMissingTable(err)) throw new SchemaMissingError()
        throw err
      }
    }

    this.seedMemory()
    this.memory.set(id, next)
    return next
  }

  async countActiveAdmins(): Promise<number> {
    const users = await this.list()
    return users.filter((u) => u.role === 'admin' && !u.disabled).length
  }
}

let instance: UserService | null = null

export function getUserService(): UserService {
  if (!instance) instance = new UserService()
  return instance
}

/** Test hook. */
export function resetUserService(): void {
  instance = null
}
