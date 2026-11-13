/**
 * Local dev environment loading.
 *
 * `wrangler dev` reads `.dev.vars`, but the Express dev server started by
 * `tsx watch` does not — without this, JWT_SECRET / API keys silently fall
 * back to insecure defaults. Import this module before anything that reads
 * `process.env`.
 *
 * `process.loadEnvFile` never overwrites variables that are already set, so
 * later files only fill in the gaps. The backend-local file is loaded first,
 * which lets it override the repo-root one.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(backendRoot, '..')

const ENV_FILES = [
  resolve(backendRoot, '.dev.vars'),
  resolve(backendRoot, '.env'),
  resolve(repoRoot, '.dev.vars'),
  resolve(repoRoot, '.env'),
]

for (const file of ENV_FILES) {
  if (!existsSync(file)) continue
  try {
    process.loadEnvFile(file)
  } catch (err) {
    console.warn(`[env] Failed to load ${file}:`, (err as Error).message)
  }
}
