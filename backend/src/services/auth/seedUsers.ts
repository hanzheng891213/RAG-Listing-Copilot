/**
 * Seed accounts.
 *
 * The administrator account is the existing owner account; keeping its username
 * and password means no migration step for the human who already uses it. The
 * plaintext is no longer present anywhere in the repository — only this PBKDF2
 * hash is. The demo visitor keeps the old demo credentials but now lives in D1
 * like every other account.
 *
 * NOTE: migrations/0005_create_users.sql embeds the same two hashes. If you
 * change a seed password here, regenerate that SQL too (see
 * scripts/hash-password.mjs). INSERT OR IGNORE means redeploying never resets a
 * password the owner has since changed.
 */

import { ALL_PERMISSIONS, type PermissionKey } from '../../types/auth.js'

export interface SeedUser {
  id: string
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  permissions: PermissionKey[]
}

export const SEED_USERS: SeedUser[] = [
  {
    id: 'admin-001',
    username: 'hanzheng891213@gmail.com',
    passwordHash:
      'pbkdf2$sha256$60000$jU5id4y6eP/sooT9hkn5qg==$ypLzRxN3hO7wxc/aO0MaUc3SQMetSVWMZx1CbXB3wbE=',
    role: 'admin',
    permissions: [...ALL_PERMISSIONS],
  },
  {
    id: 'visitor-001',
    username: 'O_O@visitor.com',
    passwordHash:
      'pbkdf2$sha256$60000$RQXshVYijb1uoFKjK/s/sA==$UzIuSj7wfBKZ6Az9AeEIZMCYCwY0d8WOvza0rdnK0Jc=',
    role: 'user',
    permissions: ['productGrid', 'listingGenerator', 'knowledgeBase'],
  },
]
